import Aedes from 'aedes';
import { createServer as createNetServer } from 'net';
import { createHash } from 'crypto';
import { pickupConfig } from './config-store.js';

// ─── MQTT 内存状态 ────────────────────────────────────────────────────────
const mqttClients = new Map();
// 内存缓存 MQTT 传感器推送日志（最近 100 条）
const mqttSensorLogs = [];
// ★ 诊断用：记录所有 MQTT Topic 消息（最近 200 条），相当于 mosquitto_sub -t "#" -v
const mqttAllTopicLogs = [];
// ★ 诊断用：追踪在线 MQTT 客户端列表
const mqttClientList = new Map(); // clientId → { sn, isGateway, connectedAt, lastTopic, lastPayload, msgCount }

// ★★★ 设备重量缓存：key=deviceIdentifier(IP/SN/clientId), value={ weight, unit, timestamp, source }
// VectorMaterial 等接口从此缓存获取最新重量返回给设备
const deviceWeightCache = new Map();
const DEVICE_WEIGHT_CACHE_TTL = 2 * 60 * 1000; // 2分钟过期，因为秤是实时数据

// ★★★ 设备会话重量：key=deviceSn, value={ initialWeight, currentWeight, timestamp }
// get-main-device / meal-current 接口从此获取实时重量，计算实际营养值
// initialWeight 首次上报时设置（托盘放上秤的初始重量），currentWeight 每次上报更新
const deviceSessionWeights = new Map();
const SESSION_WEIGHT_TTL = 10 * 60 * 1000; // 会话重量 10 分钟过期（一顿饭的时间）

// 定期清理过期重量缓存
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of deviceWeightCache) {
    if (now - val.timestamp > DEVICE_WEIGHT_CACHE_TTL) {
      deviceWeightCache.delete(key);
    }
  }
  for (const [key, val] of deviceSessionWeights) {
    if (now - val.timestamp > SESSION_WEIGHT_TTL) {
      deviceSessionWeights.delete(key);
    }
  }
}, 30 * 1000);

function cacheDeviceWeight(identifier, weight, unit, source) {
  if (weight == null || isNaN(weight) || weight < 0) return;
  const prev = deviceWeightCache.get(identifier);
  deviceWeightCache.set(identifier, {
    weight: Number(weight),
    unit: unit || 'kg',
    timestamp: Date.now(),
    source: source || 'mqtt',
  });
  console.log('[ScaleInbound-WeightCache] ★ 缓存重量: ' + identifier + ' → ' + weight + (unit || 'kg') + ' (来源:' + (source || 'mqtt') + ')' + (prev ? ' [覆盖旧值:' + prev.weight + prev.unit + ']' : ' [新增]'));
}

function getLatestDeviceWeight(identifier) {
  const entry = deviceWeightCache.get(identifier);
  if (!entry || Date.now() - entry.timestamp > DEVICE_WEIGHT_CACHE_TTL) {
    deviceWeightCache.delete(identifier);
    return null;
  }
  return entry;
}

function getLatestWeightForAnyDevice() {
  let best = null;
  const now = Date.now();
  for (const [key, val] of deviceWeightCache) {
    if (now - val.timestamp > DEVICE_WEIGHT_CACHE_TTL) {
      deviceWeightCache.delete(key);
      continue;
    }
    if (!best || val.timestamp > best.timestamp) best = val;
  }
  return best;
}

// ★★★ 会话重量：追踪每个设备的托盘初始重量和当前重量 ★★★
// 核心原则：initialWeight 是"放盘完成时的稳定重量"，一旦确定就不轻易改变
// 只有检测到大幅增重（>300g 且与上次读数比）才判定为"换了托盘/厨师加菜"并重置
// 日常的传感器漂移、轻微波动都只更新 currentWeight，绝不覆盖 initialWeight
function updateDeviceSessionWeight(sn, weight) {
  if (!sn || weight == null || isNaN(weight) || weight <= 0) return;

  // ★ 归一化 SN：统一提取短号，避免不同调用方用不同格式 key 导致 session 查不到
  const lookupSn = normalizeSnForSession(sn);

  // ★ 精确查找 + 兜底模糊查找（session 可能被其他 handler 用不同 key 格式写入）
  let existing = deviceSessionWeights.get(lookupSn);
  if (!existing) {
    for (const [key, val] of deviceSessionWeights) {
      if (key.includes(lookupSn) || lookupSn.includes(key)) {
        existing = val;
        if (key !== lookupSn) {
          console.log('[ScaleInbound-SessionWeight] ★ key映射: 传入"' + lookupSn + '" → 命中已存在key="' + key + '"');
        }
        break;
      }
    }
  }

  if (!existing) {
    // 首次记录：设定初始重量，mealWeight=0, lastDropWeight=0
    deviceSessionWeights.set(lookupSn, {
      initialWeight: weight,
      currentWeight: weight,
      mealWeight: 0,
      lastDropWeight: 0,
      timestamp: Date.now(),
    });
    console.log('[ScaleInbound-SessionWeight] ★ 首次记录: ' + lookupSn + ' → initial=' + weight + 'g, mealWeight=0g');
    return;
  }

  // ─── Session 已存在，核心逻辑：绝不轻易覆盖 initialWeight ───
  const oldCurrent = existing.currentWeight;
  const oldMealWeight = existing.mealWeight || 0;
  const deltaFromCurrent = weight - oldCurrent;
  const deltaFromInitial = weight - existing.initialWeight;

  // 情况1: 重量下降 ≥ 1g（过滤浮点噪声）→ 有人取餐，累加 mealWeight
  if (weight < oldCurrent && Math.abs(deltaFromCurrent) >= 1) {
    const drop = oldCurrent - weight;
    existing.mealWeight = oldMealWeight + drop;
    existing.lastDropWeight = drop;
    console.log('[ScaleInbound-SessionWeight] ★ 检测到取餐: ' + lookupSn + ' ' + oldCurrent + 'g → ' + weight + 'g (减少' + Math.round(drop * 10) / 10 + 'g), 累加 mealWeight=' + Math.round(existing.mealWeight * 10) / 10 + 'g, 最近取餐=' + Math.round(drop * 10) / 10 + 'g');
  }
  // 情况2: 重量突然暴增 >300g（对比上次读数）→ 换了托盘/厨师加菜，此时才重置
  else if (deltaFromCurrent > 300) {
    console.log('[ScaleInbound-SessionWeight] 检测到大幅增重(>300g, 判定换盘/加菜): ' + lookupSn + ' ' + oldCurrent + 'g → ' + weight + 'g (+' + Math.round(deltaFromCurrent) + 'g), 重置初始重量');
    existing.initialWeight = weight;
    existing.mealWeight = 0;
    existing.lastDropWeight = 0;
  }
  // 情况3: 稳定或轻微波动（上升 ≤300g 或不变）→ 只更新 currentWeight
  // initialWeight 保持不动！这才是关键——不能因为传感器漂移就把初始重量覆盖了
  else {
    if (Math.abs(deltaFromCurrent) >= 1) {
      console.log('[ScaleInbound-SessionWeight] 轻微波动: ' + lookupSn + ' ' + oldCurrent + 'g → ' + weight + 'g (Δ=' + (deltaFromCurrent > 0 ? '+' : '') + Math.round(deltaFromCurrent * 10) / 10 + 'g), initialWeight保持=' + existing.initialWeight + 'g, mealWeight保持=' + Math.round(oldMealWeight * 10) / 10 + 'g');
    }
  }

  existing.currentWeight = weight;
  existing.timestamp = Date.now();
}

// ★ 规范化 SN：支持 "device@merchant@SN" 和纯 SN 两种格式，互相查找
function normalizeSnForSession(sn) {
  if (!sn) return '';
  // 如果是完整格式 "device@1000000001@3000004157"，提取短 SN
  const parts = sn.split('@');
  return parts.length >= 3 ? parts[parts.length - 1] : sn;
}

function getDeviceSessionWeight(sn) {
  if (!sn) return { initialWeight: 0, currentWeight: 0, mealWeight: 0, lastDropWeight: 0 };

  // 1. 先精确匹配
  let entry = deviceSessionWeights.get(sn);

  // 2. 短SN兜底：从完整 SN「device@merchant@SHORT」提取尾部 SHORT 再查
  if (!entry && sn.includes('@')) {
    const shortSn = normalizeSnForSession(sn); // 取最后 @ 之后的部分
    if (shortSn && shortSn !== sn) {
      entry = deviceSessionWeights.get(shortSn);
      if (entry) {
        console.log('[getDeviceSessionWeight] ★ 短SN命中: ' + sn + ' → ' + shortSn + ', mealWeight=' + (entry.mealWeight || 0));
      }
    }
  }

  // 3. 反向兜底：传入的是短SN，Session 里存的是长号
  if (!entry && !sn.includes('@')) {
    for (const [key, val] of deviceSessionWeights) {
      // key 是 "device@xxx@SHORT"，sn 是 "SHORT"
      if (key.endsWith('@' + sn) || key.includes('@' + sn + '@')) {
        entry = val;
        console.log('[getDeviceSessionWeight] ★ 反向长SN命中: 短=' + sn + ' → 长=' + key + ', mealWeight=' + (val.mealWeight || 0));
        break;
      }
    }
  }

  // 4. 包含匹配兜底（最宽松）
  if (!entry) {
    for (const [key, val] of deviceSessionWeights) {
      if (key.includes(sn) || sn.includes(key)) {
        entry = val;
        break;
      }
    }
  }

  if (!entry) return { initialWeight: 0, currentWeight: 0, mealWeight: 0, lastDropWeight: 0 };
  // ★★★ 修复：直接使用 Session 中累积的 mealWeight，不再用 initialWeight - currentWeight 重复计算
  return {
    initialWeight: entry.initialWeight,
    currentWeight: entry.currentWeight,
    mealWeight: Math.round((entry.mealWeight || 0) * 10) / 10,
    lastDropWeight: Math.round((entry.lastDropWeight || 0) * 10) / 10,
  };
}

// ★★★ 设备级重量历史：key=deviceSn, value={ weight(g), timestamp }
// 用于兼容"上报绝对重量"和"上报变化量"两种设备，实现设备无关的取餐判定
const deviceWeightHistory = new Map();

// ★★★ SQLite 持久化：启动时恢复、每次更新时同步保存，重启不丢
let weightHistoryDbQuery = null;
function initWeightHistoryPersistence(dbQuery) {
  weightHistoryDbQuery = dbQuery;
  if (!dbQuery) return;
  try {
    dbQuery("CREATE TABLE IF NOT EXISTS device_weight_history (device_sn TEXT PRIMARY KEY, last_weight REAL NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))", []);
    const rows = dbQuery("SELECT device_sn, last_weight FROM device_weight_history", []);
    if (rows && rows.length > 0) {
      let loaded = 0;
      rows.forEach(r => {
        const w = Number(r.last_weight || 0);
        if (w > 0) {
          deviceWeightHistory.set(r.device_sn, { weight: w, timestamp: Date.now() });
          loaded++;
        }
      });
      if (loaded > 0) console.log('[WeightHistory] 从 SQLite 恢复 ' + loaded + ' 条设备重量历史');
    }
  } catch (e) { console.warn('[WeightHistory] 初始化失败:', e.message); }
}
function persistWeightHistory(deviceSn, weightVal) {
  if (!weightHistoryDbQuery || !deviceSn) return;
  try {
    weightHistoryDbQuery("INSERT OR REPLACE INTO device_weight_history (device_sn, last_weight, updated_at) VALUES (?, ?, datetime('now','localtime'))", [deviceSn, weightVal]);
  } catch (e) {}
}

// ★★★ 稳定基线取餐检测（解决"渐进式取餐"：绝对重量设备每次只降1g、慢慢舀菜）
// 核心思路：不再跟"上一次上报"比（那只差1g），而是跟"稳定基线"比累计变化量。
//   - 重量持续下降：记录本次下降的最低点（minWeight）
//   - 重量回升（delta>0）：说明之前的下滑是噪声/抖动，重置基线
//   - 重量停止下降并稳定一段时间：判定一次取餐结束，取餐量 = 基线 - 最低点
const deviceStableBaselines = new Map();
// ★★★ 取餐判定参数已改为可配置（见 config-store.pickupConfig，后台「系统设置」可改）
//   - stableSeconds：重量停止下降多少秒视为"一次取餐结束"（默认 3 秒）
//   - minDropGrams：最小取餐量（g），低于此不记录（默认 50g）
const PICKUP_STALE_MS = 30 * 60 * 1000; // 30 分钟无上报视为陈旧，重置基线

function trackStableBaseline(sn, weight) {
  const now = Date.now();
  let s = deviceStableBaselines.get(sn);

  // 首次记录或数据已陈旧：以当前重量建立基线
  if (!s || now - (s.updatedAt || 0) > PICKUP_STALE_MS) {
    deviceStableBaselines.set(sn, {
      baseline: weight, minWeight: weight, lastWeight: weight,
      dropping: false, lastDropTime: 0, updatedAt: now,
    });
    return { drop: 0, baseline: weight, minWeight: weight };
  }

  const delta = weight - s.lastWeight;
  let result = { drop: 0, baseline: s.baseline, minWeight: s.minWeight };

  if (delta < 0) {
    // 重量在下降：更新最低点，标记"取餐进行中"
    s.dropping = true;
    s.lastDropTime = now;
    s.minWeight = Math.min(s.minWeight, weight);
  } else if (delta > 0) {
    // 重量回升：之前的下滑是抖动/噪声，取消，重置基线
    s.dropping = false;
    s.baseline = weight;
    s.minWeight = weight;
    s.lastDropTime = 0;
  } else {
    // 重量稳定（delta==0）：若之前在下滑且已稳定足够久 → 一次取餐结束
    if (s.dropping && now - s.lastDropTime > pickupConfig.stableSeconds * 1000) {
      const drop = Math.round((s.baseline - s.minWeight) * 10) / 10;
      if (drop > pickupConfig.minDropGrams) {
        result = { drop, baseline: s.baseline, minWeight: s.minWeight };
      }
      s.dropping = false;
      s.baseline = weight;
      s.minWeight = weight;
      s.lastDropTime = 0;
    }
  }

  s.lastWeight = weight;
  s.updatedAt = now;
  return result;
}

// ★★★ 菜品名智能解析（多级兜底）
// 优先级: payload.menuName → 设备绑定站点 → menuId查菜品库(product_items/dish_nutrition/tray_stations/缓存/电子屏选菜) → 近2小时电子屏选菜 → 未知菜品
// 返回 { dishName, category, stationId, stationCode, productId, resolved }
function resolveDishNameSmart(dbQuery, { machineSn, deviceSn, menuId, menuName }) {
  const result = { dishName: '', category: '', stationId: null, stationCode: '', productId: null, resolved: false };
  if (!dbQuery) { result.dishName = '未知菜品'; result.category = '荤菜'; return result; }
  const sn = machineSn || deviceSn || '';
  const mid = Number(menuId || 0);

  // 1) payload 直接带 menuName（最可信）
  const mn = menuName != null ? String(menuName).trim() : '';
  if (mn && mn !== '未知菜品' && mn !== '未命名菜品') {
    result.dishName = mn; result.resolved = true;
  }

  // 2) 设备 → 绑定站点（拿 stationId/stationCode/productId，若还没菜名再补菜名）
  if (sn) {
    try {
      const devRows = dbQuery('SELECT station_id FROM tray_display_devices WHERE sn = ?', [sn]);
      if (devRows && devRows.length > 0 && devRows[0].station_id) {
        result.stationId = devRows[0].station_id;
        const stRows = dbQuery('SELECT * FROM tray_stations WHERE id = ?', [result.stationId]);
        if (stRows && stRows.length > 0) {
          const st = stRows[0];
          result.stationCode = st.station_code || '';
          result.productId = st.product_item_id || null;
          if (!result.dishName && st.dish_name && st.dish_name !== '未命名菜品' && st.dish_name !== '未知菜品') {
            result.dishName = st.dish_name; result.category = st.category || ''; result.resolved = true;
          }
        }
      }
    } catch (e) {}
  }

  // 3) menuId 查菜品库（用户明确要求）
  if (!result.dishName && mid > 0) {
    // 3a) product_items.id
    try {
      const pr = dbQuery('SELECT id, name FROM product_items WHERE id = ?', [mid]);
      if (pr && pr.length > 0) { result.dishName = pr[0].name; result.productId = pr[0].id; result.resolved = true; }
    } catch (e) {}
    // 3b) dish_nutrition.id
    if (!result.dishName) {
      try {
        const dn = dbQuery('SELECT id, dish_name, category FROM dish_nutrition WHERE id = ?', [mid]);
        if (dn && dn.length > 0 && dn[0].dish_name) { result.dishName = dn[0].dish_name; result.category = dn[0].category || result.category; result.resolved = true; }
      } catch (e) {}
    }
    // 3c) tray_stations.product_item_id
    if (!result.dishName) {
      try {
        const ts = dbQuery("SELECT dish_name, category FROM tray_stations WHERE product_item_id = ? AND dish_name IS NOT NULL AND dish_name != '' LIMIT 1", [mid]);
        if (ts && ts.length > 0 && ts[0].dish_name) { result.dishName = ts[0].dish_name; result.category = ts[0].category || result.category; result.resolved = true; }
      } catch (e) {}
    }
    // 3d) device_dish_cache.dish_id（历史缓存的 menuId→菜名映射）
    if (!result.dishName) {
      try {
        const dc = dbQuery('SELECT dish_name FROM device_dish_cache WHERE dish_id = ? LIMIT 1', [mid]);
        if (dc && dc.length > 0 && dc[0].dish_name) { result.dishName = dc[0].dish_name; result.resolved = true; }
      } catch (e) {}
    }
    // 3e) dish_order_records.dish_id（电子屏历史选菜）
    if (!result.dishName) {
      try {
        const orr = dbQuery('SELECT dish_name, category FROM dish_order_records WHERE dish_id = ? ORDER BY id DESC LIMIT 1', [mid]);
        if (orr && orr.length > 0 && orr[0].dish_name) { result.dishName = orr[0].dish_name; result.category = orr[0].category || result.category; result.resolved = true; }
      } catch (e) {}
    }
  }

  // 4) 该设备最近缓存的选菜
  if (!result.dishName && sn) {
    try {
      const dc = dbQuery('SELECT dish_name, category FROM device_dish_cache WHERE device_sn = ? LIMIT 1', [sn]);
      if (dc && dc.length > 0 && dc[0].dish_name) { result.dishName = dc[0].dish_name; result.category = dc[0].category || result.category; result.resolved = true; }
    } catch (e) {}
  }

  // 5) 近2小时电子屏选菜兜底（餐厅刚在乐牛屏上选的菜；限制时间避免用陈旧数据）
  if (!result.dishName) {
    try {
      const recent = dbQuery("SELECT dish_name, category FROM dish_order_records WHERE created_at >= datetime('now','-2 hours') ORDER BY id DESC LIMIT 1", []);
      if (recent && recent.length > 0 && recent[0].dish_name) { result.dishName = recent[0].dish_name; result.category = recent[0].category || result.category; result.resolved = true; }
    } catch (e) {}
  }

  if (!result.dishName) { result.dishName = '未知菜品'; }
  if (!result.category) { result.category = '荤菜'; }
  return result;
}

// ★ 缓存 menuId→菜名 映射，便于后续同一 menuId 快速解析
function cacheMenuIdDish(dbQuery, deviceSn, menuId, dishName, category) {
  if (!dbQuery) return;
  const mid = Number(menuId || 0);
  if (mid <= 0 || !dishName || dishName === '未知菜品') return;
  try {
    dbQuery("CREATE TABLE IF NOT EXISTS device_dish_cache (device_sn TEXT PRIMARY KEY, station_id INTEGER, dish_id INTEGER NOT NULL, dish_name TEXT NOT NULL, category TEXT DEFAULT '', dish_data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))", []);
    dbQuery("INSERT OR REPLACE INTO device_dish_cache (device_sn, station_id, dish_id, dish_name, category, dish_data, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))", [deviceSn || String(mid), null, mid, dishName, category || '', JSON.stringify({ category: category || '' })]);
  } catch (e) {}
}

// ─── 辅助函数：记录 MQTT 传感器日志 ───────────────────────────────────────
function pushMqttSensorLog(sensorId, topic, payload, status, msg) {
  const entry = {
    id: `mqtt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sensorId,
    topic,
    payload,
    status, // 'ok' | 'error'
    msg,
    time: new Date().toLocaleTimeString('zh-CN'),
    timestamp: Date.now(),
  };
  mqttSensorLogs.unshift(entry);
  if (mqttSensorLogs.length > 100) mqttSensorLogs.pop();
  console.log(`[MQTT Sensor Log] ${sensorId}: ${msg}`);
}

function getMqttSensorLogs(since = 0) {
  return mqttSensorLogs.filter((l) => l.timestamp >= since);
}

// ─── MQTT Broker ──────────────────────────────────────────────────────────
// helpers: { writeSensorReading, fetchActiveProductItems, updateDeviceStatus,
//            generateToken, resolveStationProductId, tokenMap }
async function startMqttBroker(preferredPort, dbQuery, supabaseUrl, supabaseAnonKey, helpers) {
  const {
    writeSensorReading,
    fetchActiveProductItems,
    updateDeviceStatus,
    generateToken,
    resolveStationProductId,
    tokenMap,
    trayWeightCallback,
  } = helpers;

  const aedes = new Aedes();

  // ★★★ 初始化重量历史持久化（从 SQLite 恢复上次稳定重量，重启不丢）
  initWeightHistoryPersistence(dbQuery);

  // 认证：username = SN, password = hw_key
  aedes.authenticate = async (client, username, password, callback) => {
    // 允许无凭证连接
    if (!username) {
      console.log(`[MQTT] 匿名连接: clientId=${client?.id || 'unknown'}`);
      callback(null, true);
      return;
    }
    if (!password) {
      callback(null, false);
      return;
    }
    const userStr = username.toString();
    const pwdStr = password.toString();

    // ─── 厂商规范：Username = backDevice@{merchantId}@{gatewaySn}，Password = {gatewaySn} ───
    const backDeviceMatch = userStr.match(/^backDevice@(.+)@(.+)$/);
    if (backDeviceMatch) {
      const merchantId = backDeviceMatch[1];
      const gatewaySn = backDeviceMatch[2];
      if (pwdStr === gatewaySn) {
        mqttClients.set(client.id, { sn: gatewaySn, key: pwdStr, merchantId, clientId: client.id, isGateway: true });
        mqttClientList.set(client.id, { sn: gatewaySn, isGateway: true, connectedAt: new Date().toISOString(), lastTopic: '', lastPayload: null, msgCount: 0, status: 'connected' });
        callback(null, true);
        console.log(`[MQTT] 网关认证成功(内存): merchantId=${merchantId}, gatewaySn=${gatewaySn}`);
        return;
      }
      callback(null, false);
      return;
    }

    // ─── 旧版兼容：username = SN, password = hw_key ───
    const sn = userStr;
    const key = pwdStr;

    if (dbQuery) {
      const rows = dbQuery(
        'SELECT id, device_type FROM tray_display_devices WHERE sn = ?',
        [sn]
      );
      if (!rows || rows.length === 0) {
        const now = new Date().toISOString();
        dbQuery(
          "INSERT OR IGNORE INTO tray_display_devices (name, sn, hw_key, status, device_type, created_at, updated_at) VALUES (?, ?, ?, 'online', 'display_scale', ?, ?)",
          [sn, sn, key, now, now]
        );
        dbQuery("UPDATE tray_display_devices SET status = 'online', hw_key = ?, updated_at = ? WHERE sn = ?", [key, now, sn]);
        console.log(`[MQTT] 自动注册/更新电子屏设备: SN=${sn}, key=${key}`);
      } else if (rows[0].device_type === 'gateway') {
        mqttClients.set(client.id, { sn, key, clientId: client.id, isGateway: true });
        callback(null, true);
        console.log(`[MQTT] 网关设备(旧版)认证成功(内存): SN=${sn}`);
        return;
      }
    }

    // ★★★ 新APK兼容：宽松认证策略
    // 1. 精确匹配 hw_key
    // 2. 设备存在但hw_key为空 → 允许连接并更新key
    // 3. 设备不存在 → 自动创建并允许连接
    let valid = false;
    let existingDevice = null;
    if (dbQuery) {
      const rows = dbQuery(
        'SELECT id, hw_key FROM tray_display_devices WHERE sn = ?',
        [sn]
      );
      if (rows && rows.length > 0) {
        existingDevice = rows[0];
        const storedKey = rows[0].hw_key || '';
        if (storedKey === key || storedKey === '') {
          // 精确匹配，或者数据库key为空（允许任何password）
          valid = true;
          if (storedKey === '' && key) {
            // 更新key
            try {
              dbQuery('UPDATE tray_display_devices SET hw_key = ?, updated_at = ? WHERE sn = ?', [key, new Date().toISOString(), sn]);
              console.log(`[MQTT] 更新设备key: SN=${sn}, newKey=${key}`);
            } catch (e) {}
          }
        } else {
          // key不匹配，但仍然允许连接（宽松模式，防止新APK因密钥格式不一致被拒）
          // 同时更新数据库key以匹配新APK发送的key
          valid = true;
          try {
            dbQuery('UPDATE tray_display_devices SET hw_key = ?, updated_at = ? WHERE sn = ?', [key, new Date().toISOString(), sn]);
            console.log(`[MQTT] ★ 宽松认证: SN=${sn}, 旧key="${storedKey}", 新key="${key}", 已更新`);
          } catch (e) {}
        }
      } else {
        // 设备不存在，自动注册并允许连接
        valid = true;
        console.log(`[MQTT] 设备未注册，自动创建: SN=${sn}`);
      }
    } else {
      // 没有dbQuery，允许所有连接
      valid = true;
    }

    if (valid) {
      mqttClients.set(client.id, { sn, key, clientId: client.id });
      mqttClientList.set(client.id, { sn, isGateway: false, connectedAt: new Date().toISOString(), lastTopic: '', lastPayload: null, msgCount: 0, status: 'connected' });
      callback(null, true);
      console.log(`[MQTT] ★ 设备认证通过: SN=${sn}, clientId=${client.id}`);
    } else {
      callback(null, false);
      console.log(`[MQTT] 设备认证失败: SN=${sn}`);
    }
  };

  aedes.on('clientDisconnect', (client) => {
    mqttClients.delete(client.id);
    if (mqttClientList.has(client.id)) {
      const info = mqttClientList.get(client.id);
      info.disconnectedAt = new Date().toISOString();
      info.status = 'disconnected';
      console.log(`[MQTT-DIAG] 客户端断开: clientId=${client.id}, sn=${info.sn || 'unknown'}, 在线时长=${info.connectedAt ? Math.round((Date.now() - new Date(info.connectedAt).getTime()) / 1000) : '?'}s`);
    }
  });

  aedes.on('publish', async (packet, client) => {
    // ★★★ 诊断：全量 Topic 消息追踪（最近 200 条），相当于 mosquitto_sub -t "#" -v ★★★
    const rawTopic = String(packet.topic || '');
    let rawPayloadStr = '';
    try { rawPayloadStr = String(packet.payload || '').slice(0, 1000); } catch { rawPayloadStr = '(binary)'; }
    // ★★★ 诊断增强：重量相关 Topic 醒目日志（排查 MQTT 消息是否到达）★★★
    if (rawTopic.includes('weight') || rawTopic.includes('Weight') || rawTopic.includes('weigh') || rawTopic.includes('Weigh')) {
      console.log('═══════════════════════════════════════════════════');
      console.log('[MQTT-DIAG-RECV] ★ 收到重量相关Topic消息!');
      console.log('[MQTT-DIAG-RECV] topic: ' + rawTopic);
      console.log('[MQTT-DIAG-RECV] clientId: ' + (client?.id || '(无client-可能是retain消息)'));
      console.log('[MQTT-DIAG-RECV] qos: ' + packet.qos + ', retain: ' + packet.retain);
      console.log('[MQTT-DIAG-RECV] payload前200字符: ' + rawPayloadStr.slice(0, 200));
      if (!client) {
        console.log('[MQTT-DIAG-RECV] ⚠️ 此消息无client! 可能是retained消息重放或外部Broker转发');
        console.log('[MQTT-DIAG-RECV] ⚠️ 如果设备实际在另一个MQTT Broker上, 本服务不会收到实时消息!');
      }
      console.log('═══════════════════════════════════════════════════');
    }
    const allTopicEntry = {
      id: `all_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      topic: rawTopic,
      payloadPreview: rawPayloadStr.slice(0, 300),
      payloadLen: rawPayloadStr.length,
      clientId: client?.id || 'unknown',
      qos: packet.qos,
      retain: packet.retain,
      time: new Date().toLocaleTimeString('zh-CN'),
      timestamp: Date.now(),
    };
    mqttAllTopicLogs.unshift(allTopicEntry);
    if (mqttAllTopicLogs.length > 200) mqttAllTopicLogs.pop();
    if (client?.id && mqttClientList.has(client.id)) {
      const ci = mqttClientList.get(client.id);
      ci.lastTopic = rawTopic;
      ci.lastPayload = rawPayloadStr.slice(0, 200);
      ci.msgCount = (ci.msgCount || 0) + 1;
      ci.lastSeenAt = new Date().toISOString();
    }

    if (!client) return;

    // ─── 厂商规范：传感器数据推送处理 ───
    const gwSensorMatch = packet.topic.match(/^back-device-iot-sensor\/([^/]+)\/([^/]+)$/);
    if (gwSensorMatch) {
      const merchantId = gwSensorMatch[1];
      const gatewaySn = gwSensorMatch[2];
      let rawGw = null;
      try {
        rawGw = JSON.parse(packet.payload.toString());
        const { gateWaySn, sendTime, subDeviceSensorInfoList } = rawGw;
        console.log(`[MQTT GW] 收到: merchantId=${merchantId}, gatewaySn=${gatewaySn}, gateWaySn=${gateWaySn}, subDevices=${subDeviceSensorInfoList?.length || 0}`);

        const CHECKITEM_MAP = {
          temperature: 'temp',
          humidity: 'humidity',
          TVOC: 'tvoc',
          CO: 'co',
          CH4: 'ch4',
          SOOT: 'soot',
          alarm: 'alarm',
          cumulativeFlow: 'cumulative_flow',
          totalPower: 'total_power',
          aCurrent: 'a_current',
          bCurrent: 'b_current',
          cCurrent: 'c_current',
          meterStatus: 'meter_status',
        };

        if (Array.isArray(subDeviceSensorInfoList)) {
          for (const subDevice of subDeviceSensorInfoList) {
            const { deviceSn, deviceType, deviceStatus, sensorDataList } = subDevice;
            if (!Array.isArray(sensorDataList) || sensorDataList.length === 0) continue;

            const flatPayload = {};
            for (const sd of sensorDataList) {
              const mappedKey = CHECKITEM_MAP[sd.checkItem] || sd.checkItem;
              const numVal = parseFloat(sd.value);
              if (!isNaN(numVal)) {
                flatPayload[mappedKey] = numVal;
              } else {
                flatPayload[mappedKey] = sd.value;
              }
            }

            const sensorId = deviceSn || 'unknown';
            const keys = Object.keys(flatPayload);
            console.log(`[MQTT GW] 传感器: deviceSn=${deviceSn}, deviceType=${deviceType}, keys=${keys.join(',')}`);
            await writeSensorReading(supabaseUrl, supabaseAnonKey, sensorId, flatPayload, dbQuery);
            pushMqttSensorLog(sensorId, packet.topic, flatPayload, 'ok', `GW${gatewaySn}/${deviceSn} keys=${keys.join(',')}`);
          }
        }
      } catch (err) {
        console.error(`[MQTT GW] 解析失败 merchantId=${merchantId} gatewaySn=${gatewaySn}:`, err.message);
        pushMqttSensorLog(gatewaySn, packet.topic, rawGw || {}, 'error', `解析失败: ${err.message}`);
      }
      return;
    }

    // ─── 旧版兼容：传感器数据推送处理（sensor/{sensorId}/data）───
    const sensorMatch = packet.topic.match(/^sensor\/(.+)\/data$/);
    if (sensorMatch) {
      const sensorId = sensorMatch[1];
      try {
        const payload = JSON.parse(packet.payload.toString());
        const keys = Object.keys(payload);
        console.log(`[MQTT Sensor] 收到(旧版): sensorId=${sensorId}, keys=${keys.join(',')}, clientId=${client?.id || 'unknown'}`);
        await writeSensorReading(supabaseUrl, supabaseAnonKey, sensorId, payload, dbQuery);
        pushMqttSensorLog(sensorId, packet.topic, payload, 'ok', `收到数据(旧版) keys=${keys.join(',')}, 已写入数据库`);
      } catch (err) {
        console.error(`[MQTT Sensor] 解析失败 sensorId=${sensorId}:`, err.message);
        pushMqttSensorLog(sensorId, packet.topic, packet.payload ? packet.payload.toString() : '', 'error', `解析失败: ${err.message}`);
      }
      return;
    }

    // ─── 厂商规范：网关在线状态 ───
    const onlineMatch = packet.topic.match(/^back-device-online-v4\.(.+)\.(.+)$/);
    if (onlineMatch) {
      const onlineMerchantId = onlineMatch[1];
      const onlineGatewaySn = onlineMatch[2];
      try {
        const onlinePayload = JSON.parse(packet.payload.toString());
        console.log(`[MQTT GW] 网关在线: merchantId=${onlineMerchantId}, gatewaySn=${onlineGatewaySn}, state=${onlinePayload.state}`);
        pushMqttSensorLog(onlineGatewaySn, packet.topic, onlinePayload, 'ok', `网关在线 state=${onlinePayload.state}`);
      } catch (err) {
        console.warn(`[MQTT GW] 在线状态解析失败:`, err.message);
      }
      return;
    }

    // ─── 厂商规范：V1 网关心跳 ───
    const heartMatch = packet.topic.match(/^back-device-heart\.(.+)\.(.+)$/);
    if (heartMatch) {
      const heartMerchantId = heartMatch[1];
      const heartGatewaySn = heartMatch[2];
      try {
        const heartPayload = JSON.parse(packet.payload.toString());
        console.log(`[MQTT GW] 网关心跳(V1): merchantId=${heartMerchantId}, gatewaySn=${heartGatewaySn}, state=${heartPayload.state}`);
        pushMqttSensorLog(heartGatewaySn, packet.topic, heartPayload, 'ok', `网关心跳(V1) state=${heartPayload.state}`);
      } catch (err) {
        console.warn(`[MQTT GW] V1 心跳解析失败:`, err.message);
      }
      return;
    }

    // ─── 厂商规范：网关设备控制 ───
    const ctrlMatch = packet.topic.match(/^back-device-control\/([^/]+)\/([^/]+)$/);
    if (ctrlMatch) {
      const ctrlMerchantId = ctrlMatch[1];
      const ctrlGatewaySn = ctrlMatch[2];
      try {
        const ctrlPayload = JSON.parse(packet.payload.toString());
        console.log(`[MQTT GW] 设备控制: merchantId=${ctrlMerchantId}, gatewaySn=${ctrlGatewaySn}, cmd=${ctrlPayload.subDeviceSensorCmd?.cmd}`);
        pushMqttSensorLog(ctrlGatewaySn, packet.topic, ctrlPayload, 'ok', `控制指令: ${JSON.stringify(ctrlPayload.subDeviceSensorCmd || {})}`);
      } catch (err) {
        console.warn(`[MQTT GW] 设备控制解析失败:`, err.message);
      }
      return;
    }

    // ─── 厂商规范：门磁状态刷新 ───
    const doorMagnetMatch = packet.topic.match(/^back-device-iot-gateway-v4\/([^/]+)\/([^/]+)$/);
    if (doorMagnetMatch) {
      const dmMerchantId = doorMagnetMatch[1];
      const dmGatewaySn = doorMagnetMatch[2];
      try {
        const dmPayload = JSON.parse(packet.payload.toString());
        const sensorArray = Array.isArray(dmPayload) ? dmPayload : [];
        console.log(`[MQTT GW] 门磁状态刷新: merchantId=${dmMerchantId}, gatewaySn=${dmGatewaySn}, sensors=${sensorArray.length}`);
        if (sensorArray.length > 0) {
          const CHECKITEM_MAP_DM = {
            temperature: 'temp', humidity: 'humidity', TVOC: 'tvoc', CO: 'co',
            CH4: 'ch4', SOOT: 'soot', alarm: 'alarm',
            cumulativeFlow: 'cumulative_flow', totalPower: 'total_power',
            aCurrent: 'a_current', bCurrent: 'b_current', cCurrent: 'c_current',
            meterStatus: 'meter_status',
          };
          for (const sensor of sensorArray) {
            const { deviceSn, deviceType, deviceStatus, sensorDataList } = sensor;
            if (!Array.isArray(sensorDataList) || sensorDataList.length === 0) continue;
            const flatPayload = {};
            for (const sd of sensorDataList) {
              const mappedKey = CHECKITEM_MAP_DM[sd.checkItem] || sd.checkItem;
              const numVal = parseFloat(sd.value);
              if (!isNaN(numVal)) flatPayload[mappedKey] = numVal;
              else flatPayload[mappedKey] = sd.value;
            }
            const sensorId = deviceSn || 'unknown';
            await writeSensorReading(supabaseUrl, supabaseAnonKey, sensorId, flatPayload, dbQuery);
            pushMqttSensorLog(sensorId, packet.topic, flatPayload, 'ok', `门磁刷新 deviceSn=${deviceSn}`);
          }
        }
        pushMqttSensorLog(dmGatewaySn, packet.topic, dmPayload, 'ok', `门磁状态刷新 ${sensorArray.length}个传感器`);
      } catch (err) {
        console.warn(`[MQTT GW] 门磁状态解析失败:`, err.message);
      }
      return;
    }

    // ─── ★★★ device-update-info-v4（设备推送，无后缀）───
    // 设备在取餐那一刻通过此 Topic 推送完整重量数据：initialWeight、currentWeight、mealWeight
    // Payload: { dishId, dishName, targetWeight, nutritionPer100g, initialWeight, currentWeight, mealWeight, actualNutrition }
    const deviceUpdateInfoMatch = packet.topic.match(/^device-update-info-v4(\/[^/]+\/[^/]+)?$/);
    if (deviceUpdateInfoMatch) {
      try {
        const duiPayload = JSON.parse(packet.payload.toString());
        const { dishId, dishName, targetWeight, initialWeight, currentWeight, mealWeight, nutritionPer100g, actualNutrition } = duiPayload;
        const initW = Number(initialWeight || 0);
        const currW = Number(currentWeight || 0);
        const mealW = Number(mealWeight || 0);
        console.log('[MQTT-DIAG] ★ 收到 device-update-info-v4: dishId=' + dishId + ', dishName=' + (dishName || '?') + ', initialWeight=' + initW + 'g, currentWeight=' + currW + 'g, mealWeight=' + mealW + 'g');
        if (initW > 0) {
          // 从 Topic 提取 SN（如果有后缀）
          let devSn = '';
          const suffixParts = packet.topic.split('/');
          if (suffixParts.length >= 3) {
            devSn = suffixParts[2]; // device-update-info-v4/merchantId/deviceSn
          } else if (client?.id && mqttClientList.has(client.id)) {
            devSn = mqttClientList.get(client.id).sn || '';
          }
          if (devSn) {
            // ★ 关键：直接用 initialWeight 和 currentWeight 覆盖 Session
            // 设备推送的 initialWeight 是托盘+菜品初始重量，currentWeight 是当前剩余重量
            // mealWeight 由设备自己计算，最权威
            const existing = deviceSessionWeights.get(devSn);
            const mealWVal = Math.round(Math.max(0, initW - currW) * 10) / 10;
            if (!existing) {
              deviceSessionWeights.set(devSn, {
                initialWeight: initW,
                currentWeight: currW,
                mealWeight: mealWVal,
                lastDropWeight: 0,
                timestamp: Date.now(),
              });
              console.log('[MQTT-DIAG] ★ device-update-info-v4 首次写入Session: sn=' + devSn + ', initial=' + initW + 'g, current=' + currW + 'g, mealWeight=' + mealWVal + 'g');
            } else {
              // ★ 保留已有 lastDropWeight，只更新重量字段
              existing.initialWeight = initW;
              existing.currentWeight = currW;
              existing.mealWeight = mealWVal;
              existing.timestamp = Date.now();
              console.log('[MQTT-DIAG] ★ device-update-info-v4 更新Session: sn=' + devSn + ', initial=' + initW + 'g, current=' + currW + 'g, mealWeight=' + mealWVal + 'g, lastDropWeight保持=' + (existing.lastDropWeight || 0) + 'g');
            }
            // 同时用完整 SN 格式存储
            if (suffixParts.length >= 3) {
              const fullSn = `${suffixParts[1]}@${suffixParts[2]}`;
              const existingFull = deviceSessionWeights.get(fullSn);
              deviceSessionWeights.set(fullSn, {
                initialWeight: initW,
                currentWeight: currW,
                mealWeight: mealWVal,
                lastDropWeight: existingFull ? (existingFull.lastDropWeight || 0) : 0,
                timestamp: Date.now(),
              });
            }
            cacheDeviceWeight(devSn, currW, 'g', 'mqtt-device-update-info');
          }
        }
        // 更新设备在线状态
        if (client?.id && mqttClientList.has(client.id)) {
          updateDeviceStatus(supabaseUrl, supabaseAnonKey, dbQuery, mqttClientList.get(client.id).sn || '', '', 'online');
        }
      } catch (err) {
        console.warn('[MQTT] device-update-info-v4 解析失败:', err.message);
      }
    }

    // ─── ★★★ switch-device-menu-v4（设备推送，无后缀）───
    // 设备切换菜品时推送，包含当前菜单和重量信息
    // Payload: { menuId, dishesId, menuName, productName, menuWeigh, weight, menuPrice, price, nutrition, actualNutrition, timestamp }
    const switchMenuMatch = packet.topic.match(/^switch-device-menu-v4(\/[^/]+\/[^/]+)?$/);
    if (switchMenuMatch && !deviceUpdateInfoMatch) {
      try {
        const smPayload = JSON.parse(packet.payload.toString());
        const { menuId, dishesId, menuName, productName, menuWeigh, weight, menuPrice, price } = smPayload;
        const mw = Number(menuWeigh || 0);
        const w = Number(weight || 0);
        const displayWeight = mw > 0 ? mw : w;
        console.log('[MQTT-DIAG] ★ 收到 switch-device-menu-v4: menuId=' + menuId + ', menuName=' + (menuName || '?') + ', menuWeigh=' + mw + 'g, weight=' + w + 'g');
        if (mw > 0 || w > 0) {
          let devSn = '';
          const suffixParts = packet.topic.split('/');
          if (suffixParts.length >= 3) {
            devSn = suffixParts[2];
          } else if (client?.id && mqttClientList.has(client.id)) {
            devSn = mqttClientList.get(client.id).sn || '';
          }
          const newWeight = mw > 0 ? mw : w;
          if (devSn && newWeight > 0) {
            // switch-device-menu 的 menuWeigh 是取餐后的实际重量，不是绝对重量
            // 直接缓存为当前重量
            updateDeviceSessionWeight(devSn, newWeight);
            cacheDeviceWeight(devSn, newWeight, 'g', 'mqtt-switch-menu');
            console.log('[MQTT-DIAG] ★ switch-device-menu-v4 缓存重量: sn=' + devSn + ', weight=' + newWeight + 'g');
            if (suffixParts.length >= 3) {
              const fullSn = `${suffixParts[1]}@${suffixParts[2]}`;
              updateDeviceSessionWeight(fullSn, newWeight);
            }
          }
        }
      } catch (err) {
        console.warn('[MQTT] switch-device-menu-v4 解析失败:', err.message);
      }
    }

    // ─── 设备重量信息上报（取餐盘实时重量 / 取餐动作）───
    // Topic: device-weight-info-report-v4.{merchantId}.{deviceSn}
    // Payload: { ifTakeFoodState, machineSn, menuId, menuPrice, menuWeigh, merchantId }
    const weightInfoMatch = packet.topic.match(/^device-weight-info-report-v4\.(.+)\.(.+)$/);
    if (weightInfoMatch) {
      const wiMerchantId = weightInfoMatch[1];
      const wiDeviceSn = weightInfoMatch[2];
      try {
        const wiPayload = JSON.parse(packet.payload.toString());
        const { ifTakeFoodState, machineSn, menuId, menuName, menuPrice, menuWeigh, custId, personId, personNo, cardNo, userId, merchantId: payloadMerchantId } = wiPayload;
        const weight = Number(menuWeigh || 0);
        const sn = machineSn || wiDeviceSn;

        console.log(`[ScaleInbound-MQTT-Weight] ━━━ 设备重量上报(MQTT) ━━━`);
        console.log(`[ScaleInbound-MQTT-Weight] merchantId=${wiMerchantId}, deviceSn=${wiDeviceSn}, machineSn=${machineSn}`);
        console.log(`[ScaleInbound-MQTT-Weight] menuWeigh=${menuWeigh}, ifTakeFoodState=${ifTakeFoodState}, menuId=${menuId}, menuName=${menuName}, custId=${custId}`);
        console.log(`[ScaleInbound-MQTT-Weight] resolvedSn=${sn}, absWeight=${Math.abs(weight)}g`);

        // ★ 修复：收到重量数据说明设备在线，同步更新状态
        updateDeviceStatus(supabaseUrl, supabaseAnonKey, dbQuery, sn, '', 'online');

        // ★ 缓存重量（取绝对值，menuWeigh 负值表示取餐减少的重量）
        const absWeight = Math.abs(weight);
        if (absWeight > 0) {
          // ★★★ 诊断：存Session前先看当前状态
          const preSession = deviceSessionWeights.get(sn);
          console.log('[MQTT-DIAG-WEIGHT] 准备缓存: sn=' + sn + ', absWeight=' + absWeight + 'g');
          console.log('[MQTT-DIAG-WEIGHT] Session前状态: ' + (preSession ? ('initialWeight=' + preSession.initialWeight + 'g, currentWeight=' + preSession.currentWeight + 'g, ts=' + new Date(preSession.timestamp).toLocaleTimeString('zh-CN')) : '(空-首次记录)'));
          console.log('[MQTT-DIAG-WEIGHT] 当前 deviceSessionWeights 总数: ' + deviceSessionWeights.size);
          
          cacheDeviceWeight(sn, absWeight, 'g', 'mqtt-device-weight-info');
          updateDeviceSessionWeight(sn, absWeight);
          // ★★★ 同时用完整 SN 格式存储（device@merchant@SN），确保 get-main-device 直接匹配
          const fullDeviceSn = `device@${wiMerchantId}@${sn}`;
          updateDeviceSessionWeight(fullDeviceSn, absWeight);
          
          // ★★★ 诊断：存Session后查看结果
          const postSession = getDeviceSessionWeight(sn);
          console.log('[MQTT-DIAG-WEIGHT] Session后状态: sn=' + sn + ', initialWeight=' + postSession.initialWeight + 'g, currentWeight=' + postSession.currentWeight + 'g, mealWeight=' + postSession.mealWeight + 'g, lastDropWeight=' + (postSession.lastDropWeight || 0) + 'g');
          // ★★★ 诊断：列出当前所有Session key
          if (deviceSessionWeights.size > 0) {
            const keys = Array.from(deviceSessionWeights.keys());
            console.log('[MQTT-DIAG-WEIGHT] 当前所有Session keys (' + keys.length + '个): ' + JSON.stringify(keys));
          }
          
          console.log(`[ScaleInbound-MQTT-Weight] ★ 缓存重量: ${sn} → ${absWeight}g, fullDeviceSn=${fullDeviceSn}`);

          // ★★★ 实时推送完整 get-main-device 响应格式到设备屏 MQTT 频道
          // 设备已订阅 device-update-menu-config-v4.{merchantId}.{deviceSn}
          // 推送完整格式让设备屏直接渲染，无需再轮询 get-main-device
          if (aedes) {
            try {
              const session = getDeviceSessionWeight(sn);
              const dishInfo = resolveDishNameSmart(dbQuery, { machineSn: sn, deviceSn: wiDeviceSn, menuId, menuName });
              const dishName = dishInfo.dishName || '未知菜品';
              const dishId = String(menuId || sn);

              // 查询菜品营养基准数据（每100g）
              let nutritionPer100g = { protein: 0, fat: 0, carbohydrate: 0, dietaryFiber: 0, calcium: 0, calories: 0 };
              let targetWeight = 480;
              if (dbQuery) {
                try {
                  // ★★★ 兼容旧 SQLite 表缺少 dietary_fiber_per_100g 或 target_weight 列的情况
                  // 先用完整列查询，失败则回退到不含可能缺失列的安全查询
                  let nutRows = null;
                  try {
                    nutRows = dbQuery(
                      'SELECT protein_per_100g, fat_per_100g, carbs_per_100g, dietary_fiber_per_100g, calories_per_100g, target_weight FROM dish_nutrition WHERE dish_name = ? ORDER BY id DESC LIMIT 1',
                      [dishName]
                    );
                  } catch (colErr) {
                    // 列不存在，回退到最安全的基础查询（不包含可能缺失的列）
                    try {
                      nutRows = dbQuery(
                        'SELECT protein_per_100g, fat_per_100g, carbs_per_100g, calories_per_100g FROM dish_nutrition WHERE dish_name = ? ORDER BY id DESC LIMIT 1',
                        [dishName]
                      );
                    } catch (colErr2) {
                      // 极端情况：连基础列都没有，忽略
                    }
                  }
                  if (nutRows && nutRows.length > 0) {
                    const n = nutRows[0];
                    nutritionPer100g = {
                      protein: Number(n.protein_per_100g) || 0,
                      fat: Number(n.fat_per_100g) || 0,
                      carbohydrate: Number(n.carbs_per_100g) || 0,
                      dietaryFiber: Number(n.dietary_fiber_per_100g) || 0,
                      calcium: 0,
                      calories: Number(n.calories_per_100g) || 0,
                    };
                    targetWeight = Number(n.target_weight) || 480;
                  }
                } catch (e) { /* nutrition lookup failed, use defaults */ }
              }

              // 计算实际营养值（基于最近一次取餐重量，非累计值）
              const displayWeight = session.lastDropWeight > 0 ? session.lastDropWeight : session.mealWeight;
              const factor = displayWeight / 100;
              const actualNutrition = displayWeight > 0 ? {
                calories: Math.round(nutritionPer100g.calories * factor * 10) / 10,
                protein: Math.round(nutritionPer100g.protein * factor * 10) / 10,
                fat: Math.round(nutritionPer100g.fat * factor * 10) / 10,
                carbohydrate: Math.round(nutritionPer100g.carbohydrate * factor * 10) / 10,
                dietaryFiber: Math.round(nutritionPer100g.dietaryFiber * factor * 10) / 10,
                calcium: Math.round(nutritionPer100g.calcium * factor * 10) / 10,
              } : { calories: 0, protein: 0, fat: 0, carbohydrate: 0, dietaryFiber: 0, calcium: 0 };

              const pushPayload = JSON.stringify({
                dishId,
                dishName,
                targetWeight,
                nutritionPer100g,
                initialWeight: session.initialWeight,
                currentWeight: session.currentWeight,
                mealWeight: displayWeight,
                actualNutrition,
              });

              const menuConfigTopic = `device-update-menu-config-v4/${wiMerchantId}/${wiDeviceSn}`;
              aedes.publish({
                cmd: 'publish',
                topic: menuConfigTopic,
                payload: Buffer.from(pushPayload),
                qos: 0,
                retain: false,
              });

              // ★★★ 推送到 device-weight-control-v4（重量控制）
              const weightControlTopic = `device-weight-control-v4/${wiMerchantId}/${wiDeviceSn}`;
              aedes.publish({
                cmd: 'publish',
                topic: weightControlTopic,
                payload: Buffer.from(JSON.stringify({
                  menuId: menuId || dishId, menuName: dishName,
                  initialWeight: session.initialWeight, currentWeight: session.currentWeight,
                  mealWeight: displayWeight, actualNutrition,
                  timestamp: Date.now(),
                })),
                qos: 0,
                retain: false,
              });

              // ★★★ 推送到 device-update-info-v4（信息更新）
              const infoUpdateTopic = `device-update-info-v4/${wiMerchantId}/${wiDeviceSn}`;
              aedes.publish({
                cmd: 'publish',
                topic: infoUpdateTopic,
                payload: Buffer.from(pushPayload),
                qos: 0,
                retain: false,
              });

              // ★★★ 推送到 switch-device-menu-v4（切换菜品）
              const switchMenuTopic = `switch-device-menu-v4/${wiMerchantId}/${wiDeviceSn}`;
              aedes.publish({
                cmd: 'publish',
                topic: switchMenuTopic,
                payload: Buffer.from(JSON.stringify({
                  menuId: Number(menuId) || Number(dishId) || 0,
                  dishesId: Number(menuId) || Number(dishId) || 0,
                  menuName: dishName, productName: dishName,
                  menuWeigh: displayWeight, weight: displayWeight,
                  menuPrice: menuPrice || 0, price: menuPrice || 0,
                  nutrition: nutritionPer100g, actualNutrition,
                  timestamp: Date.now(),
                })),
                qos: 0,
                retain: false,
              });

              console.log('[MQTT Weight] ★ 推送实时重量: lastDropWeight=' + (session.lastDropWeight || 0) + 'g, mealWeight(累计)=' + session.mealWeight + 'g, displayWeight=' + displayWeight + 'g, dish=' + dishName + ' (4频道)');
            } catch (pushErr) {
              console.warn('[MQTT Weight] 推送实时重量失败:', pushErr.message);
            }
          }
        }

        // ★★★ 核心：计算实际重量变化（统一逻辑，兼容"变化量"和"绝对重量"两类设备）
        const prevEntry = deviceWeightHistory.has(sn) ? deviceWeightHistory.get(sn) : null;
        const prevWeight = prevEntry ? prevEntry.weight : null;
        const hasPrevWeight = prevWeight != null && prevWeight > 0;

        // 信号类型判定
        const minDrop = pickupConfig.minDropGrams || 50;  // 最小取餐量阈值（后台可配置）
        const isTakingFood = (ifTakeFoodState === true || ifTakeFoodState === 'true' || ifTakeFoodState === 1);
        const isWeightDrop = weight < -minDrop;  // 设备直接上报负值变化量（如 -200g）
        const isPositiveAbs = weight > 0;   // 设备上报正值绝对重量（如 985g）

        // 与上次稳定重量的差异
        let diff = 0;
        if (hasPrevWeight) {
          diff = prevWeight - absWeight;
        }

        let isAbsDrop = false;      // 通过历史对比判定取餐
        let isChefPutFood = false;  // 厨师放菜：重量增加
        let absDrop = 0;            // 历史对比计算出的减少量

        if (hasPrevWeight && isPositiveAbs) {
          if (diff > minDrop) {
            // 重量减少超过阈值 → 用户取餐
            absDrop = diff;
            isAbsDrop = true;
          } else if (diff < -minDrop) {
            // 重量增加超过阈值 → 厨师放菜/补充（不生成取餐记录）
            isChefPutFood = true;
          }
          // 波动 ≤ 50g → 忽略
        }

        // ★★★ 稳定基线累计检测（绝对重量设备，渐进式取餐，无明确取餐信号时）
        // 解决"每次只降1g、慢慢舀菜"导致逐次对比永远到不了 50g 门槛的问题
        let stableResult = { drop: 0, baseline: 0, minWeight: 0 };
        if (isPositiveAbs && !isWeightDrop && !isTakingFood) {
          stableResult = trackStableBaseline(sn, absWeight);
          if (stableResult.drop > 0) {
            console.log(`[ScaleInbound-MQTT-Weight] ★ 稳定基线检测到取餐: ${sn} 基线${stableResult.baseline}g → 最低${stableResult.minWeight}g (取餐${stableResult.drop}g)`);
          }
        }

        // ★ 更新重量历史（仅对"绝对重量"设备有意义）
        // 负值变化量设备上报的是"变化量"（如 -312g），不是绝对重量，
        // 若写入历史会污染后续的绝对重量对比，必须跳过
        if (absWeight > 0 && !isWeightDrop) {
          deviceWeightHistory.set(sn, { weight: absWeight, timestamp: Date.now() });
          persistWeightHistory(sn, absWeight);
        }

        if (isChefPutFood) {
          console.log(`[MQTT Weight] 厨师放菜/补充: ${sn} ${prevWeight}g → ${absWeight}g (增加${Math.abs(diff)}g)，不生成取餐记录`);
        }

        // ★★★ 统一计算实际取餐量
        // 设备上报变化量（负值）→ 直接用 |menuWeigh|
        // 设备上报绝对重量（正值）→ 用 prevWeight - absWeight
        let actualDrop = 0;
        if (isWeightDrop) {
          actualDrop = absWeight;  // menuWeigh 是负值，取绝对值就是减少量
        } else if (isAbsDrop) {
          actualDrop = absDrop;    // 通过历史对比算出的减少量
        } else if (stableResult.drop > 0) {
          actualDrop = stableResult.drop;  // 稳定基线累计检测出的取餐量
        } else if (isTakingFood && hasPrevWeight && diff > minDrop) {
          // ifTakeFoodState=true 但设备上报的是绝对重量，用历史对比
          actualDrop = diff;
        }

        // ★★★ 生成取餐记录的判定条件：
        // 情况A：设备直接上报负值变化量（如 menuWeigh=-312g，明确表示"取走了312g"），
        //        这是最权威的取餐信号，无需历史重量对比
        // 情况B：ifTakeFoodState=true 或 历史对比减少（绝对重量设备），
        //        需要历史重量 + 实际减少>50g + 当前<上次
        // 情况C：稳定基线累计检测（渐进式取餐，无明确取餐信号）
        const shouldRecord = (isWeightDrop && actualDrop > minDrop)
          || ((isTakingFood || isAbsDrop) && hasPrevWeight && actualDrop > minDrop && absWeight < prevWeight)
          || (stableResult.drop > 0);

        console.log(`[ScaleInbound-MQTT-Weight] ━━━ 取餐判断 ━━━`);
        console.log(`[ScaleInbound-MQTT-Weight] ifTakeFoodState=${ifTakeFoodState}, menuWeigh=${menuWeigh}, prevWeight=${prevWeight}`);
        console.log(`[ScaleInbound-MQTT-Weight] isTakingFood=${isTakingFood}, isWeightDrop=${isWeightDrop}, isAbsDrop=${isAbsDrop}(drop=${absDrop}), isChefPutFood=${isChefPutFood}`);
        console.log(`[ScaleInbound-MQTT-Weight] actualDrop=${actualDrop}, shouldRecord=${shouldRecord}`);

        if (shouldRecord && dbQuery) {
          const now = new Date().toISOString();
          // ★ 北京时间（UTC+8），避免凌晨0-8点日期跨天
          const nowBeijing = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('Z', '+08:00');

          // ★★★ 智能解析菜名
          const dishInfo = resolveDishNameSmart(dbQuery, { machineSn, deviceSn: wiDeviceSn, menuId, menuName });
          let dishName = dishInfo.dishName;
          let category = dishInfo.category;
          let stationId = dishInfo.stationId;
          let stationCode = dishInfo.stationCode || sn;
          console.log(`[MQTT Weight] ★ 菜名解析: dishName=${dishName}, category=${category}, stationId=${stationId}, resolved=${dishInfo.resolved}`);
          cacheMenuIdDish(dbQuery, sn, menuId, dishName, category);

          // ★★★ person_id
          const personIdValue = (() => {
            const cid = Number(custId || 0);
            if (cid > 0) return String(cid);
            const candidates = [personId, personNo, cardNo, userId];
            for (const c of candidates) {
              if (c != null && String(c).trim() && String(c).trim() !== '0') return String(c).trim();
            }
            return '';
          })();

          // ★★★ 统一 weightBefore/weightAfter 计算
          // weightAfter = 取餐前 - 取餐量（正确逻辑），而不是设备上报的原始绝对值
          // 负值变化量设备没有历史重量时，weight_before/weight_after 记为 null（未知），
          // 但 pickup_weight 仍是设备明确上报的取餐量，汇总表正常按此统计
          let weightBefore = hasPrevWeight ? prevWeight : null;
          const pickupWeight = actualDrop;
          let weightAfter = hasPrevWeight ? Math.max(0, prevWeight - actualDrop) : null;
          // 稳定基线检测：取餐前 = 稳定基线，取餐后 = 最低点（更准确）
          if (stableResult.drop > 0) {
            weightBefore = stableResult.baseline;
            weightAfter = stableResult.minWeight;
          }

          // ★★★ 使用北京时间 UTC+8，而非 new Date().getHours() 本地时间
          const beijingHour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
          const mealType = ['早餐', '午餐', '晚餐'][beijingHour < 10 ? 0 : beijingHour < 16 ? 1 : 2];
          // ★ 来源标记：明确区分变化量上报 vs 历史对比
          const sourceTag = isWeightDrop ? 'mqtt-weight-drop' : 'mqtt-weight-abs';

          try {
            dbQuery('CREATE TABLE IF NOT EXISTS tray_pickup_logs ('
              + 'id INTEGER PRIMARY KEY AUTOINCREMENT, station_id INTEGER, station_code TEXT, '
              + 'dish_name TEXT, category TEXT, meal_type TEXT, pickup_time TEXT, '
              + 'weight_before REAL, weight_after REAL, pickup_weight REAL, pickup_portions INTEGER, '
              + 'person_id TEXT, notes TEXT, created_at TEXT, '
              + 'calories REAL, protein REAL, fat REAL, carbs REAL, source TEXT'
              + ')', []);
            dbQuery(
              'INSERT INTO tray_pickup_logs (station_id, station_code, dish_name, category, meal_type, pickup_time, weight_before, weight_after, pickup_weight, pickup_portions, person_id, notes, created_at, calories, protein, fat, carbs, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [stationId, stationCode, dishName, category, mealType, nowBeijing, weightBefore, weightAfter, pickupWeight, 1, personIdValue, 'MQTT重量自动检测: ' + (machineSn || wiDeviceSn) + ' 减少' + pickupWeight + 'g', now, 0, 0, 0, 0, sourceTag]
            );
            console.log(`[ScaleInbound-MQTT-Weight] ✓ 取餐记录写入成功: ${pickupWeight}g, ${dishName}, station=${stationCode}, before=${weightBefore}, after=${weightAfter}, source=${sourceTag}`);

            // ★ 同时异步写入 Supabase
            try {
              const { createClient } = await import('@supabase/supabase-js');
              if (supabaseUrl && supabaseAnonKey) {
                const supa = createClient(supabaseUrl, supabaseAnonKey);
                supa.from('tray_pickup_logs').insert({
                  station_id: stationId,
                  station_code: stationCode,
                  dish_name: dishName,
                  category: category,
                  meal_type: mealType,
                  pickup_time: nowBeijing,
                  weight_before: weightBefore,
                  weight_after: weightAfter,
                  pickup_weight: pickupWeight,
                  pickup_portions: 1,
                  person_id: personIdValue,
                  notes: 'MQTT重量自动检测: ' + (machineSn || wiDeviceSn),
                  calories: 0, protein: 0, fat: 0, carbs: 0,
                  source: sourceTag,
                }).then(({ error }) => {
                  if (error) console.warn('[MQTT Weight] Supabase 写入失败:', error.message);
                  else console.log('[MQTT Weight] ✓ Supabase 写入成功');
                });
              }
            } catch (e) {
              console.warn('[MQTT Weight] Supabase 写入异常:', e.message);
            }
          } catch (e) {
            console.warn('[MQTT Weight] 取餐记录写入失败:', e.message);
          }

          // ★ 更新托盘站的上次重量
          if (stationId && dbQuery) {
            try {
              dbQuery('UPDATE tray_stations SET hw_last_weight = ?, hw_last_seen = ?, hw_enabled = 1 WHERE id = ?', [absWeight, now, stationId]);
              console.log(`[MQTT Weight] 更新 station id=${stationId} last_weight=${absWeight}`);
            } catch (e) {
              console.warn('[MQTT Weight] 更新station重量失败:', e.message);
            }
          }

          // ★ 通过 IPC 推送实时数据变更到前端
          if (trayWeightCallback) {
            try {
              trayWeightCallback({
                type: 'pickup_log',
                station_code: stationCode,
                station_id: stationId,
                dish_name: dishName,
                category,
                pickup_weight: pickupWeight,
                weight_before: weightBefore,
                weight_after: weightAfter,
                meal_type: mealType,
                source: sourceTag,
                timestamp: now,
              });
            } catch (e) {
              console.warn('[MQTT Weight] trayWeightCallback 调用失败:', e.message);
            }
          }
        } else if (absWeight > 0 && absWeight <= minDrop && !isWeightDrop) {
          console.log(`[ScaleInbound-MQTT-Weight] 重量${absWeight}g <= ${minDrop}g 阈值，忽略`);
        } else {
          console.log(`[ScaleInbound-MQTT-Weight] 条件不满足，不生成取餐记录 (isTakingFood=${isTakingFood}, isWeightDrop=${isWeightDrop}, actualDrop=${actualDrop}, hasPrevWeight=${hasPrevWeight}, absWeight=${absWeight}, prevWeight=${prevWeight})`);
        }
      } catch (err) {
        console.error(`[MQTT Weight] 解析失败 merchantId=${wiMerchantId} deviceSn=${wiDeviceSn}:`, err.message);
      }
      return;
    }

    // ─── 设备在线状态上报（V4 标准格式，不带 back- 前缀）───
    // Topic: device-online-v4.{merchantId}.{deviceSn}
    const deviceOnlineMatch = packet.topic.match(/^device-online-v4\.(.+)\.(.+)$/);
    if (deviceOnlineMatch) {
      const doMerchantId = deviceOnlineMatch[1];
      const doDeviceSn = deviceOnlineMatch[2];
      try {
        const doPayload = JSON.parse(packet.payload.toString());
        console.log(`[MQTT] 设备在线(V4): merchantId=${doMerchantId}, deviceSn=${doDeviceSn}, state=${doPayload.state}, version=${doPayload.versionName || 'unknown'}`);
        pushMqttSensorLog(doDeviceSn, packet.topic, doPayload, 'ok', `设备在线 state=${doPayload.state}`);
        // ★ 修复：设备上报在线状态时，同步更新 SQLite 状态为 online
        updateDeviceStatus(supabaseUrl, supabaseAnonKey, dbQuery, doDeviceSn, '', 'online');
      } catch (err) {
        console.warn(`[MQTT] 设备在线(V4)解析失败:`, err.message);
      }
      return;
    }

    const clientInfo = mqttClients.get(client.id);
    if (!clientInfo) return;

    if (packet.topic === 'device/register') {
      try {
        const payload = JSON.parse(packet.payload.toString());
        const { sn, key } = payload;

        if (dbQuery) {
          const rows = dbQuery(
            `SELECT id FROM tray_display_devices WHERE sn = ?`,
            [sn]
          );
          if (!rows || rows.length === 0) {
            const now = new Date().toISOString();
            dbQuery(
              `INSERT OR IGNORE INTO tray_display_devices (name, sn, hw_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
              [sn, sn, key, 'online', now, now]
            );
            dbQuery(`UPDATE tray_display_devices SET status = 'online', hw_key = ?, updated_at = ? WHERE sn = ?`, [key, now, sn]);
            console.log(`[MQTT] 自动创建设备: SN=${sn}`);
          }
        }

        let valid = false;
        let device = null;
        if (dbQuery) {
          const rows = dbQuery(
            `SELECT id, name, sn, hw_key, location, status, max_price_temp_dish,
             interval_price_temp_dish, min_price_temp_dish, bind_plate_before_take,
             ui_template, weigh_alarm_model, min_settlement_weight, stable_difference,
             alarm_below_grams, max_weight_dish, bind_mode, bind_value, station_id
             FROM tray_display_devices WHERE sn = ? AND hw_key = ?`,
            [sn, key]
          );
          valid = rows && rows.length > 0;
          if (valid) device = rows[0];
        }

        if (!valid) {
          aedes.publish({
            cmd: 'publish',
            topic: `device/${sn}/register/response`,
            payload: Buffer.from(JSON.stringify({ code: 403, msg: '验证失败', data: null })),
            qos: 1,
            retain: false,
          }, () => {});
          return;
        }

        const token = generateToken();
        tokenMap.set(sn, token);
        clientInfo.token = token;
        clientInfo.sn = sn;
        clientInfo.device = device;
        clientInfo.station_id = device.station_id || null;

        await updateDeviceStatus(supabaseUrl, supabaseAnonKey, dbQuery, sn, token, 'online');

        const deviceConfig = {
          MaxPriceListForTemporaryDishes: String(device.max_price_temp_dish ?? 100),
          IntervalPriceListForTemporaryDishes: String(device.interval_price_temp_dish ?? 0.5),
          MixPriceListForTemporaryDishes: String(device.min_price_temp_dish ?? 0),
          ifBindplatebeforetakefood: String(device.bind_plate_before_take ?? 1),
          deviceUITemplate: String(device.ui_template ?? 1),
          weighAlarmModel: String(device.weigh_alarm_model ?? 1),
          minimumsettlementweight: String(device.min_settlement_weight ?? 10),
          stabledifference: String(device.stable_difference ?? 2),
          alarmBelowHowGrams: String(device.alarm_below_grams ?? -1000),
          maxWeightDish: String(device.max_weight_dish ?? 5000),
          maxPriceDish: '160',
          totalMaxWeightDish: '5000',
          totalMaxPriceDish: '160',
          ifUseQuota: '是',
          quotaAmountConfig: '',
          amountNotify: '30',
          allowBindplatemaxnum: '3',
          weighingValidTimeOnline: '30',
          waitingPayTime: '30',
          ifcareblance: '1',
          ifblancealarm: '1',
          alarmblance: '',
          weighIfSpoonWeight: '2',
          tempDishesPriceUnit: '1',
          ifOffLinePay: '是',
          offlineCheckBalance: '开启',
          weighingValidTime: '30',
          alarmTime: '15',
        };

        aedes.publish({
          cmd: 'publish',
          topic: `device/${sn}/register/response`,
          payload: Buffer.from(JSON.stringify({ code: 0, msg: 'success', data: { token, deviceConfig } })),
          qos: 1,
          retain: false,
        }, () => {});

        let resolvedBindMode = device.bind_mode || 'all';
        let resolvedBindValue = device.bind_value || '';
        if (resolvedBindMode === 'station' && device.station_id) {
          const resolved = resolveStationProductId(dbQuery, device.station_id);
          resolvedBindMode = resolved.bindMode;
          resolvedBindValue = resolved.bindValue;
        }

        const dishes = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, resolvedBindMode, resolvedBindValue);
        aedes.publish({
          cmd: 'publish',
          topic: `device/${sn}/menu`,
          payload: Buffer.from(JSON.stringify({ code: 0, msg: 'success', data: { dishes, deviceConfig } })),
          qos: 1,
          retain: true,
        }, () => {});

        console.log(`[MQTT] 设备 ${sn} 注册成功，已推送 ${dishes.length} 道菜品`);
      } catch (err) {
        console.error('[MQTT] 注册处理错误:', err.message);
      }
    }

    if (packet.topic === `device/${clientInfo.sn}/get_menu`) {
      try {
        const device = clientInfo.device;
        if (!device) return;
        let bindMode = device.bind_mode || 'all';
        let bindValue = device.bind_value || '';
        if (bindMode === 'station' && clientInfo.station_id) {
          const resolved = resolveStationProductId(dbQuery, clientInfo.station_id);
          bindMode = resolved.bindMode;
          bindValue = resolved.bindValue;
        }
        const dishes = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, bindMode, bindValue);
        aedes.publish({
          cmd: 'publish',
          topic: `device/${clientInfo.sn}/menu`,
          payload: Buffer.from(JSON.stringify({ code: 0, msg: 'success', data: { dishes } })),
          qos: 1,
          retain: true,
        }, () => {});
        console.log(`[MQTT] 设备 ${clientInfo.sn} 请求刷新菜品，已推送 ${dishes.length} 道`);
      } catch (err) {
        console.error('[MQTT] 刷新菜品错误:', err.message);
      }
    }

    // ─── 乐牛一体机消费流水上报（MQTT 通道） ───
    // 设备取餐后称重变化 → 通过 MQTT 上报消费记录
    // Topic 格式: device/{sn}/upweightmenu
    const upweightMatch = packet.topic.match(/^device\/(.+)\/upweightmenu$/);
    if (upweightMatch) {
      const deviceSnFromTopic = upweightMatch[1];
      try {
        const payload = JSON.parse(packet.payload.toString());
        // 兼容两种 payload 格式：
        // 格式A: { content: {...} }  (与 HTTP 接口一致)
        // 格式B: { deviceSn, menuName, weight, ... } (扁平格式)
        const content = payload.content || payload;
        const deviceSn = content.deviceSn || deviceSnFromTopic;
        const plateSerialNum = content.plateSerialNum || '';
        const menuId = content.menuId || content.menuDetailId || 0;
        const menuWeigh = Number(content.menuWeigh || 0);
        const weight = Number(content.weight || 0);

        const quantity = Number(content.quantity || 1);
        const salseMode = Number(content.salseMode || 2);
        const custId = Number(content.custId || 0);
        const macNo = content.macNo || '';
        const macSerial = content.macSerial || '';
        const macTime = content.macTime || '';
        const macOrdId = content.macOrdId || '';

        // ★★★ 智能解析菜名：payload.menuName → 设备站点 → menuId查菜品库 → 电子屏选菜 → 未知菜品
        const upDishInfo = resolveDishNameSmart(dbQuery, { machineSn: deviceSn, deviceSn, menuId, menuName: content.menuName });
        const menuName = upDishInfo.dishName;
        cacheMenuIdDish(dbQuery, deviceSn, menuId, upDishInfo.dishName, upDishInfo.category);

        // ★★★ person_id：custId 优先，其次其他身份字段
        const upPersonId = (() => {
          if (Number(custId || 0) > 0) return String(custId);
          const candidates = [content.personId, content.personNo, content.cardNo, content.userId];
          for (const c of candidates) {
            if (c != null && String(c).trim() && String(c).trim() !== '0') return String(c).trim();
          }
          return '';
        })();

        // ★★★ 缓存重量到全局缓存（供 VectorMaterial 等接口使用）
        if (weight > 0) {
          cacheDeviceWeight(deviceSn, weight, 'kg', 'mqtt-upweight');
          updateDeviceSessionWeight(deviceSn, weight);
          // 同时用 macNo 和 macSerial 作为备选 key
          if (macNo) cacheDeviceWeight(macNo, weight, 'kg', 'mqtt-upweight');
          if (macSerial) cacheDeviceWeight(macSerial, weight, 'kg', 'mqtt-upweight');
        }

        const recordId = 'mqtt_bf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = new Date().toISOString();

        console.log('[ScaleInbound-MQTT-Upweight] ━━━ 消费流水(MQTT) ━━━');
        console.log('[ScaleInbound-MQTT-Upweight] recordId: ' + recordId + ', deviceSn: ' + deviceSn);
        console.log('[ScaleInbound-MQTT-Upweight] menuName: ' + menuName + ', weight: ' + weight + ', menuWeigh: ' + menuWeigh + ', quantity: ' + quantity);
        console.log('[ScaleInbound-MQTT-Upweight] ★ 菜名解析: dishName=' + upDishInfo.dishName + ', category=' + upDishInfo.category + ', stationId=' + upDishInfo.stationId + ', resolved=' + upDishInfo.resolved);

        // 写入 SQLite: buffet_consumption_records
        if (dbQuery) {
          try {
            dbQuery('CREATE TABLE IF NOT EXISTS buffet_consumption_records ('
              + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
              + 'record_id TEXT NOT NULL UNIQUE, device_sn TEXT, plate_serial_num TEXT, '
              + 'menu_id INTEGER, menu_detail_id INTEGER, menu_name TEXT, menu_no INTEGER, '
              + 'weight REAL, menu_weigh REAL, quantity INTEGER, salse_mode INTEGER, '
              + 'cust_id INTEGER, mac_no TEXT, mac_serial TEXT, mac_time TEXT, '
              + 'mac_ord_id TEXT, if_online INTEGER, bind_type INTEGER, created_at TEXT'
              + ')', []);
            dbQuery(
              'INSERT INTO buffet_consumption_records (record_id, device_sn, plate_serial_num, menu_name, weight, menu_weigh, quantity, salse_mode, cust_id, mac_no, mac_serial, mac_time, mac_ord_id, if_online, bind_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [recordId, deviceSn, plateSerialNum, menuName, weight, menuWeigh, quantity, salseMode, custId, macNo, macSerial, macTime, macOrdId, 1, 1, now]
            );
            console.log('[MQTT Upweight] ✓ SQLite buffet_consumption_records 写入成功');
          } catch (e) {
            console.warn('[MQTT Upweight] SQLite buffet_consumption_records 写入失败:', e.message);
          }

          // 同步写入 tray_pickup_logs，让「取餐明细记录」页面实时显示
          try {
            const stationCode = upDishInfo.stationCode || deviceSn || macNo || 'MQTT-' + recordId.slice(-6);
            const dishName = menuName || '未知菜品';
            const category = upDishInfo.category || '荤菜';
            const pickupWeight = Number(weight || menuWeigh || 0);
            const weightBefore = Number(menuWeigh || weight || 0);
            const weightAfter = Math.max(0, weightBefore - pickupWeight);
            const portions = Number(quantity || 1);
            const personId = upPersonId;
            const beijingHourX1 = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
            const mealType = ['早餐', '午餐', '晚餐'][beijingHourX1 < 10 ? 0 : beijingHourX1 < 16 ? 1 : 2];
            const pickupTime = macTime
              ? (macTime.includes('T') ? macTime : macTime.replace(' ', 'T') + '+08:00')
              : now;

            dbQuery('CREATE TABLE IF NOT EXISTS tray_pickup_logs ('
              + 'id INTEGER PRIMARY KEY AUTOINCREMENT, station_id INTEGER, station_code TEXT, '
              + 'dish_name TEXT, category TEXT, meal_type TEXT, pickup_time TEXT, '
              + 'weight_before REAL, weight_after REAL, pickup_weight REAL, pickup_portions INTEGER, '
              + 'person_id TEXT, notes TEXT, created_at TEXT, '
              + 'calories REAL, protein REAL, fat REAL, carbs REAL, source TEXT'
              + ')', []);
            dbQuery(
              'INSERT INTO tray_pickup_logs (station_id, station_code, dish_name, category, meal_type, pickup_time, weight_before, weight_after, pickup_weight, pickup_portions, person_id, notes, created_at, calories, protein, fat, carbs, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [upDishInfo.stationId || null, stationCode, dishName, category, mealType, pickupTime, weightBefore, weightAfter, pickupWeight, portions, personId, 'MQTT计量主机: ' + (macSerial || macNo || deviceSn), now, 0, 0, 0, 0, 'mqtt']
            );
            console.log('[MQTT Upweight] ✓ SQLite tray_pickup_logs 写入成功');

            // ★ 通过 IPC 推送实时数据变更到前端（在 try 内部确保变量在作用域）
            if (trayWeightCallback) {
              try {
                trayWeightCallback({
                  type: 'pickup_log',
                  station_code: stationCode,
                  station_id: upDishInfo.stationId || null,
                  dish_name: dishName,
                  category: category,
                  pickup_weight: pickupWeight,
                  weight_before: weightBefore,
                  weight_after: weightAfter,
                  meal_type: mealType,
                  source: 'mqtt',
                  timestamp: now,
                });
              } catch (e) {
                console.warn('[MQTT Upweight] trayWeightCallback 调用失败:', e.message);
              }
            }
          } catch (e) {
            console.warn('[MQTT Upweight] SQLite tray_pickup_logs 写入失败:', e.message);
          }
        }

        // 异步写入 Supabase 云端 tray_pickup_logs
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supaUrl = supabaseUrl;
          const supaKey = supabaseAnonKey;
          if (supaUrl && supaKey) {
            const supa = createClient(supaUrl, supaKey);
            const stationCode = upDishInfo.stationCode || deviceSn || macNo || 'MQTT-' + recordId.slice(-6);
            const dishName = menuName || '未知菜品';
            const category = upDishInfo.category || '荤菜';
            const pickupWeight = Number(weight || menuWeigh || 0);
            const weightBefore = Number(menuWeigh || weight || 0);
            const weightAfter = Math.max(0, weightBefore - pickupWeight);
            const beijingHourX2 = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
            const mealType = ['早餐', '午餐', '晚餐'][beijingHourX2 < 10 ? 0 : beijingHourX2 < 16 ? 1 : 2];
            const pickupTime = macTime
              ? (macTime.includes('T') ? macTime : macTime.replace(' ', 'T') + '+08:00')
              : now;
            supa.from('tray_pickup_logs').insert({
              station_id: upDishInfo.stationId || null, station_code: stationCode, dish_name: dishName,
              category: category, meal_type: mealType, pickup_time: pickupTime,
              weight_before: weightBefore, weight_after: weightAfter,
              pickup_weight: pickupWeight, pickup_portions: quantity,
              person_id: upPersonId,
              notes: 'MQTT计量主机: ' + (macSerial || macNo || deviceSn),
              calories: 0, protein: 0, fat: 0, carbs: 0, source: 'mqtt',
            }).then(({ error }) => {
              if (error) console.warn('[MQTT Upweight] Supabase 写入失败:', error.message);
              else console.log('[MQTT Upweight] ✓ Supabase tray_pickup_logs 写入成功');
            });
          }
        } catch (e) {
          console.warn('[MQTT Upweight] Supabase 写入异常:', e.message);
        }
      } catch (err) {
        console.error('[MQTT Upweight] 解析失败:', err.message);
      }
    }
  });

  // ─── 时间校准定时器：每 20 秒下发一次 time-calibration-v4 和 v1 ───
  const calibrationTimer = setInterval(() => {
    if (aedes) {
      const ts = String(Date.now());
      aedes.publish({
        cmd: 'publish',
        topic: 'time-calibration-v4',
        payload: Buffer.from(ts),
        qos: 0,
        retain: false,
      }, () => {});
      aedes.publish({
        cmd: 'publish',
        topic: 'time-calibration',
        payload: Buffer.from(ts),
        qos: 0,
        retain: false,
      }, () => {});
      console.log(`[MQTT GW] 时间校准下发: time-calibration-v4 = ${ts}, time-calibration(V1) = ${ts}`);
    }
  }, 20000);

  return new Promise((resolve, reject) => {
    function tryPort(port, attempt = 0) {
      const MAX_ATTEMPTS = 10;
      const mqttServer = createNetServer(aedes.handle);
      mqttServer.listen(port, '0.0.0.0', () => {
        console.log(`[MQTT] Broker 启动: mqtt://0.0.0.0:${port}`);
        resolve({ server: mqttServer, port, aedes });
      });
      mqttServer.on('error', (err) => {
        const errCode = err ? (err.code || err.errno || 'unknown') : 'null';
        console.error(`[MQTT] Broker 端口 ${port} 启动失败 (attempt ${attempt + 1}/${MAX_ATTEMPTS}): code=${errCode}, message=${err?.message || 'no message'}, syscall=${err?.syscall || 'none'}`);

        if (attempt + 1 >= MAX_ATTEMPTS) {
          console.error(`[MQTT] 已达最大重试次数 ${MAX_ATTEMPTS}，放弃启动 MQTT Broker`);
          reject(err || new Error(`MQTT broker failed after ${MAX_ATTEMPTS} attempts`));
          return;
        }

        console.log(`[MQTT] 端口 ${port} 失败，尝试 ${port + 1}...`);
        tryPort(port + 1, attempt + 1);
      });
    }
    tryPort(preferredPort);
  });
}

export { mqttClients, mqttSensorLogs, mqttAllTopicLogs, mqttClientList,
         pushMqttSensorLog, getMqttSensorLogs, startMqttBroker,
         deviceWeightCache, cacheDeviceWeight, getLatestDeviceWeight, getLatestWeightForAnyDevice,
         deviceSessionWeights, updateDeviceSessionWeight, getDeviceSessionWeight,
         resolveDishNameSmart, cacheMenuIdDish,
         initWeightHistoryPersistence, persistWeightHistory, deviceWeightHistory };