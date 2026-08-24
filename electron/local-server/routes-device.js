import { createHash } from 'crypto';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { tokenMap, getCurrentMealType, getMealNameByType, getEffectiveMealPeriods, scaleOperators, saveScaleOperators, generateToken } from './config-store.js';
import { resolveDeviceSn, findDeviceBySign, updateDeviceStatus, updateDeviceLastPull, resolveMqttAddress, safeFetch, isOffline } from './utils.js';
import { fetchActiveProductItems, fetchTodayDishNutrition, parseContent, buildMealListFromProducts, buildRecipeDateList, buildRecipeDateListFromDishNutrition, resolveStationProductId, enrichWithPickupData } from './product-data.js';
import { mqttClients, mqttSensorLogs, mqttAllTopicLogs, mqttClientList, getMqttSensorLogs, getLatestDeviceWeight, getLatestWeightForAnyDevice, cacheDeviceWeight, updateDeviceSessionWeight, getDeviceSessionWeight, resolveDishNameSmart, cacheMenuIdDish } from './mqtt-broker.js';

export function mountDeviceRoutes(app, dbQuery, state, port, userDataPath, supabaseUrl, supabaseAnonKey, preferredMqttPort) {
  // ═══ 货品图片上传目录 ═══
  const sysfileUploadDir = path.join(userDataPath || '/tmp', 'sysfile-uploads');

  // ═══ 持久化文件路径 ═══
  const materialPhotosFile = path.join(userDataPath || '/tmp', 'material-photos.json');

  // 内存存储：货品照片（materialId -> [{ url, createdAt }]）
  const materialPhotos = new Map();
  // 待关联上传记录：上传时没有 materialId 的图片暂存这里，等下次查询时自动匹配
  const pendingUploads = []; // { url, createdAt, filename }
  const MAX_PENDING = 50;

  // ★ 设备→货品映射 TTL 常量（30分钟，防止连续拍照期间映射过期）
  const DEVICE_MATERIAL_TTL = 30 * 60 * 1000;

  // ★ 设备→货品映射：设备先 list/material-pic 查询货品照片 → 记录 IP→materialId
  //   设备随后 sysfile/upload 拍照上传时从映射补全 materialId，解决拍照不带货品ID的问题
  const deviceMaterialMap = new Map(); // key: clientIP, value: { materialId, expireAt }
  setInterval(() => {
    const now2 = Date.now();
    for (const [key, value] of deviceMaterialMap) {
      if (value.expireAt < now2) deviceMaterialMap.delete(key);
    }
  }, 60 * 1000); // 每分钟清理过期记录

  // ★ 辅助：刷新设备映射 TTL（每次成功上传时调用，保持映射活跃）
  function refreshDeviceMaterialMap(clientIP) {
    const record = deviceMaterialMap.get(clientIP);
    if (record) {
      record.expireAt = Date.now() + DEVICE_MATERIAL_TTL;
      console.log('[Mapping] 续期: ' + clientIP + ' → materialId=' + record.materialId + ', 到期=' + new Date(record.expireAt).toISOString());
    }
  }

  // ★ 定期清理超时的 pendingUploads（超过10分钟未关联的视为孤儿，自动丢弃）
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    const before = pendingUploads.length;
    // 从数组尾部清理（旧数据在头部）
    let removed = 0;
    while (pendingUploads.length > 0) {
      const oldest = pendingUploads[0];
      if (oldest.createdAt && new Date(oldest.createdAt).getTime() < cutoff) {
        pendingUploads.shift();
        removed++;
      } else {
        break;
      }
    }
    if (removed > 0) {
      console.log('[PendingUploads] 清理 ' + removed + ' 条超时孤儿 (剩余: ' + pendingUploads.length + ')');
    }
  }, 120 * 1000); // 每2分钟清理一次

  // ★ 持久化：从磁盘加载 materialPhotos 映射
  function loadMaterialPhotosFromDisk() {
    try {
      if (fs.existsSync(materialPhotosFile)) {
        const raw = fs.readFileSync(materialPhotosFile, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [id, pics] of Object.entries(data)) {
            if (Array.isArray(pics) && pics.length > 0) {
              materialPhotos.set(Number(id), pics);
            }
          }
          console.log('[MaterialPhotos] 从磁盘恢复 ' + materialPhotos.size + ' 个货品的照片映射');
        }
      } else {
        console.log('[MaterialPhotos] 无持久化文件，从零开始');
      }
    } catch(e) { console.warn('[MaterialPhotos] 加载持久化文件失败:', e.message); }
  }

  // ★ 持久化：保存 materialPhotos 到磁盘
  function saveMaterialPhotosToDisk() {
    try {
      const obj = {};
      for (const [id, pics] of materialPhotos.entries()) {
        if (Array.isArray(pics) && pics.length > 0) {
          obj[id] = pics;
        }
      }
      fs.writeFileSync(materialPhotosFile, JSON.stringify(obj, null, 2));
    } catch(e) { console.warn('[MaterialPhotos] 保存持久化文件失败:', e.message); }
  }

  // ★ 磁盘兜底扫描：扫描上传目录，为指定 materialId 自动关联照片
  // 【已禁用】此函数会把目录下所有图片无脑关联给单个 materialId，导致删除后重启又恢复。
  //   现在通过 pendingUploads + deviceMaterialMap 已经足够处理拍照关联。
  function syncFromDiskForMaterial(matId) {
    // 不再执行任何操作 —— 避免 orphan 文件污染已有货品照片
    return;
  }

  // ★ 辅助：只读 pendingUploads（不 drain），materialId=0 查询时使用
  // 设备可能先做全量查询再按具体货品查询，队列必须保留
  function peekPendingUploads() {
    return pendingUploads.slice();
  }

  // ★ 辅助：把 pendingUploads 合并到指定 materialId（drain 队列）
  function mergePendingUploadsToMaterial(targetId) {
    if (pendingUploads.length === 0 || !targetId) return false;
    const existing = materialPhotos.get(targetId) || [];
    const beforeCount = existing.length;
    const merged = [...existing];
    pendingUploads.splice(0).forEach(u => {
      if (!merged.some(p => p.url === u.url)) {
        merged.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString() });
      }
    });
    materialPhotos.set(targetId, merged);
    saveMaterialPhotosToDisk();
    console.log('[PendingMerge] ✓ pendingUploads(' + (merged.length - beforeCount) + '条) 合并到 materialId=' + targetId + ', 现有 ' + merged.length + ' 张');
    return true;
  }

  // ★ 辅助：判断货品是否有照片（内存 → pendingUploads）
  // 【已移除磁盘兜底扫描】防止 orphan 文件自动关联到查询的货品
  function getMaterialPicStatus(matId) {
    // 1) 内存中已有
    const pics = materialPhotos.get(matId) || [];
    if (pics.length > 0) return { hasPic: true, imageUrl: pics[0].url, count: pics.length };
    // 2) pendingUploads 中有未关联的也视为有图（设备可能上传后立即查询）
    if (pendingUploads.length > 0) return { hasPic: true, imageUrl: pendingUploads[0].url, count: pendingUploads.length };
    return { hasPic: false, imageUrl: '', count: 0 };
  }

  // ═══ 启动时加载持久化数据 ═══
  loadMaterialPhotosFromDisk();
  if (!fs.existsSync(sysfileUploadDir)) fs.mkdirSync(sysfileUploadDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, sysfileUploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `material_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  // ★ 构建完整的 getsetting 响应设备配置（28个字段，严格匹配厂商API文档）
  function buildGetSettingDeviceConfig(dbDevice) {
    return {
      MaxPriceListForTemporaryDishes: String(dbDevice?.max_price_temp_dish ?? 100),
      IntervalPriceListForTemporaryDishes: String(dbDevice?.interval_price_temp_dish ?? 0.5),
      MixPriceListForTemporaryDishes: String(dbDevice?.min_price_temp_dish ?? 0),
      ifBindplatebeforetakefood: String(dbDevice?.bind_plate_before_take ?? 1),
      deviceUITemplate: String(dbDevice?.ui_template ?? 1),
      weighAlarmModel: String(dbDevice?.weigh_alarm_model ?? 1),
      minimumsettlementweight: String(dbDevice?.min_settlement_weight ?? 10),
      stabledifference: String(dbDevice?.stable_difference ?? 2),
      alarmBelowHowGrams: String(dbDevice?.alarm_below_grams ?? -1000),
      maxWeightDish: String(dbDevice?.max_weight_dish ?? 5000),
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
  }

  // ★ 精简 get-main-device 返回的菜品数据，只保留商场要求的字段
  // actualWeight 可选：如果传了就用实际取餐重量替代默认的 weight
  function buildLeanMainDeviceDish(raw, actualWeightOverride) {
    const nutrition = {
      protein: Number(raw.protein) || Number(raw.nutrition?.protein) || 0,
      fat: Number(raw.fat) || Number(raw.nutrition?.fat) || 0,
      carbohydrate: Number(raw.carbohydrate) || Number(raw.carbs) || Number(raw.nutrition?.carbs) || Number(raw.nutrition?.carbohydrate) || 0,
      dietaryFiber: Number(raw.dietaryFiber) || Number(raw.fiber) || 0,
      calcium: Number(raw.calcium) || 0,
      calories: Number(raw.calories) || Number(raw.nutrition?.calories) || 0,
    };
    return {
      dishId: raw.dishId || String(raw.id) || String(raw.dishesId) || 'DISH_' + (raw.id || raw.dishesId || '0001'),
      name: raw.name || raw.dishName || raw.productName || '未知菜品',
      weight: (actualWeightOverride != null && actualWeightOverride > 0) ? actualWeightOverride : (Number(raw.target_weight) || Number(raw.weight) || 480),
      nutrition,
    };
  }

  // ★★★ 新版 get-main-device / meal-current 响应构建器 ★★★
  // 返回格式：{ dishId, dishName, targetWeight, nutritionPer100g, initialWeight, currentWeight, mealWeight, actualNutrition }
  // 整合菜品营养基准数据 + 实时会话重量 + 计算实际营养值
  function buildMainDeviceResponse(raw, deviceSn) {
    const nutritionPer100g = {
      protein: Number(raw.protein) || Number(raw.nutrition?.protein) || 0,
      fat: Number(raw.fat) || Number(raw.nutrition?.fat) || 0,
      carbohydrate: Number(raw.carbohydrate) || Number(raw.carbs) || Number(raw.nutrition?.carbs) || Number(raw.nutrition?.carbohydrate) || 0,
      dietaryFiber: Number(raw.dietaryFiber) || Number(raw.fiber) || 0,
      calcium: Number(raw.calcium) || 0,
      calories: Number(raw.calories) || Number(raw.nutrition?.calories) || 0,
    };
    const dishId = raw.dishId || String(raw.id) || String(raw.dishesId) || 'DISH_' + (raw.id || raw.dishesId || '0001');
    const dishName = raw.name || raw.dishName || raw.productName || '未知菜品';
    const targetWeight = Number(raw.target_weight) || Number(raw.weight) || 480;

    // 获取会话重量
    const session = getDeviceSessionWeight(deviceSn);
    const initialWeight = session.initialWeight;
    const currentWeight = session.currentWeight;
    // ★ 营养成分和显示重量基于最近一次取餐重量，非累计值
    const displayWeight = session.lastDropWeight > 0 ? session.lastDropWeight : session.mealWeight;

    // 计算实际营养值: (displayWeight / 100) × nutritionPer100g
    const factor = displayWeight / 100;
    const actualNutrition = displayWeight > 0 ? {
      calories: Math.round(nutritionPer100g.calories * factor * 10) / 10,
      protein: Math.round(nutritionPer100g.protein * factor * 10) / 10,
      fat: Math.round(nutritionPer100g.fat * factor * 10) / 10,
      carbohydrate: Math.round(nutritionPer100g.carbohydrate * factor * 10) / 10,
      dietaryFiber: Math.round(nutritionPer100g.dietaryFiber * factor * 10) / 10,
      calcium: Math.round(nutritionPer100g.calcium * factor * 10) / 10,
    } : {
      calories: 0, protein: 0, fat: 0, carbohydrate: 0, dietaryFiber: 0, calcium: 0,
    };

    return {
      dishId,
      dishName,
      targetWeight,
      nutritionPer100g,
      initialWeight,
      currentWeight,
      mealWeight: displayWeight,
      actualNutrition,
    };
  }

  // ★★★ 前端兼容包装器：将 buildMainDeviceResponse 输出映射为前端期望格式
  // mealWeight → actualWeight，nutritionPer100g → nutrition，加 deviceConfig
  function buildFrontendCompatDishResponse(dishData, dbDevice) {
    if (!dishData) return { dishes: [], deviceConfig: buildGetSettingDeviceConfig(dbDevice) };
    // ★ mealWeight 已在 buildMainDeviceResponse 中替换为 displayWeight(非累计)
    const displayWeight = dishData.mealWeight;
    const hasRealWeight = displayWeight > 0;
    const dish = {
      dishId: dishData.dishId,
      name: dishData.dishName,
      weight: hasRealWeight ? displayWeight : dishData.targetWeight,
      nutrition: {
        protein: hasRealWeight ? dishData.actualNutrition.protein : dishData.nutritionPer100g.protein,
        fat: hasRealWeight ? dishData.actualNutrition.fat : dishData.nutritionPer100g.fat,
        carbohydrate: hasRealWeight ? dishData.actualNutrition.carbohydrate : dishData.nutritionPer100g.carbohydrate,
        dietaryFiber: hasRealWeight ? dishData.actualNutrition.dietaryFiber : dishData.nutritionPer100g.dietaryFiber,
        calcium: hasRealWeight ? dishData.actualNutrition.calcium : dishData.nutritionPer100g.calcium,
        calories: hasRealWeight ? dishData.actualNutrition.calories : dishData.nutritionPer100g.calories,
      },
      actualWeight: displayWeight,
      actualNutrition: dishData.actualNutrition,
    };
    return {
      dishes: [dish],
      deviceConfig: buildGetSettingDeviceConfig(dbDevice),
    };
  }

  // ★ 根据设备SN查询最近一次取餐重量，并计算实际营养值（每100g基准 × 实际克重/100）
  // 查询链路：设备SN → tray_display_devices.station_id → tray_stations.station_code → tray_pickup_logs
  function computeActualNutrition(dbQuery, deviceSn, dishName, baseNutrition) {
    if (!dbQuery || !deviceSn) return { actualWeight: 0, actualNutrition: {} };
    try {
      // ★★★ 使用北京时间 +08:00 格式，与 pickup_time 存储格式一致，确保 SQLite 字符串比较正确
      const cutoffBeijing = new Date(Date.now() + 8 * 3600 * 1000 - 30 * 60 * 1000).toISOString().replace('Z', '+08:00');
      let rows = null;

      // ★★ 第一步：从设备表找到 station_id，再查托盘站的 station_code
      // tray_pickup_logs.station_code 存的是 "TRY-001" 这种站号，不是设备SN
      let stationCode = null;
      try {
        const devRows = dbQuery('SELECT station_id FROM tray_display_devices WHERE sn = ?', [deviceSn]);
        if (devRows && devRows.length > 0 && devRows[0].station_id) {
          const stRows = dbQuery('SELECT station_code FROM tray_stations WHERE id = ?', [devRows[0].station_id]);
          if (stRows && stRows.length > 0 && stRows[0].station_code) {
            stationCode = stRows[0].station_code;
          }
        }
        // 短SN兜底
        if (!stationCode) {
          const shortSn = deviceSn.includes('@') ? deviceSn.split('@').pop() : deviceSn;
          const devRows2 = dbQuery('SELECT station_id FROM tray_display_devices WHERE sn LIKE ?', ['%@' + shortSn]);
          if (devRows2 && devRows2.length > 0 && devRows2[0].station_id) {
            const stRows2 = dbQuery('SELECT station_code FROM tray_stations WHERE id = ?', [devRows2[0].station_id]);
            if (stRows2 && stRows2.length > 0 && stRows2[0].station_code) {
              stationCode = stRows2[0].station_code;
            }
          }
        }
      } catch (e) { /* ignore */ }

      // 1) 优先：通过 station_code + dish_name 精确匹配
      if (stationCode && dishName) {
        rows = dbQuery(
          'SELECT pickup_weight FROM tray_pickup_logs WHERE station_code = ? AND dish_name = ? AND pickup_time > ? ORDER BY pickup_time DESC LIMIT 1',
          [stationCode, dishName, cutoffBeijing]
        );
      }

      // 2) station_code + 不限制菜名
      if ((!rows || rows.length === 0) && stationCode) {
        rows = dbQuery(
          'SELECT pickup_weight, dish_name FROM tray_pickup_logs WHERE station_code = ? AND pickup_time > ? ORDER BY pickup_time DESC LIMIT 1',
          [stationCode, cutoffBeijing]
        );
      }

      // 3) 短SN模糊匹配 station_code（设备可能是传感器网关，直接拿SN当站号）
      if (!rows || rows.length === 0) {
        const shortSn = deviceSn.includes('@') ? deviceSn.split('@').pop() : deviceSn;
        rows = dbQuery(
          'SELECT pickup_weight, dish_name FROM tray_pickup_logs WHERE station_code LIKE ? AND pickup_time > ? ORDER BY pickup_time DESC LIMIT 1',
          ['%' + shortSn + '%', cutoffBeijing]
        );
      }

      // 4) 最终兜底：查全局最近30分钟任意取餐记录
      if (!rows || rows.length === 0) {
        rows = dbQuery(
          'SELECT pickup_weight, dish_name FROM tray_pickup_logs WHERE pickup_time > ? ORDER BY pickup_time DESC LIMIT 1',
          [cutoffBeijing]
        );
      }

      const actualWeight = (rows && rows.length > 0) ? (Number(rows[0].pickup_weight) || 0) : 0;
      if (actualWeight <= 0) return { actualWeight: 0, actualNutrition: {} };

      const ratio = actualWeight / 100;
      return {
        actualWeight,
        actualNutrition: {
          protein: Math.round((baseNutrition.protein || 0) * ratio * 10) / 10,
          fat: Math.round((baseNutrition.fat || 0) * ratio * 10) / 10,
          carbohydrate: Math.round((baseNutrition.carbohydrate || 0) * ratio * 10) / 10,
          dietaryFiber: Math.round((baseNutrition.dietaryFiber || 0) * ratio * 10) / 10,
          calcium: Math.round((baseNutrition.calcium || 0) * ratio * 10) / 10,
          calories: Math.round((baseNutrition.calories || 0) * ratio * 10) / 10,
        }
      };
    } catch (e) {
      console.warn('[computeActualNutrition] 查询失败: ' + e.message);
      return { actualWeight: 0, actualNutrition: {} };
    }
  }

  // ★ 统一的设备配置查询: 纯局域网环境，只读本地 SQLite
  async function resolveDeviceConfig(sn) {
    let dbDevice = null;
    console.log('[resolveDeviceConfig] ★ 入参 sn=' + JSON.stringify(sn) + ', dbQuery=' + !!dbQuery);
    if (sn && dbQuery) {
      try {
        let rows = dbQuery('SELECT ui_template, bind_plate_before_take, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish FROM tray_display_devices WHERE sn = ?', [sn]);
        // ★ 短SN兜底：设备可能传来 "3000004186"，而数据库存的是 "device@1000000001@3000004186"
        if ((!rows || rows.length === 0) && !sn.includes('@')) {
          rows = dbQuery('SELECT ui_template, bind_plate_before_take, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish FROM tray_display_devices WHERE sn LIKE ?', ['%@' + sn]);
          if (rows && rows.length > 0) {
            console.log('[resolveDeviceConfig] ★ 短SN LIKE兜底命中: ' + sn + ' → sn=' + rows[0].sn);
          }
        }
        console.log('[resolveDeviceConfig] SQLite 返回 ' + (rows ? rows.length : 0) + ' 行, sn=' + sn);
        if (rows && rows.length > 0) {
          dbDevice = rows[0];
          console.log('[resolveDeviceConfig] ★ 命中! ui_template=' + dbDevice.ui_template + ' (type=' + typeof dbDevice.ui_template + '), 完整行: ' + JSON.stringify(dbDevice));
        } else {
          console.log('[resolveDeviceConfig] ★★★ SN 未匹配! sn=' + sn + ' 在 tray_display_devices 表中不存在!');
        }
      } catch (e) { console.warn('[resolveDeviceConfig] SQLite 查询异常: ' + e.message); }
    } else {
      console.log('[resolveDeviceConfig] ★★★ 跳过查询: sn=' + JSON.stringify(sn) + ' (无效) 或 dbQuery 不可用');
    }
    return dbDevice;
  }

  // ═══ 设备配置更新 API（浏览器管理后台直写本地 SQLite）═══
  app.post('/api/device/update-config', (req, res) => {
    console.log('[DeviceUpdateConfig] ══════════════════════════════════════');
    console.log('[DeviceUpdateConfig] ★★★ 收到 POST 请求! ★★★');
    console.log('[DeviceUpdateConfig] req.body keys: ' + JSON.stringify(Object.keys(req.body || {})));
    console.log('[DeviceUpdateConfig] req.body: ' + JSON.stringify(req.body).substring(0, 500));
    const body = req.body || {};
    const id = Number(body.id);
    const data = body.data || {};
    console.log('[DeviceUpdateConfig] 解析后: id=' + id + ', data keys=' + JSON.stringify(Object.keys(data)) + ', data=' + JSON.stringify(data));
    if (!id || Object.keys(data).length === 0) {
      console.log('[DeviceUpdateConfig] ★★★ 参数校验失败: id=' + id + ', dataKeys=' + JSON.stringify(Object.keys(data)) + ' ★★★');
      return res.json({ code: 1, msg: '参数错误：缺少 id 或 data' });
    }
    if (!dbQuery) {
      console.log('[DeviceUpdateConfig] ★★★ dbQuery 不可用! ★★★');
      return res.json({ code: 1, msg: '数据库不可用' });
    }
    try {
      const keys = Object.keys(data);
      const setClauses = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => data[k]);
      dbQuery(
        `UPDATE tray_display_devices SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`,
        [...values, id]
      );
      console.log('[DeviceUpdateConfig] ✓ 本地 SQLite 更新: id=' + id + ', 字段=' + keys.join(',') + ', 值=' + JSON.stringify(data));
      return res.json({ code: 10000, msg: '成功', data: { id, updated: keys.length } });
    } catch (e) {
      console.error('[DeviceUpdateConfig] 更新失败: ' + e.message);
      return res.json({ code: 1, msg: e.message });
    }
  });

  // ═══ 设备注册 ═══
  async function handleDeviceRegister(req, res) {
    const body = req.body || {}; const query = req.query || {}; const headers = req.headers || {};
    const sn = headers['machine-sn'] || headers['machinesn'] || headers['x-machine-sn'] || headers['sn'] || headers['device-sn'] ||
      body.sn || body.SN || body.deviceSn || body.deviceSN || body.machineCode || body.deviceCode || body.code || body.snCode || body.serialNumber || body.serialNo ||
      query.sn || query.SN || query.deviceSn || query.deviceSN || query.machineCode || query.deviceCode || query.code || query.snCode || query.serialNumber || query.serialNo || '';
    const key = headers['machine-key'] || headers['x-machine-key'] || headers['key'] || headers['device-key'] ||
      body.key || body.KEY || body.hwKey || body.deviceKey || body.secretKey || body.authKey || body.authCode || body.secret || body.password || body.deviceSecret || body.apiKey || body.sign ||
      query.key || query.KEY || query.hwKey || query.deviceKey || query.secretKey || query.authKey || query.authCode || query.secret || query.password || query.deviceSecret || query.apiKey || query.sign || '';
    if (!sn) return res.status(400).json({ code: 400, msg: '缺少参数: sn 必填', data: null });
    let hwKey = key;
    if (dbQuery && sn) {
      let existing = dbQuery('SELECT id, hw_key, sn FROM tray_display_devices WHERE sn = ?', [sn]);
      // ★ 短SN兜底：设备注册时传来 "3000004186"，数据库已有 "device@1000000001@3000004186"
      if ((!existing || existing.length === 0) && !sn.includes('@')) {
        existing = dbQuery('SELECT id, hw_key, sn FROM tray_display_devices WHERE sn LIKE ?', ['%@' + sn]);
        if (existing && existing.length > 0) {
          console.log('[DeviceRegister] ★ 短SN LIKE命中已有设备: ' + sn + ' → ' + existing[0].sn);
        }
      }
      if (!existing || existing.length === 0) {
        const now = new Date().toISOString();
        dbQuery('INSERT OR IGNORE INTO tray_display_devices (name, sn, hw_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [sn, sn, hwKey || '', 'online', now, now]);
        dbQuery('UPDATE tray_display_devices SET status = ?, hw_key = ?, updated_at = ? WHERE sn = ?', ['online', hwKey || '', now, sn]);
      } else {
        hwKey = existing[0].hw_key || hwKey;
        // ★ 用数据库中的完整 SN 替换短 SN，后续查询都走同一行
        if (existing[0].sn && existing[0].sn !== sn) {
          console.log('[DeviceRegister] ★ 归一化SN: ' + sn + ' → ' + existing[0].sn);
          sn = existing[0].sn;
        }
      }
    }
    let devices = [];
    if (dbQuery) {
      const snRows = dbQuery('SELECT id, hw_key FROM tray_display_devices WHERE sn = ?', [sn]);
      if (snRows && snRows.length > 0) { const dbHwKey = snRows[0].hw_key || ''; if (dbHwKey === '' || !hwKey || hwKey === dbHwKey) { devices = snRows; hwKey = dbHwKey || hwKey; } }
    }
    if (!devices || devices.length === 0) return res.status(403).json({ code: 403, msg: '验证失败', data: null });
    const token = generateToken(); tokenMap.set(sn, token);
    const { mqClientAddress, mqttHost } = resolveMqttAddress(req, state, preferredMqttPort, '设备注册');
    await updateDeviceStatus(supabaseUrl, supabaseAnonKey, dbQuery, sn, token, 'online');
    const dbDevice = dbQuery ? dbQuery('SELECT ui_template, bind_plate_before_take, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish FROM tray_display_devices WHERE sn = ?', [sn])[0] : null;
    // 提取短SN用于 MQTT 用户名（device@merchant@SN → 取最后的SN部分）
    const shortSn = sn.includes('@') ? sn.split('@').pop() : sn;
    return res.json({ code: 10000, msg: 'success', data: { token, mqClientAddress, mqttHost, mqttPort: state.mqttPort || preferredMqttPort, username: `device_${shortSn}`, password: token, httpPort: state.httpPort || port, tenantId: Number(req.headers['merchant-id'] || req.headers['merchantid'] || req.headers['x-merchant-id'] || '1000000001'), deviceConfig: buildGetSettingDeviceConfig(dbDevice) } });
  }
  app.post('/api/device/register', (req, res) => {
    const ftidReg = 'freeze_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    console.log('[FREEZE-DEBUG] [traceId=' + ftidReg + '] ══════════════════════════════════════');
    console.log('[FREEZE-DEBUG] [traceId=' + ftidReg + '] ★★★ 设备注册/登录 被调用');
    console.log('[FREEZE-DEBUG] [traceId=' + ftidReg + '] 路径=' + req.path + ', 方法=' + req.method);
    console.log('[FREEZE-DEBUG] [traceId=' + ftidReg + '] machine-sn=' + JSON.stringify(req.headers['machine-sn']));
    console.log('[FREEZE-DEBUG] [traceId=' + ftidReg + '] 新安装/重启后首次注册? (每次重启设备都会注册,有token缓存则不注册)');
    return handleDeviceRegister(req, res);
  });
  app.get('/api/device/register', (req, res) => {
    const ftidReg2 = 'freeze_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    console.log('[FREEZE-DEBUG] [traceId=' + ftidReg2 + '] ══════════════════════════════════════');
    console.log('[FREEZE-DEBUG] [traceId=' + ftidReg2 + '] ★★★ 设备注册/登录(GET) 被调用');
    console.log('[FREEZE-DEBUG] [traceId=' + ftidReg2 + '] 路径=' + req.path + ', machine-sn=' + JSON.stringify(req.headers['machine-sn']));
    return handleDeviceRegister(req, res);
  });

  // ═══ 电子秤设备 OAuth 登录 ═══
  async function handleScaleLogin(req, res) {
    console.log('[ScaleInbound-Login] ====== 入库秤登录 ======');
    console.log('[ScaleInbound-Login] ' + req.method + ' ' + req.url);
    console.log('[ScaleInbound-Login] Content-Type: ' + (req.headers['content-type'] || '(none)'));
    console.log('[ScaleInbound-Login] 客户端IP: ' + (req.ip || req.headers['x-forwarded-for'] || 'unknown'));
    // ★ 修复：手动解析 raw body，避免 URLSearchParams 把 base64 的 + 变空格
    let body = req.body || {};
    const rawBody = req.rawBody || '';
    console.log('[ScaleInbound-Login] rawBody(' + rawBody.length + '): ' + rawBody.substring(0, 500));
    // 如果 body 解析为空或只有 content 字段，从 raw body 重新手动解析
    if (rawBody && (Object.keys(body).length === 0 || (Object.keys(body).length === 1 && body.content))) {
      try {
        const manualParams = {};
        const parts = rawBody.split('&');
        for (const part of parts) {
          const eqIdx = part.indexOf('=');
          if (eqIdx === -1) continue;
          const key = decodeURIComponent(part.substring(0, eqIdx));
          const val = decodeURIComponent(part.substring(eqIdx + 1));
          manualParams[key] = val;
        }
        body = manualParams;
        console.log('[ScaleInbound-Login] 手动解析 body keys: ' + JSON.stringify(Object.keys(body)));
      } catch (e) { console.warn('[ScaleInbound-Login] 手动解析失败: ' + e.message); }
    }
    const query = req.query || {};
    console.log('[ScaleInbound-Login] query keys: ' + JSON.stringify(Object.keys(query)));
    let rawContent = query.content || '';
    if (!rawContent && body.content && typeof body.content === 'string') rawContent = body.content;
    if (rawContent) {
      try {
        const p = JSON.parse(rawContent);
        body = { ...body, ...p };
        console.log('[ScaleInbound-Login] content 解析成功: ' + JSON.stringify(Object.keys(p)));
      } catch (e) { console.log('[ScaleInbound-Login] content 解析失败: ' + e.message); }
    }
    // ★ 同时从 body 和 query 读取参数（设备可能用 GET ?username=001&password=2019）
    const workNo = (body.workNo || query.workNo || body.work_no || query.work_no || body.username || query.username || body.loginName || query.loginName || body.login_name || query.login_name || body.operatorId || query.operatorId || body.operator_id || query.operator_id || body.employeeId || query.employeeId || body.employee_id || query.employee_id || body.userId || query.userId || body.user_id || query.user_id || body.account || query.account || body.jobNo || query.jobNo || body.job_no || query.job_no || body.staffNo || query.staffNo || body.staff_no || query.staff_no || body.code || query.code || body.no || query.no || '').trim();
    const password = body.password || query.password || body.passwd || query.passwd || body.pwd || query.pwd || '';
    console.log('[ScaleInbound-Login] 解析后 workNo="' + workNo + '" password="' + (password ? '***' : '(空)') + '" pwLen=' + password.length + ' dbQuery=' + !!dbQuery + ' memOps=' + scaleOperators.length + ' memList=' + scaleOperators.map(o => o.work_no + ':' + o.name).join(', '));
    const merchantId = (req.headers['merchant-id'] || req.headers['merchantid'] || '').trim();
    const xToken = (req.headers['x-token'] || '').trim();
    const machineSn = (req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();
    if (workNo && password) {
      let operator = null;
      let sqliteError = null;
      if (dbQuery) { 
        try { 
          let rows = dbQuery('SELECT work_no, login_name, name, password_hash, is_active FROM scale_operators WHERE work_no = ? AND is_active = 1', [workNo]); 
          if (!rows || rows.length === 0) {
            rows = dbQuery('SELECT work_no, login_name, name, password_hash, is_active FROM scale_operators WHERE login_name = ? AND is_active = 1', [workNo]);
          }
          console.log('[ScaleInbound-Login] SQLite查询结果: ' + (rows ? rows.length : 0) + ' 条');
          if (rows && rows.length > 0) { operator = rows[0]; console.log('[ScaleInbound-Login] SQLite命中: ' + rows[0].name + ' hash=' + (rows[0].password_hash || '(empty)')); }
          else {
            const allOps = dbQuery('SELECT work_no, login_name, name, is_active FROM scale_operators', []);
            console.log('[ScaleInbound-Login] SQLite全部操作员: ' + JSON.stringify(allOps || []));
          }
        } catch (e) { sqliteError = e.message; console.warn('[ScaleInbound-Login] SQLite查询异常:', sqliteError); } 
      }
      if (!operator) { 
        const mo = scaleOperators.find(o => (o.work_no === workNo || o.login_name === workNo) && o.is_active); 
        if (mo) { operator = { work_no: mo.work_no, login_name: mo.login_name, name: mo.name, password_hash: mo.password_hash || '' }; console.log('[ScaleInbound-Login] 内存命中: ' + mo.name); }
        else { console.log('[ScaleInbound-Login] 内存也未找到 workNo=' + workNo + ', 内存列表: ' + scaleOperators.map(o => o.work_no + ':' + o.name).join(', ')); }
      }
      // ★ 终极兜底：001 是系统内置免密账号，任何密码都必须放行（设备会加密密码，不能按明文"2019"判断）
      if (!operator && workNo === '001') {
        console.log('[ScaleInbound-Login] 兜底放行 001（内置免密账号），正在修复数据库...');
        const defaultHash = createHash('md5').update('2019').digest('base64');
        // 修复数据库：确保 001 存在且启用
        if (dbQuery) {
          try {
            const cols = (dbQuery('PRAGMA table_info(scale_operators)', []) || []).map(c => c.name);
            if (!cols.includes('password_hash')) { dbQuery('ALTER TABLE scale_operators ADD COLUMN password_hash TEXT NOT NULL DEFAULT ?', ['2019']); console.log('[ScaleInbound-Login] 自动添加 password_hash 列'); }
          } catch (e) {}
          try {
            dbQuery('INSERT OR IGNORE INTO scale_operators (work_no, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)', ['001', '默认操作员', defaultHash, 'operator', 1]);
            // ★ 若 001 已存在但被禁用，重新启用
            dbQuery('UPDATE scale_operators SET is_active = 1 WHERE work_no = ?', ['001']);
            console.log('[ScaleInbound-Login] 自动插入/启用默认操作员 001（密码已哈希）');
          } catch (e) {}
        }
        operator = { work_no: '001', name: '默认操作员', password_hash: defaultHash, role: 'operator', is_active: true, device_sn: '', phone: '' };
        // 确保内存也有
        if (!scaleOperators.find(o => o.work_no === '001')) {
          scaleOperators.push({ work_no: '001', name: '默认操作员', password_hash: defaultHash, role: 'operator', is_active: true, device_sn: '', phone: '', _token: null });
          saveScaleOperators();
        }
      }
      if (operator) {
        const storedHash = operator.password_hash || '';
        // ★ 直接比对：存储和传输都是 MD5+base64，直接 ===
        let passwordMatch = false;
        if (workNo === '001') {
          // 001 跳过密码校验，直接通过
          passwordMatch = true;
          console.log('[ScaleInbound-Login] 001 免密登录，跳过密码校验');
        } else {
          passwordMatch = (password === storedHash);
        }
        // 兜底：存储是空的或短明文，统一用默认密码 '2019' 的 MD5+base64 比对
        const looksLikeHash = storedHash.length === 24 && /^[A-Za-z0-9+/=]+$/.test(storedHash);
        if (!passwordMatch && !looksLikeHash) {
          const defaultHash = crypto.createHash('md5').update('2019').digest('base64');
          passwordMatch = (password === defaultHash);
          if (passwordMatch) {
            // ★ 比对成功后立即升级 SQLite + 内存中的密码为哈希格式
            if (dbQuery) { try { dbQuery('UPDATE scale_operators SET password_hash = ? WHERE work_no = ?', [defaultHash, operator.work_no]); } catch (e) {} }
            const mo = scaleOperators.find(o => o.work_no === operator.work_no);
            if (mo) { mo.password_hash = defaultHash; saveScaleOperators(); }
            console.log('[ScaleInbound-Login] 密码比对成功并已升级为哈希: ' + operator.work_no);
          }
          console.log('[ScaleInbound-Login] 默认密码回退比对: storedLen=' + storedHash.length + ' match=' + passwordMatch);
        }
        console.log('[ScaleInbound-Login] 密码比对: match=' + passwordMatch + ' storedHashLen=' + storedHash.length + ' pwLen=' + password.length);
        if (passwordMatch) {
          console.log('[ScaleInbound-Login] 登录成功! workNo=' + workNo + ' name=' + operator.name);
          const token = generateToken(); tokenMap.set('scale:' + workNo, token);
          const mu = scaleOperators.find(o => o.work_no === workNo); if (mu) { mu._token = token; saveScaleOperators(); }
          return res.json({ code: 10000, msg: 'success', data: { token, userInfo: { workNo: operator.work_no || workNo, name: operator.name || workNo } } });
        }
        console.log('[ScaleInbound-Login] 密码错误: workNo=' + workNo + ' name=' + operator.name);
        return res.json({ code: 1, msg: '密码错误', data: null });
      }
      console.log('[ScaleInbound-Login] 操作员不存在: workNo=' + workNo);
      return res.json({ code: 1, msg: '操作员不存在', data: null });
    }
    if (merchantId && xToken) {
      let opWn = '001', opNm = '默认操作员';
      if (dbQuery && machineSn) { try { const rows = dbQuery('SELECT * FROM scale_operators WHERE device_sn = ? AND is_active = 1 LIMIT 1', [machineSn]); if (rows && rows.length > 0) { opWn = rows[0].work_no; opNm = rows[0].name; } } catch (e) { } }
      let operator = scaleOperators.find(o => o.work_no === opWn && o.is_active);
      if (!operator && dbQuery) { try { const rows = dbQuery('SELECT * FROM scale_operators WHERE work_no = ? AND is_active = 1', [opWn]); if (rows && rows.length > 0) operator = rows[0]; } catch (e) { } }
      if (operator) {
        const token = generateToken(); tokenMap.set('scale:' + opWn, token);
        const mu = scaleOperators.find(o => o.work_no === opWn); if (mu) { mu._token = token; saveScaleOperators(); }
        return res.json({ code: 10000, msg: 'success', data: { token, userInfo: { workNo: opWn, name: opNm }, deviceSn: machineSn } });
      }
      return res.json({ code: 1, msg: '用户不存在', data: null });
    }
    return res.json({ code: 1, msg: '用户不存在', data: null });
  }

  // 入库电子秤登录 — 兼容所有路径变体
  app.all('/api/v2/oauth/device/token', handleScaleLogin);
  app.all('/tengyun-api/api/v2/oauth/device/token', handleScaleLogin);
  app.all('/tengyun-api/api/2/oauth/device/token', handleScaleLogin);
  app.all('/tengyun-api/api/v2/0auth/device/token', handleScaleLogin);
  app.all('/api/2/oauth/device/token', handleScaleLogin);
  app.all('/api/v2/0auth/device/token', handleScaleLogin);

  // ═══ 菜品查询 API ═══
  app.get('/api/dishes', async (req, res) => {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || (req.query || {}).token || '';
    if (!t || !Array.from(tokenMap.values()).includes(t)) return res.status(401).json({ code: 401, msg: '未授权', data: null });
    try {
      let dishes = await fetchTodayDishNutrition(supabaseUrl, supabaseAnonKey, dbQuery);
      // ★ 防止撑爆硬件：今日无菜品时不拉全量
      if (!dishes) dishes = [];
      return res.json({ code: 0, msg: 'success', data: { dishes } });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  // ═══ 密钥交换 handler（多路由复用）═══
  function handleYunshitangExchangeKey(req, res) {
    try {
      const body = req.body || {};
      const headers = req.headers || {};
      const parsedContent = parseContent(body);
      const clientKeyFromContent = parsedContent.clientKey || parsedContent.key || parsedContent.deviceKey || '';
      const snFromContent = parsedContent.sn || parsedContent.SN || parsedContent.deviceSn || parsedContent.machineSn || '';
      const machineKey = headers['machine-key'] || headers['machinekey'] || headers['x-machine-key'] || headers['key'] || '';
      const snFromHeader = headers['machine-sn'] || headers['machinesn'] || headers['machine-num'] || headers['machinenum'] || '';
      let snFromContentSign = '';
      if (parsedContent.sign && parsedContent.nonceStr && parsedContent.timestamp && dbQuery) {
        const dev = findDeviceBySign(dbQuery, { sign: parsedContent.sign, nonceStr: parsedContent.nonceStr, timestamp: parsedContent.timestamp, version: parsedContent.version || '' });
        if (dev) snFromContentSign = dev.sn || '';
      }
      const snFromResolve = resolveDeviceSn(req, dbQuery);
      let sn = snFromHeader || snFromContent || snFromContentSign || snFromResolve || '';
      // ★★★ 关键修复：短SN归一化为完整格式（同 resolveDeviceSn 逻辑）
      // 设备可能传来 "3000004157"，数据库存的是 "device@586919357196537900@3000004157"
      if (sn && !sn.includes('@') && dbQuery) {
        try {
          const fullRows = dbQuery('SELECT sn FROM tray_display_devices WHERE sn LIKE ? LIMIT 1', ['%@' + sn]);
          if (fullRows && fullRows.length > 0) {
            console.log('[ExchangeKey] ★ 短SN归一化: ' + sn + ' → ' + fullRows[0].sn);
            sn = fullRows[0].sn;
          }
        } catch (e) { /* 归一化失败保持原SN */ }
      }
      let hwKey = '';
      if (sn && dbQuery) { try { const rows = dbQuery('SELECT hw_key FROM tray_display_devices WHERE sn = ?', [sn]); if (rows && rows.length > 0) hwKey = rows[0].hw_key || ''; } catch (e) { } }
      // ★ 短SN兜底：如果精确匹配失败，用LIKE再试一次
      if (!hwKey && sn.includes('@') && dbQuery) {
        const shortSn = sn.split('@').pop();
        try {
          const likeRows = dbQuery('SELECT hw_key FROM tray_display_devices WHERE sn LIKE ? LIMIT 1', ['%@' + shortSn]);
          if (likeRows && likeRows.length > 0) hwKey = likeRows[0].hw_key || '';
          console.log('[ExchangeKey] ★ 短SN兜底查询: ' + shortSn + ' → hwKey=' + (hwKey ? '***' : '(空)'));
        } catch (e) { }
      }
      if (!hwKey && dbQuery) { try { const allDev = dbQuery('SELECT sn, hw_key FROM tray_display_devices LIMIT 5', []); if (allDev && allDev.length === 1 && allDev[0].hw_key) hwKey = allDev[0].hw_key; } catch (e) { } }
      if (sn && !hwKey) hwKey = sn;
      console.log('[ExchangeKey] ★ 最终: sn=' + sn + ', clientKey=' + (clientKeyFromContent ? '***' : '(无)') + ', hwKey=' + (hwKey ? hwKey.substring(0, 6) + '...' : '(空)'));
      let clientKey = (clientKeyFromContent || body.clientKey || machineKey || '').trim();
      if (clientKey && clientKey.includes(' ')) clientKey = clientKey.replace(/ /g, '+');
      const now = Date.now();
      let key = ''; let keyForExchange = '';

      // ★★★ 新APK兼容：统一返回32字符hex格式key，避免base64特殊字符(+ / =)导致设备端KV存储解析失败
      if (clientKey && clientKey.length > 0 && clientKey.length <= 10) {
        keyForExchange = clientKey;
        key = crypto.createHash('sha256').update(clientKey).digest('hex').slice(0, 32);
      } else if (clientKey && clientKey.length > 10) {
        keyForExchange = clientKey;
        key = crypto.createHash('sha256').update(clientKey + '__leinu_local_salt__').digest('hex').slice(0, 32);
      } else if (hwKey && hwKey.length > 0) {
        keyForExchange = hwKey;
        if (hwKey.length >= 16 && /^[0-9a-fA-F]+$/.test(hwKey)) {
          // hwKey已经是hex格式，直接复用（确保新设备和老设备兼容）
          key = hwKey.slice(0, 32);
        } else if (hwKey.length < 16) {
          key = crypto.createHash('sha256').update(hwKey).digest('hex').slice(0, 32);
        } else {
          key = crypto.createHash('sha256').update(hwKey).digest('hex').slice(0, 32);
        }
      } else if (machineKey && machineKey.length > 0) {
        keyForExchange = machineKey;
        key = crypto.createHash('sha256').update(machineKey).digest('hex').slice(0, 32);
      } else {
        key = crypto.randomBytes(16).toString('hex');
        keyForExchange = key;
      }

      // ★★★ 确保数据库里的hw_key同步为hex格式，这样MQTT认证时password就能匹配
      if (sn && dbQuery && key) {
        try {
          // ★ 优先精确匹配更新；失败则用LIKE兜底（兼容短SN→完整SN过渡期）
          const result = dbQuery('UPDATE tray_display_devices SET hw_key = ? WHERE sn = ? AND (hw_key IS NULL OR hw_key = \'\')', [key, sn]);
          if (!result || result.changes === 0) {
            const shortSn = sn.includes('@') ? sn.split('@').pop() : sn;
            dbQuery('UPDATE tray_display_devices SET hw_key = ? WHERE sn LIKE ? AND (hw_key IS NULL OR hw_key = \'\')', [key, '%@' + shortSn]);
            console.log('[ExchangeKey] ★ 短SN兜底更新hw_key: ' + shortSn);
          }
        } catch (e) {}
      }

      // ★★★ exchangeKey用标准base64（不用URL-safe变体），避免设备端解析异常
      const exchBase = String(keyForExchange) + ':' + (sn || 'unknown') + ':leinu_v9';
      const exchangeKey = crypto.createHash('sha256').update(exchBase).digest().toString('base64');
      return res.json({ code: 10000, success: true, msg: 'success', message: 'success', data: { exchangeKey, key, serverTime: now, timestamp: now } });
    } catch (e) {
      const now = Date.now();
      return res.json({ code: 10000, success: true, msg: 'success', message: 'success', data: { exchangeKey: crypto.randomBytes(32).toString('base64'), key: crypto.randomBytes(16).toString('hex'), serverTime: now, timestamp: now } });
    }
  }

  // ═══ 密钥交换精确路由 ═══
  app.all('/yunshitang/exchange/key', (req, res) => handleYunshitangExchangeKey(req, res));
  app.all('/yunshitang/api/android/other/exchange/key', (req, res) => handleYunshitangExchangeKey(req, res));
  app.all('/yunshitang/api/android/device/common/base/exchange/key', (req, res) => handleYunshitangExchangeKey(req, res));
  app.all('/yunshitang/api/v4/device/common/base/exchange/key', (req, res) => handleYunshitangExchangeKey(req, res));
  app.all('/tengyun-api/api/v4/device/common/base/exchange/key', (req, res) => handleYunshitangExchangeKey(req, res));
  app.all('/api/v4/device/common/base/exchange/key', (req, res) => handleYunshitangExchangeKey(req, res));

  // ═══ 时间戳 ═══
  app.all('/api/v4/device/common/base/timestamp', (req, res) => { const n = Date.now(); res.json({ code: 10000, msg: 'success', data: { timestamp: n, serverTime: n } }); });
  app.all('/tengyun-api/api/v4/device/common/base/timestamp', (req, res) => { const n = Date.now(); res.json({ code: 10000, msg: '成功', data: { timestamp: n, serverTime: n } }); });
  app.all('/tengyun-api/api/v1/android/back/timestamp', (req, res) => { const n = Date.now(); res.json({ code: 10000, success: true, msg: 'success', data: { timestamp: n, serverTime: n } }); });
  app.all('/api/v1/android/back/timestamp', (req, res) => { const n = Date.now(); res.json({ code: 10000, msg: 'success', data: { timestamp: n, serverTime: n } }); });
  // ★ 乐牛传感器网关 SN=3000004186 使用此路径做心跳
  app.all('/yunshitang/api/v1/getTimestamp', (req, res) => { const n = Date.now(); res.json({ code: 10000, msg: 'success', data: { timestamp: n, serverTime: n } }); });

  // ═══ v4 基础配置路由 ═══
  app.all('/api/v4/device/common/base/base-config', (req, res) => {
    const { mqClientAddress } = resolveMqttAddress(req, state, preferredMqttPort, 'v4-base-config');
    const tenantId = req.headers['merchant-id'] || '1000000001';
    res.json({ code: 10000, msg: '成功', data: { tenantId: Number(tenantId) || 1000000001, mqClientAddress } });
  });

  app.all('/api/v4/device/common/base/register', handleDeviceRegister);
  app.all('/api/v4/device/common/base/login', handleDeviceRegister);
  app.all('/api/v4/device/common/base/internal-config', handleDeviceRegister);

  // ═══ 腾云前缀 base-config ═══
  app.all('/tengyun-api/api/v4/device/common/base/base-config', (req, res) => {
    const { mqClientAddress } = resolveMqttAddress(req, state, preferredMqttPort, '腾云base-config');
    res.json({ code: 10000, msg: '成功', data: { tenantId: Number(req.headers['merchant-id'] || '1000000001'), mqClientAddress } });
  });

  app.all('/tengyun-api/api/v4/device/common/base/interval-config', (req, res) => {
    const periods = getEffectiveMealPeriods();
    const bti = periods.map(p => ({ intervalId: p.mealType, intervalName: p.mealName, startTime: p.startTimeStr, endTime: p.endTimeStr, ifUse: 1 }));
    res.json({ code: 10000, msg: '成功', data: { level: 0, basicsTimeIntervals: bti } });
  });

  app.all('/tengyun-api/api/v4/device/common/base/config', (req, res) => {
    const sn = resolveDeviceSn(req, dbQuery);
    let deviceInfo = { canteenId: 0, shopstallId: 0, canteenName: '', shopstallName: '', recipeId: 0, deviceNum: sn || '', deviceName: sn || '', deviceMetadata: {}, recipeList: [], time: 0 };
    if (sn && dbQuery) { try { const rows = dbQuery('SELECT name, sn FROM tray_display_devices WHERE sn = ?', [sn]); if (rows && rows.length > 0) { deviceInfo.deviceName = rows[0].name || sn; deviceInfo.deviceNum = rows[0].sn || sn; } } catch (e) { } }
    res.json({ code: 10000, msg: '成功', data: { systemCardInfo: { cardCountry: 0, cardProvin: 0, cardCity: 0, cardCounty: 0, cardIntegr: 0, cardCustomer: 0, cardAlgorithm: 0, cardSector1: 0, cardSector2: 0, cardSector3: 0, cardSector4: 0, cardSector5: 0, cardType: 0, checkSector: 0, time: 0 }, deviceInfoVO: deviceInfo, extraParams: {} } });
  });

  // ═══ 菜品菜单路由 ═══
  async function handleMenuRequest(req, res) {
    const sn = resolveDeviceSn(req, dbQuery);
    let bindMode = 'all'; let bindValue = ''; let stationId = null;
    if (sn && dbQuery) {
      const rows = dbQuery('SELECT bind_mode, bind_value, station_id FROM tray_display_devices WHERE sn = ?', [sn]);
      if (rows && rows.length > 0) { bindMode = rows[0].bind_mode || 'all'; bindValue = rows[0].bind_value || ''; stationId = rows[0].station_id || null; }
    }
    if (bindMode === 'station' && stationId) { const resolved = resolveStationProductId(dbQuery, stationId); bindMode = resolved.bindMode; bindValue = resolved.bindValue; }
    // ★ 从请求体中提取 applyDate（设备 bind-info-config/page 接口会传当天日期）
    const reqBody = req.body || {};
    const reqContent = (typeof reqBody.content === 'string' ? (() => { try { return JSON.parse(reqBody.content); } catch { return {}; } })() : reqBody.content) || {};
    const applyDate = reqContent.applyDate || reqBody.applyDate || null;
    let products;
    if ((bindMode === 'single') && bindValue) { products = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, bindMode, bindValue); }
    else { products = await fetchTodayDishNutrition(supabaseUrl, supabaseAnonKey, dbQuery, applyDate); }
    // ★ 防止撑爆硬件：今日无菜品时不拉全量产品，返回空列表让设备不显示
    if (!products) products = [];
    if (sn) await updateDeviceLastPull(supabaseUrl, supabaseAnonKey, dbQuery, sn);
    return { products, sn, bindMode, bindValue };
  }

  // ═══ yunshitang API catch-all ═══
  // ══════════════════════════════════════════════════════════════════
  // ★★★ 全局 DRP 请求追踪中间件 — 记录所有打到 DRP 路径的请求 ★★★
  // 包括已注册和未注册的，帮助排查"设备调了什么路径"的问题
  // ══════════════════════════════════════════════════════════════════
  app.use((req, res, next) => {
    const pathName = req.path || '';
    if (pathName.includes('/drp/') || pathName.includes('/device/drp/')) {
      const traceId = 'drp-req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      console.log('');
      console.log('[DRP-REQUEST-TRACKER] ═══════════ ' + new Date().toISOString() + ' ═══════════');
      console.log('[DRP-REQUEST-TRACKER] [' + traceId + '] ★ 收到 DRP 请求');
      console.log('[DRP-REQUEST-TRACKER] [' + traceId + '] 路径: ' + req.originalUrl);
      console.log('[DRP-REQUEST-TRACKER] [' + traceId + '] 方法: ' + req.method);
      console.log('[DRP-REQUEST-TRACKER] [' + traceId + '] IP: ' + (req.ip || 'unknown'));
      console.log('[DRP-REQUEST-TRACKER] [' + traceId + '] machine-sn: ' + (req.headers['machine-sn'] || '(无)'));
      console.log('[DRP-REQUEST-TRACKER] [' + traceId + '] Content-Type: ' + (req.headers['content-type'] || '(无)'));
      const rawBody = JSON.stringify(req.body || {}).substring(0, 1000);
      console.log('[DRP-REQUEST-TRACKER] [' + traceId + '] RAW BODY: ' + rawBody);
      console.log('[DRP-REQUEST-TRACKER] [' + traceId + '] ═══════════');
      console.log('');

      // ★★★ 全局重量提取：不管设备调哪个DRP接口，只要body里带了重量就缓存
      try {
        const body = req.body || {};
        const content = (typeof body.content === 'string' ? (() => { try { return JSON.parse(body.content); } catch { return {}; } })() : body.content) || {};
        const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
        const machineSn = (req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();

        // 深度递归搜索重量字段
        function findWeight(obj, depth = 0) {
          if (!obj || typeof obj !== 'object' || depth > 4) return null;
          const weightKeys = ['weight', 'currentWeight', 'realWeight', 'netWeight', 'weighValue',
            'scaleWeight', 'actualWeight', 'weightValue', 'deliveryNum', 'num', 'quantity', 'qty',
            'weighNum', 'scaleNum', 'currentNum', 'actualNum', 'materialNum', 'goodsNum',
            'totalNum', 'pickupWeight', 'menuWeigh', 'weightBefore', 'weightAfter'];
          for (const key of weightKeys) {
            if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
              const n = Number(obj[key]);
              if (!isNaN(n) && n > 0) return { value: n, key, source: 'body' };
            }
          }
          // 递归查嵌套对象
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              const found = findWeight(v, depth + 1);
              if (found) return { ...found, source: 'nested.' + k };
            }
          }
          return null;
        }

        // 优先查content，再查body根级
        let found = findWeight(content);
        if (!found) found = findWeight(body);

        if (found) {
          if (clientIP) cacheDeviceWeight(clientIP, found.value, 'kg', 'drp-global-' + found.key);
          if (machineSn) cacheDeviceWeight(machineSn, found.value, 'kg', 'drp-global-' + found.key);
          console.log('[DRP-GlobalWeight] ★ 从' + found.source + '.' + found.key + '提取重量=' + found.value + 'kg (path=' + pathName + ', ip=' + clientIP + ', sn=' + machineSn + ')');
        }
      } catch (e) { /* ignore weight extraction errors */ }
    }
    next();
  });

  // ═══ 静态文件服务（已移除 — 在 index.js 中处理）═══

  // ═══ Request logging helper ═══
  function drpRequestLog(label, req) {
    const pathName = req.path || '';
    const sn = (req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();
    console.log('[DRP-REQUEST-LOG][' + label + '] path=' + req.originalUrl + ' method=' + req.method + ' sn=' + (sn || '(无)'));
  }

  app.all('/yunshitang/api/*', async (req, res) => {
    try {
      const pathName = req.path;
      // ★ upweightmenu 消费上报走独立 handler，不在这里处理
      if (pathName.includes('upweightmenu')) {
        return handleUpweightMenu(req, res);
      }
      if (pathName.includes('exchange') || pathName.includes('/key')) return handleYunshitangExchangeKey(req, res);
      if (pathName.includes('register') || pathName.includes('login') || pathName.includes('internal-config')) return handleDeviceRegister(req, res);
      if (pathName.includes('timestamp')) {
        const n = Date.now();
        return res.json({ code: 10000, msg: 'success', data: { timestamp: n, serverTime: n } });
      }
      if (pathName.includes('menu') || pathName.includes('dishes') || pathName.includes('bind-info') || pathName.includes('food') || pathName.includes('dish') || pathName.includes('recipe') || pathName.includes('buffet') || pathName.includes('getBySn') || pathName.includes('get-main-device')) {
        const { products } = await handleMenuRequest(req, res);
        if (pathName.includes('bind-info-config')) { const ml = buildMealListFromProducts(products); const dl = buildRecipeDateListFromDishNutrition(products); return res.json({ code: 10000, msg: '成功', data: { recipeId: 0, recipeType: 0, uptime: new Date().toISOString(), dateList: dl, mealList: ml } }); }
        if (pathName.includes('all/dishes-list/page')) {
          const b = req.body || {}; const content = b.content || {}; const c = Number(content.current || b.current || 1); const s = Number(content.size || b.size || 10);
          const total = products.length; const si = (c - 1) * s; const pi = products.slice(si, si + s);
          const enriched = enrichWithPickupData(dbQuery, pi);
          const data = enriched.map((item, idx) => ({ parentId: 0, dishesId: Number(item.id) || (100000 + si + idx), mealType: 1, productName: item.name || item.dishName || '', imageUrl: item.imageUrl || item.imgUrl || '', labelList: item.tags || [], tasteList: item.tasteList || [], surplusNum: 999, prefPrice: 0, salePrice: 0, originalPrice: 0, salesMode: 2, unitPrice: 0, weight: Number(item.weight) || 0, calories: Number(item.calories) || 0, protein: Number(item.protein) || 0, fat: Number(item.fat) || 0, carbohydrate: Number(item.carbohydrate) || 0, dietaryFiber: Number(item.fiber) || 0, typeName: (item.tags && item.tags[0]) || item.category || '', nutritionDesc: item.nutritionDesc || '', contraindications: item.contraindications || '' }));
          return res.json({ code: 10000, msg: '成功', data: { total, current: c, size: s, pages: Math.ceil(total / s) || 1, records: data } });
        }
        if (pathName.includes('getsetting')) { 
        const cm = getCurrentMealType();
        const sn2 = resolveDeviceSn(req, dbQuery);
        console.log('[getsetting-yunshitang-catchall] ====== 自助餐获取配置 ======');
        console.log('[getsetting-yunshitang-catchall] sn=' + sn2 + ', path=' + pathName);
        const ystDbDevice = await resolveDeviceConfig(sn2);
        const ystDeviceConfig = buildGetSettingDeviceConfig(ystDbDevice);
        console.log('[getsetting-yunshitang-catchall] deviceConfig 字段数=' + Object.keys(ystDeviceConfig).length + ', deviceUITemplate=' + ystDeviceConfig.deviceUITemplate);
        return res.json({ code: 10000, msg: '成功', data: { currentMeal: cm, currentMealName: getMealNameByType(cm), pricingMode: 1, unitPrice: 0, ...ystDeviceConfig } }); }
        return res.json({ code: 10000, success: true, msg: 'success', data: { dishes: products } });
      }
      if (pathName.includes('base-config')) { const { mqClientAddress } = resolveMqttAddress(req, state, preferredMqttPort, 'yunshitang-base'); return res.json({ code: 10000, msg: '成功', data: { tenantId: Number(req.headers['merchant-id'] || '1000000001'), mqClientAddress } }); }
      return res.json({ code: 10000, msg: 'success', data: null });
    } catch (err) { if (!res.headersSent) return res.json({ code: 10000, msg: 'success', data: null }); }
  });

  // ═══ v4 菜单路由 ═══
  app.all('/api/v4/device/common/menu/all/dishes-list', async (req, res) => {
    const products = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, 'all', '');
    const sliced = products.slice(0, 30);
    const enriched = enrichWithPickupData(dbQuery, sliced);
    const data = enriched.map((item, idx) => ({ parentId: 0, dishesId: Number(item.id) || (100000 + idx), mealType: 1, productName: item.name || item.dishName || '', imageUrl: item.imageUrl || item.imgUrl || '', labelList: item.tags || [], tasteList: item.tasteList || [], surplusNum: 999, prefPrice: Math.round((Number(item.price) || 0) * 100), salePrice: Math.round((Number(item.price) || 0) * 100), originalPrice: Math.round((Number(item.price) || 0) * 100), salesMode: 2, unitPrice: 0, weight: Number(item.weight) || 0, calories: Number(item.calories) || 0, protein: Number(item.protein) || 0, fat: Number(item.fat) || 0, carbohydrate: Number(item.carbohydrate) || 0, dietaryFiber: Number(item.fiber) || 0, typeName: (item.tags && item.tags[0]) || item.category || '', typeId: 0 }));
    res.json({ code: 10000, msg: '成功', data });
  });

  app.all('/api/v4/device/common/menu/all/dishes-list/page', async (req, res) => {
    const b = req.body || {}; const content = b.content || {}; const c = Number(content.current || b.current || 1); const s = Number(content.size || b.size || 10);
    let products = await fetchTodayDishNutrition(supabaseUrl, supabaseAnonKey, dbQuery);
    // ★ 防止撑爆硬件：今日无菜品时不拉全量产品
    if (!products) products = [];
    const total = products.length; const si = (c - 1) * s; const pi = products.slice(si, si + s);
    const enriched = enrichWithPickupData(dbQuery, pi);
    const data = enriched.map((item, idx) => ({ parentId: 0, dishesId: Number(item.id) || (100000 + si + idx), mealType: Number(item.mealType) || 1, productName: item.name || item.dishName || '', imageUrl: item.imageUrl || item.imgUrl || '', labelList: item.tags || [], tasteList: item.tasteList || [], surplusNum: 999, prefPrice: 0, salePrice: 0, originalPrice: 0, salesMode: 2, unitPrice: 0, weight: Number(item.weight) || 0, calories: Number(item.calories) || 0, protein: Number(item.protein) || 0, fat: Number(item.fat) || 0, carbohydrate: Number(item.carbohydrate) || 0, dietaryFiber: Number(item.fiber) || 0, typeName: (item.tags && item.tags[0]) || item.category || '', nutritionDesc: item.nutritionDesc || '', contraindications: item.contraindications || '' }));
    res.json({ code: 10000, msg: '成功', data: { total, current: c, size: s, pages: Math.ceil(total / s) || 1, records: data } });
  });

  app.all('/api/v4/device/common/menu/bind-info-config', async (req, res) => {
    const { products } = await handleMenuRequest(req, res);
    const ml = buildMealListFromProducts(products); const dl = buildRecipeDateListFromDishNutrition(products);
    res.json({ recipeId: 0, recipeType: 0, uptime: new Date().toISOString(), dateList: dl, mealList: ml });
  });

  app.all('/api/v4/device/common/menu/bind-recipeid-info-config', async (req, res) => {
    const { products } = await handleMenuRequest(req, res);
    const ml = buildMealListFromProducts(products); const dl = buildRecipeDateList(products);
    res.json({ code: 10000, msg: '成功', data: { recipeId: 0, recipeType: 0, uptime: new Date().toISOString(), dateList: dl, mealList: ml } });
  });

  app.all('/api/v4/device/common/menu/all/menu-type-list', (req, res) => {
    let data = [];
    if (dbQuery) { try { data = dbQuery('SELECT id as typeId, name as typeName FROM product_categories', []); } catch (e) { } }
    res.json({ code: 10000, msg: '成功', data: data || [] });
  });

  // ═══ 腾云菜单路由 ═══
  app.all('/tengyun-api/api/v4/device/common/menu/bind-info-config', async (req, res) => {
    const freezeTraceId5 = 'freeze_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId5 + '] ══════════════════════════════════════');
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId5 + '] ★★★ bind-info-config 被调用 (菜品列表)');
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId5 + '] 路径=' + req.path + ', 方法=' + req.method);
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId5 + '] machine-sn=' + JSON.stringify(req.headers['machine-sn']));
    const { products } = await handleMenuRequest(req, res);
    const ml = buildMealListFromProducts(products); const dl = buildRecipeDateListFromDishNutrition(products);
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId5 + '] 菜品总数=' + (products ? products.length : 0) + ', mealList=' + ml.length + '餐段, dateList=' + dl.length + '天');
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId5 + '] ═══ bind-info-config 响应结束 ═══');
    res.json({ code: 10000, msg: '成功', data: { recipeId: 0, recipeType: 0, uptime: new Date().toISOString(), dateList: dl, mealList: ml } });
  });

  // ★ bind-info-config/page 分页变体（乐牛设备 SN=3000004186 调用此路径）
  // ★★★ 提取为命名函数，兼容设备端路径拼写错误（缺少v、空格等）
  async function handleBindInfoConfigPage(req, res) {
    const traceId = 'devint_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const sn = (req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();
    console.log('[DEVICE-INTEG] [traceId=' + traceId + '] ═══ bind-info-config/page 被调用 ═══');
    console.log('[DEVICE-INTEG] [traceId=' + traceId + '] sn=' + (sn || '(none)') + ' | path=' + req.path + ' | method=' + req.method);
    console.log('[DEVICE-INTEG] [traceId=' + traceId + '] RAW BODY: ' + JSON.stringify(req.body || {}).substring(0, 800));
    const { products } = await handleMenuRequest(req, res);
    const ml = buildMealListFromProducts(products); const dl = buildRecipeDateListFromDishNutrition(products);

    // ★★★ 动态注入实时会话重量：如果当前秤上有菜，把实际重量写入菜单列表
    if (sn) {
      const session = getDeviceSessionWeight(sn);
      if (session && session.mealWeight > 0) {
        let activeDishId = null;
        if (dbQuery) {
          try {
            const cacheRows = dbQuery('SELECT dish_id FROM device_dish_cache WHERE device_sn = ? ORDER BY updated_at DESC LIMIT 1', [sn]);
            if (cacheRows && cacheRows.length > 0) activeDishId = Number(cacheRows[0].dish_id);
          } catch (e) { /* ignore */ }
        }
        console.log('[DEVICE-INTEG] [traceId=' + traceId + '] ★ 会话重量: initialWeight=' + session.initialWeight + ', currentWeight=' + session.currentWeight + ', mealWeight=' + session.mealWeight + ', activeDishId=' + activeDishId);
        if (activeDishId) {
          for (const dish of ml) {
            if (Number(dish.dishesId) === activeDishId) {
              dish.weight = session.mealWeight;
              const calPer100g = Number(dish.calories) || 0;
              if (calPer100g > 0) dish.calories = Math.round(calPer100g * session.mealWeight / 100 * 10) / 10;
              break;
            }
          }
          for (const dateEntry of dl) {
            for (const interval of (dateEntry.intervalList || [])) {
              for (const prod of (interval.productList || [])) {
                if (Number(prod.dishesId) === activeDishId) {
                  prod.weight = session.mealWeight;
                  break;
                }
              }
            }
          }
        }
      }
    }

    console.log('[DEVICE-INTEG] [traceId=' + traceId + '] bind-info-config/page OK | 菜品=' + (products ? products.length : 0) + '条 | mealList=' + ml.length + '餐段 | dateList=' + dl.length + '天');
    if (!products || products.length === 0) {
      console.warn('[DEVICE-INTEG] [traceId=' + traceId + '] ★★★ 警告: 菜品列表为空! dish_nutrition 和 product_items 可能都没有数据');
    }
    res.json({ code: 10000, msg: '成功', data: { recipeId: 0, recipeType: 0, uptime: new Date().toISOString(), dateList: dl, mealList: ml } });
  }

  // ✅ 正确路径
  app.all('/tengyun-api/api/v4/device/common/menu/bind-info-config/page', handleBindInfoConfigPage);
  // ★★★ 兼容设备端路径拼写错误（不强制升级硬件固件）
  // 错误1: 缺少 "v" — api/4 而非 api/v4
  app.all('/tengyun-api/api/4/device/common/menu/bind-info-config/page', handleBindInfoConfigPage);
  // 错误2: bind 和 info 之间有空格 — "bind -info-config"
  app.all('/tengyun-api/api/v4/device/common/menu/bind -info-config/page', handleBindInfoConfigPage);
  // 错误3: 两者同时出现
  app.all('/tengyun-api/api/4/device/common/menu/bind -info-config/page', handleBindInfoConfigPage);

  app.all('/tengyun-api/api/v4/device/common/menu/bind-recipeid-info-config', async (req, res) => {
    const { products } = await handleMenuRequest(req, res);
    res.json({ code: 10000, msg: '成功', data: { recipeId: 0, recipeType: 0, uptime: new Date().toISOString(), dateList: buildRecipeDateList(products), mealList: buildMealListFromProducts(products) } });
  });

  app.all('/tengyun-api/api/v4/device/common/menu/all/dishes-list', async (req, res) => {
    const products = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, 'all', '');
    const sliced = products.slice(0, 30);
    const enriched = enrichWithPickupData(dbQuery, sliced);
    const data = enriched.map((item, idx) => ({ parentId: 0, dishesId: Number(item.id) || (100000 + idx), mealType: 1, productName: item.name || item.dishName || '', imageUrl: item.imageUrl || item.imgUrl || '', labelList: item.tags || [], tasteList: item.tasteList || [], surplusNum: 999, prefPrice: Math.round((Number(item.price) || 0) * 100), salePrice: Math.round((Number(item.price) || 0) * 100), originalPrice: Math.round((Number(item.price) || 0) * 100), salesMode: 2, unitPrice: 0, weight: Number(item.weight) || 0, calories: Number(item.calories) || 0, protein: Number(item.protein) || 0, fat: Number(item.fat) || 0, carbohydrate: Number(item.carbohydrate) || 0, dietaryFiber: Number(item.fiber) || 0, typeName: (item.tags && item.tags[0]) || item.category || '' }));
    res.json({ code: 10000, msg: '成功', data });
  });

  app.all('/tengyun-api/api/v4/device/common/menu/all/dishes-list/page', async (req, res) => {
    const b = req.body || {}; const content = b.content || {}; const c = Number(content.current || b.current || 1); const s = Number(content.size || b.size || 10);
    let products = await fetchTodayDishNutrition(supabaseUrl, supabaseAnonKey, dbQuery);
    // ★ 防止撑爆硬件：今日无菜品时不拉全量产品
    if (!products) products = [];
    const total = products.length; const si = (c - 1) * s; const pi = products.slice(si, si + s);
    const enriched = enrichWithPickupData(dbQuery, pi);
    const data = enriched.map((item, idx) => ({ parentId: 0, dishesId: Number(item.id) || (100000 + si + idx), mealType: Number(item.mealType) || 1, productName: item.name || item.dishName || '', imageUrl: item.imageUrl || item.imgUrl || '', labelList: item.tags || [], tasteList: item.tasteList || [], surplusNum: 999, prefPrice: 0, salePrice: 0, originalPrice: 0, salesMode: 2, unitPrice: 0, weight: Number(item.weight) || 0, calories: Number(item.calories) || 0, protein: Number(item.protein) || 0, fat: Number(item.fat) || 0, carbohydrate: Number(item.carbohydrate) || 0, dietaryFiber: Number(item.fiber) || 0, typeName: (item.tags && item.tags[0]) || item.category || '', nutritionDesc: item.nutritionDesc || '', contraindications: item.contraindications || '' }));
    res.json({ code: 10000, msg: '成功', data: { total, current: c, size: s, pages: Math.ceil(total / s) || 1, records: data } });
  });

  app.all('/tengyun-api/api/v4/device/common/menu/all/menu-type-list', (req, res) => {
    let data = [];
    if (dbQuery) { try { data = dbQuery('SELECT id as typeId, name as typeName FROM product_categories', []); } catch (e) { } }
    res.json({ code: 10000, msg: '成功', data: data || [] });
  });

  // ★ al/menu-type-list 变体（乐牛设备 SN=3000004186 调用此路径，可能是 all 的拼写变体）
  app.all('/tengyun-api/api/v4/device/common/menu/al/menu-type-list', (req, res) => {
    let data = [];
    if (dbQuery) { try { data = dbQuery('SELECT id as typeId, name as typeName FROM product_categories', []); } catch (e) { } }
    res.json({ code: 10000, msg: '成功', data: data || [] });
  });

  app.all('/tengyun-api/api/v4/device/common/menu/recipe/get', (req, res) => {
    const d = new Date(Date.now() + 8 * 3600 * 1000); const ts = d.toISOString().slice(0, 10);
    res.json({ code: 10000, msg: '成功', data: [{ recipeId: 1, canteenId: 0, stallId: 0, canteenName: '', recipeName: '今日菜单', stallName: '', stallIfOpen: 1, stallStaTime: '05:00:00', stallEndTime: '22:00:00', applyDate: ts }] });
  });

  // ══════════════════════════════════════════════════════════════════
  // ★★★ 紧急：category-tree / category/top-list 必须在所有DRP路由和catch-all之前注册 ★★★
  // 设备「新增货品」弹框打开时立即调用这些接口获取货品分类列表
  // 如果被 DRP catch-all 先匹配，会返回 {records:[]} 对象格式，设备报"服务器错误"
  // ══════════════════════════════════════════════════════════════════

  // ★★★ 入库秤DRP重量上报接口（设备主动上报当前秤重）
  // 入库电子秤在称重/预览/重新识别时可能不走MQTT，应该通过该接口主动上报当前秤重
  function handleDrpWeightReport(req, res) {
    const content = drpContent(req);
    const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const machineSn = (req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();
    // 支持常见字段名
    const raw = content.weight || content.currentWeight || content.realWeight || content.netWeight ||
      req.body?.weight || req.body?.currentWeight || req.query?.weight || 0;
    const w = Number(raw);
    const unit = content.weightUnit || req.body?.weightUnit || 'kg';
    const traceId = scaleInboundTrace();
    console.log('[DRP-WeightReport] [' + traceId + '] 入库秤重量上报: sn=' + machineSn + ', ip=' + clientIP + ', weight=' + w + unit);
    if (w >= 0) {
      if (clientIP) cacheDeviceWeight(clientIP, w, unit || 'kg', 'drp-weight-report');
      if (machineSn) cacheDeviceWeight(machineSn, w, unit || 'kg', 'drp-weight-report');
    }
    return res.json({ code: 10000, msg: '成功', data: { weight: w, weightUnit: unit || 'kg', cached: true } });
  }
  app.all('/api/v4/device/drp/weight/report', handleDrpWeightReport);
  app.all('/tengyun-api/api/v4/device/drp/weight/report', handleDrpWeightReport);
  app.all('/api/v4/device/drp/scale/weight', handleDrpWeightReport);
  app.all('/tengyun-api/api/v4/device/drp/scale/weight', handleDrpWeightReport);

  // ─── category/top-list（新增货品弹框打开时触发，优先级最高）───
  // ★★★ 必须在 mountDrpRoute 和 DRP catch-all 之前注册，否则被 catch-all 拦截
  function handleCategoryTopList(req, res) {
    const traceId = scaleInboundTrace ? scaleInboundTrace() : 'catlist_' + Date.now();
    console.log('[CategoryTopList-PRIORITY] ★ 被调用: ' + req.originalUrl + ', machine-sn=' + (req.headers['machine-sn'] || '(无)'));
    try {
      const categories = getMaterialCategoryList();
      console.log('[CategoryTopList-PRIORITY] ★ 返回 ' + categories.length + ' 个分类: ' + categories.map(c => c.categoryName).join(', '));
      // ★★★ 设备期望 data 直接是数组，不是 {list, total} 或 {records:[]} 格式
      res.json({ code: 10000, msg: '成功', data: categories });
    } catch (err) {
      console.error('[CategoryTopList-PRIORITY] 异常: ' + err.message);
      // 兜底：返回默认分类数组
      res.json({ code: 10000, msg: '成功', data: [
        { categoryId: 1, categoryName: '蔬菜', level: 1, parentId: 0, children: [], sortOrder: 1 },
        { categoryId: 2, categoryName: '水果', level: 1, parentId: 0, children: [], sortOrder: 2 },
        { categoryId: 3, categoryName: '肉类', level: 1, parentId: 0, children: [], sortOrder: 3 },
        { categoryId: 4, categoryName: '水产', level: 1, parentId: 0, children: [], sortOrder: 4 },
        { categoryId: 5, categoryName: '粮油', level: 1, parentId: 0, children: [], sortOrder: 5 },
        { categoryId: 6, categoryName: '调味品', level: 1, parentId: 0, children: [], sortOrder: 6 },
        { categoryId: 7, categoryName: '干货', level: 1, parentId: 0, children: [], sortOrder: 7 },
        { categoryId: 8, categoryName: '冻品', level: 1, parentId: 0, children: [], sortOrder: 8 },
      ]});
    }
  }
  // 注册所有变体路径（必须在 mountDrpRoute 之前）
  app.all('/api/v4/device/drp/category/top-list', handleCategoryTopList);
  app.all('/tengyun-api/api/v4/device/drp/category/top-list', handleCategoryTopList);
  app.all('/api/v4/device/drp/category/topList', handleCategoryTopList);
  app.all('/tengyun-api/api/v4/device/drp/category/topList', handleCategoryTopList);
  app.all('/api/v4/device/drp/category/getTopList', handleCategoryTopList);
  app.all('/tengyun-api/api/v4/device/drp/category/getTopList', handleCategoryTopList);
  console.log('[DRP] ★ category/top-list 已优先注册（在 DRP catch-all 之前）');

  // ══════════════════════════════════════════════════════════════════
  // ★★★ 紧急：category-tree 必须在所有DRP路由和catch-all之前注册 ★★★
  // 设备 AN_HUO_PIN_RU_KU 活动启动时调用此接口获取货品分类列表
  // ══════════════════════════════════════════════════════════════════
  app.all('/api/v4/device/drp/category-tree', (req, res) => {
    const ts = Date.now();
    const rawBody = JSON.stringify(req.body || {}).substring(0, 3000);
    const sn = (req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();
    console.log('');
    console.log('[CategoryTree-EXPLICIT] ════════════════ ' + new Date().toISOString() + ' ════════════════');
    console.log('[CategoryTree-EXPLICIT] ★★★ category-tree 被调用 (最优先级路由)');
    console.log('[CategoryTree-EXPLICIT] 路径=' + req.originalUrl + ', 方法=' + req.method + ', IP=' + (req.ip || 'unknown'));
    console.log('[CategoryTree-EXPLICIT] machine-sn=' + (sn || '(无)'));
    console.log('[CategoryTree-EXPLICIT] Content-Type=' + (req.headers['content-type'] || '(无)'));
    console.log('[CategoryTree-EXPLICIT] RAW BODY(' + rawBody.length + '): ' + rawBody.substring(0, 2000));
    try {
      const content = (() => {
        const b = req.body || {};
        const c = b.content || {};
        if (typeof c === 'string') { try { return JSON.parse(c) || {}; } catch { return {}; } }
        return c;
      })();
      console.log('[CategoryTree-EXPLICIT] content字段: ' + JSON.stringify(Object.keys(content)));
      const categoryType = Number(content.categoryType || 1);
      const categoryTypes = content.categoryTypes || [categoryType];
      const tenantId = Number(content.tenantId || 0);
      console.log('[CategoryTree-EXPLICIT] categoryType=' + categoryType + ', categoryTypes=' + JSON.stringify(categoryTypes) + ', tenantId=' + tenantId);

      // 从 inbound_materials 读取分类
      let categories = [];
      if (dbQuery) {
        try {
          const rows = dbQuery(
            "SELECT DISTINCT category_name FROM inbound_materials WHERE is_active = 1 AND category_name IS NOT NULL AND category_name != '' ORDER BY category_name",
            []
          );
          if (rows && rows.length > 0) {
            categories = rows.map((r, i) => ({ categoryId: i + 1, categoryName: r.category_name }));
            console.log('[CategoryTree-EXPLICIT] ★ 从inbound_materials读取到 ' + categories.length + ' 个分类: ' + categories.map(c => c.categoryName).join(', '));
          } else {
            console.log('[CategoryTree-EXPLICIT] inbound_materials 无分类数据');
          }
        } catch (e) {
          console.warn('[CategoryTree-EXPLICIT] 读取分类失败: ' + e.message);
        }
      } else {
        console.log('[CategoryTree-EXPLICIT] dbQuery不可用');
      }

      // 兜底
      if (categories.length === 0) {
        categories = [
          { categoryId: 1, categoryName: '蔬菜' },
          { categoryId: 2, categoryName: '水果' },
          { categoryId: 3, categoryName: '肉类' },
          { categoryId: 4, categoryName: '水产' },
          { categoryId: 5, categoryName: '粮油' },
          { categoryId: 6, categoryName: '调味品' },
          { categoryId: 7, categoryName: '干货' },
          { categoryId: 8, categoryName: '冻品' },
        ];
        console.log('[CategoryTree-EXPLICIT] 使用兜底分类 (' + categories.length + ' 个)');
      }

      // 构建API文档格式的树形结构（直接数组，不包裹code/msg/data）
      const tree = categories.map(c => ({
        id: c.categoryId,
        parentId: 0,
        children: [],
        areaId: 0,
        areaName: '',
        categoryName: c.categoryName,
        categoryAreaName: c.categoryName,
        categoryType: 1,
        categoryNum: 'CT' + String(c.categoryId).padStart(4, '0'),
        disableStatus: 1,
        bigCategoryId: 0,
      }));

      console.log('[CategoryTree-EXPLICIT] ★★★ 返回直接数组, 共 ' + tree.length + ' 个根节点 ★★★');
      console.log('[CategoryTree-EXPLICIT] 分类名: ' + tree.map(t => t.categoryName).join(', '));
      console.log('[CategoryTree-EXPLICIT] 响应前3条: ' + JSON.stringify(tree.slice(0, 3)).substring(0, 1000));
      console.log('[CategoryTree-EXPLICIT] ════════════════ 响应结束 ════════════════');
      console.log('');
      res.json(tree);
    } catch (err) {
      console.error('[CategoryTree-EXPLICIT] ★★★ 异常: ' + err.message);
      console.error('[CategoryTree-EXPLICIT] 堆栈: ' + (err.stack || '无'));
      res.json([]);
    }
  });

  app.all('/tengyun-api/api/v4/device/drp/category-tree', (req, res) => {
    const ts = Date.now();
    const rawBody = JSON.stringify(req.body || {}).substring(0, 3000);
    const sn = (req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();
    console.log('');
    console.log('[CategoryTree-EXPLICIT-TENGYUN] ════════════════ ' + new Date().toISOString() + ' ════════════════');
    console.log('[CategoryTree-EXPLICIT-TENGYUN] ★★★ category-tree 腾云路径被调用');
    console.log('[CategoryTree-EXPLICIT-TENGYUN] 路径=' + req.originalUrl + ', 方法=' + req.method + ', IP=' + (req.ip || 'unknown'));
    console.log('[CategoryTree-EXPLICIT-TENGYUN] machine-sn=' + (sn || '(无)'));
    console.log('[CategoryTree-EXPLICIT-TENGYUN] RAW BODY(' + rawBody.length + '): ' + rawBody.substring(0, 2000));
    try {
      const content = (() => {
        const b = req.body || {};
        const c = b.content || {};
        if (typeof c === 'string') { try { return JSON.parse(c) || {}; } catch { return {}; } }
        return c;
      })();
      let categories = [];
      if (dbQuery) {
        try {
          const rows = dbQuery(
            "SELECT DISTINCT category_name FROM inbound_materials WHERE is_active = 1 AND category_name IS NOT NULL AND category_name != '' ORDER BY category_name",
            []
          );
          if (rows && rows.length > 0) {
            categories = rows.map((r, i) => ({ categoryId: i + 1, categoryName: r.category_name }));
            console.log('[CategoryTree-EXPLICIT-TENGYUN] 从inbound_materials读取到 ' + categories.length + ' 个分类');
          }
        } catch (e) { console.warn('[CategoryTree-EXPLICIT-TENGYUN] 读取失败: ' + e.message); }
      }
      if (categories.length === 0) {
        categories = [
          { categoryId: 1, categoryName: '蔬菜' }, { categoryId: 2, categoryName: '水果' },
          { categoryId: 3, categoryName: '肉类' }, { categoryId: 4, categoryName: '水产' },
          { categoryId: 5, categoryName: '粮油' }, { categoryId: 6, categoryName: '调味品' },
          { categoryId: 7, categoryName: '干货' }, { categoryId: 8, categoryName: '冻品' },
        ];
      }
      const tree = categories.map(c => ({
        id: c.categoryId, parentId: 0, children: [], areaId: 0, areaName: '',
        categoryName: c.categoryName, categoryAreaName: c.categoryName,
        categoryType: 1, categoryNum: 'CT' + String(c.categoryId).padStart(4, '0'),
        disableStatus: 1, bigCategoryId: 0,
      }));
      console.log('[CategoryTree-EXPLICIT-TENGYUN] ★★★ 返回直接数组, 共 ' + tree.length + ' 个根节点 ★★★');
      console.log('[CategoryTree-EXPLICIT-TENGYUN] ════════════════ 响应结束 ════════════════');
      console.log('');
      res.json(tree);
    } catch (err) {
      console.error('[CategoryTree-EXPLICIT-TENGYUN] ★★★ 异常: ' + err.message);
      res.json([]);
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // DRP 设备 API — 入库电子秤核心接口
  // 电子秤登录后调用这些接口获取货品数据、类别等
  // 【重要】DRP 路由必须在 catch-all 之前注册，否则会被 /tengyun-api/* 拦截
  // ══════════════════════════════════════════════════════════════════

  function drpContent(req) {
    const b = req.body || {};
    const c = b.content || {};
    if (typeof c === 'string') { try { return JSON.parse(c) || {}; } catch { return {}; } }
    return c;
  }

  function drpOk(data) { return { code: 10000, msg: '成功', data }; }
  function drpErr(msg) { return { code: 1, msg, data: null }; }

  // ★ 入库电子秤统一日志工具 — 结构化输出"进入→处理→返回"全链路
  function scaleInboundLog(routeName, traceId, stage, detail) {
    const ts = new Date().toISOString();
    const prefix = `[ScaleInbound][${routeName}][${traceId}]`;
    if (typeof detail === 'string') {
      console.log(`${prefix} [${stage}] ${detail}`);
    } else {
      console.log(`${prefix} [${stage}] ${JSON.stringify(detail).substring(0, 2000)}`);
    }
  }
  function scaleInboundTrace() {
    return 'si_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  // ★★★ 入库秤重量提取：从请求body/content中提取重量并缓存
  // 入库电子秤有时直接在业务请求里带上当前重量，服务端必须读出来回传
  function extractAndCacheWeightFromRequest(req) {
    const body = req.body || {};
    const content = drpContent(req);
    const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const machineSn = (req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();
    // 常见字段名：weight / currentWeight / realWeight / netWeight / weighValue / scaleWeight / actualWeight
    // ★★★ 也查 content 内部嵌套对象 (content.weightParam, content.scaleData.weight 等)
    const raw = content.weight || content.currentWeight || content.realWeight || content.netWeight || content.weighValue ||
      content.scaleWeight || content.actualWeight || content.weightValue ||
      (content.weightParam && content.weightParam.weight) ||
      (content.scaleData && content.scaleData.weight) ||
      (content.scaleData && content.scaleData.currentWeight) ||
      body.weight || body.currentWeight || body.realWeight || body.netWeight || body.weighValue ||
      body.scaleWeight || body.actualWeight || body.weightValue ||
      (body.weightParam && body.weightParam.weight) ||
      (body.scaleData && body.scaleData.weight) || 0;
    const w = Number(raw);
    if (w > 0) {
      if (clientIP) cacheDeviceWeight(clientIP, w, 'kg', 'drp-request-weight');
      if (machineSn) cacheDeviceWeight(machineSn, w, 'kg', 'drp-request-weight');
      console.log('[WeightExtract] ★ 从请求提取重量: ' + w + 'kg (clientIP=' + clientIP + ', sn=' + machineSn + ')');
    }
    return w;
  }

  // ★★★ 获取最终回传重量（先用请求中的值，再用缓存，绝对不返回0如果有任何已知值）
  // 返回 null 表示"没有可用重量"——调用方应据此决定不覆盖设备本地重量
  function resolveFinalWeight(reqWeight, clientIP) {
    if (reqWeight > 0) return { weight: reqWeight, unit: 'kg' };
    const cached = getLatestDeviceWeight(clientIP);
    if (cached && cached.weight > 0) return { weight: cached.weight, unit: cached.unit || 'kg' };
    const anyCached = getLatestWeightForAnyDevice();
    if (anyCached && anyCached.weight > 0) return { weight: anyCached.weight, unit: anyCached.unit || 'kg' };
    // ★ 没有可用重量：返回 null，调用方应省略 weight 字段，让设备保留本地秤重读数
    return null;
  }

  // ★ 统一构造货品照片记录：包含所有常见字段名变体，避免电子秤 Gson 模型
  //   因为找不到某个必填字段（如 id / picUrl）而解析失败 → 报"上传照片失败"
  function toPicRecord(pic, matId, idx) {
    const u = (pic && (pic.url || pic.imageUrl || pic.picUrl)) || '';
    const t = (pic && pic.createdAt) || new Date().toISOString();
    return {
      id: idx + 1,
      picId: idx + 1,
      materialId: matId || 0,
      materialPicId: idx + 1,
      url: u,
      picUrl: u,
      imageUrl: u,
      imgUrl: u,
      picPath: u,
      path: u,
      fileUrl: u,
      filePath: u,
      sort: idx,
      sortOrder: idx,
      status: 'COLLECTED',
      createTime: t,
      createdAt: t,
      gmtCreate: t,
    };
  }

  // ★ 统一构造货品照片查询响应：data 同时携带 list 与 records，覆盖两种消费方式
  function buildPicListResponse(rawList, matId) {
    const records = (rawList || []).map((pic, i) => toPicRecord(pic, matId, i));
    return {
      code: 10000,
      msg: '成功',
      data: {
        list: records,
        records,
        total: records.length,
        current: 1,
        size: records.length || 10,
        pages: 1,
      },
    };
  }

  // ─── 获取 SQLite 产品列表（DRP 格式）─ 旧版，查 product_items ───
  function getProductList(db, keyword) {
    if (!db) return [];
    let rows;
    try {
      if (keyword) {
        rows = db('SELECT id, name, category_id, price, stock, media, description FROM product_items WHERE name LIKE ? OR description LIKE ? ORDER BY id', [`%${keyword}%`, `%${keyword}%`]);
      } else {
        rows = db('SELECT id, name, category_id, price, stock, media, description FROM product_items ORDER BY id', []);
      }
    } catch (e) { return []; }
    if (!rows) return [];
    return rows.map(r => {
      let img = '';
      try { const m = JSON.parse(r.media || '[]'); img = m[0]?.url || ''; } catch { }
      return {
        materialId: r.id, materialName: r.name, materialCode: String(r.id),
        categoryId: r.category_id || 0, categoryName: '',
        unitId: 1, unitName: 'kg', unitPrice: Math.round((r.price || 0) * 100),
        salesMode: 2, materialType: 1, status: 1,
        stock: r.stock || 0, imageUrl: img, barCode: '',
      };
    });
  }

  // ─── 获取入库产品列表（本地 SQLite）───
  async function getInboundMaterialList(keyword) {
    const traceId = 'iml_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[ScaleInbound-MaterialList] ━━━ 查询入库产品 ━━━');
    console.log('[ScaleInbound-MaterialList] [traceId=' + traceId + '] keyword=' + JSON.stringify(keyword) + ', dbQuery可用=' + !!dbQuery);
    // 纯局域网环境，直接走 SQLite，不做任何网络尝试
    if (dbQuery) {
      try {
        // ★ 先诊断 inbound_materials 表是否存在、有多少数据
        const tableCheck = (() => {
          try {
            const cnt = dbQuery('SELECT COUNT(*) as cnt FROM inbound_materials', []);
            console.log('[ScaleInbound-MaterialList] [traceId=' + traceId + '] ★ 表数据量: ' + (cnt && cnt.length > 0 ? cnt[0].cnt : '?') + ' 条');
            // 打印前3条看看数据结构
            const sample = dbQuery('SELECT * FROM inbound_materials LIMIT 3', []);
            if (sample && sample.length > 0) {
              console.log('[ScaleInbound-MaterialList] [traceId=' + traceId + '] 样例列: ' + Object.keys(sample[0]).join(', '));
              sample.forEach((s, i) => console.log('[ScaleInbound-MaterialList] [traceId=' + traceId + ']   [' + i + '] id=' + s.id + ', name=' + s.name + ', is_active=' + s.is_active + ', unit_price=' + s.unit_price));
            } else {
              console.warn('[ScaleInbound-MaterialList] [traceId=' + traceId + '] ★★★ inbound_materials 表为空! 没有入库产品数据!');
            }
            return cnt && cnt.length > 0 ? cnt[0].cnt : 0;
          } catch (e) {
            console.warn('[ScaleInbound-MaterialList] [traceId=' + traceId + '] ★★★ 表检查异常: ' + e.message);
            return -1;
          }
        })();

        const sql = keyword
          ? 'SELECT * FROM inbound_materials WHERE is_active = 1 AND (name LIKE ? OR bar_code LIKE ?) ORDER BY id'
          : 'SELECT * FROM inbound_materials WHERE is_active = 1 ORDER BY id';
        const params = keyword ? [`%${keyword}%`, `%${keyword}%`] : [];
        console.log('[ScaleInbound-MaterialList] [traceId=' + traceId + '] SQL: ' + sql + ' | params: ' + JSON.stringify(params));

        const rows = dbQuery(sql, params);
        console.log('[ScaleInbound-MaterialList] [traceId=' + traceId + '] SQLite 返回 ' + (rows ? rows.length : 0) + ' 条 (总表 ' + tableCheck + ' 条)');

        if (rows && rows.length > 0) {
          const result = rows.map((r, i) => {
            const mapped = {
              materialId: r.id, materialName: r.name, materialCode: String(r.id),
              categoryId: 0, categoryName: r.category_name || '',
              unitId: 1, unitName: r.unit || 'kg', unitPrice: Math.round((Number(r.unit_price) || 0) * 100),
              salesMode: 2, materialType: r.material_type || 1, status: 1,
              stock: 999, imageUrl: '', barCode: r.bar_code || '',
              supplierId: r.supplier_id || 0, supplierName: '',
            };
            if (i < 5) console.log('[ScaleInbound-MaterialList] [traceId=' + traceId + ']   [' + i + '] materialId=' + mapped.materialId + ', name=' + mapped.materialName + ', unitPrice=' + mapped.unitPrice + ', barCode=' + (mapped.barCode || '(无)'));
            return mapped;
          });
          console.log('[ScaleInbound-MaterialList] [traceId=' + traceId + '] ━━━ 查询完成: ' + result.length + ' 条 ━━━');
          return result;
        }
        console.warn('[ScaleInbound-MaterialList] [traceId=' + traceId + '] ★★★ SQLite inbound_materials 表查询为空! is_active过滤后0条');
      } catch(e) {
        console.warn('[ScaleInbound-MaterialList] [traceId=' + traceId + '] ★★★ SQLite 查询异常: ' + e.message);
        console.warn('[ScaleInbound-MaterialList] [traceId=' + traceId + '] 堆栈: ' + (e.stack || '无'));
      }
    } else {
      console.warn('[ScaleInbound-MaterialList] [traceId=' + traceId + '] ★★★ dbQuery 不可用! 无法查询入库产品');
    }
    console.log('[ScaleInbound-MaterialList] [traceId=' + traceId + '] ━━━ 返回空列表 ━━━');
    return [];
  }

  function mapInboundMaterial(r) {
    return {
      materialId: r.materialId != null ? r.materialId : r.id,
      materialName: r.materialName || r.name || '',
      materialCode: String(r.materialId != null ? r.materialId : r.id),
      categoryId: r.categoryId || 0,
      categoryName: r.categoryName || r.category_name || '',
      unitId: 1,
      unitName: r.unitName || r.unit || 'kg',
      unitPrice: r.unitPrice != null ? r.unitPrice : Math.round((Number(r.unit_price) || 0) * 100),
      salesMode: 2,
      materialType: r.materialType || r.material_type || 1,
      imageUrl: r.imageUrl || '',
      barCode: r.barCode || r.bar_code || '',
      stock: r.stock || 999,
      supplierId: r.supplierId || r.supplier_id || 0,
    };
  }

  // ─── 获取 SQLite 类别列表（菜单/菜品系统使用 product_categories 表）───
  function getCategoryList(db) {
    if (!db) return [];
    try {
      const rows = db('SELECT id, name, sort_order FROM product_categories ORDER BY sort_order, id', []);
      if (!rows || rows.length === 0) {
        // ★ 兜底：表为空时返回默认分类，避免APK报"获取分类异常"
        return [{
          categoryId: 1, categoryName: '默认分类', level: 1, parentId: 0,
          children: [], sortOrder: 0,
        }];
      }
      return (rows || []).map(r => ({
        categoryId: r.id, categoryName: r.name, level: 1, parentId: 0,
        children: [], sortOrder: r.sort_order || 0,
      }));
    } catch (e) {
      // 异常兜底
      return [{
        categoryId: 1, categoryName: '默认分类', level: 1, parentId: 0,
        children: [], sortOrder: 0,
      }];
    }
  }

  // ─── 获取入库原料分类列表（从 inbound_materials 表动态读取）───
  function getMaterialCategoryList() {
    const traceId = 'catlist_' + Date.now();
    // ★ 从入库产品表中读取实际使用的分类名称
    const fallback = [
      { categoryId: 1, categoryName: '蔬菜', level: 1, parentId: 0, children: [], sortOrder: 1 },
      { categoryId: 2, categoryName: '水果', level: 1, parentId: 0, children: [], sortOrder: 2 },
      { categoryId: 3, categoryName: '肉类', level: 1, parentId: 0, children: [], sortOrder: 3 },
      { categoryId: 4, categoryName: '水产', level: 1, parentId: 0, children: [], sortOrder: 4 },
      { categoryId: 5, categoryName: '粮油', level: 1, parentId: 0, children: [], sortOrder: 5 },
      { categoryId: 6, categoryName: '调味品', level: 1, parentId: 0, children: [], sortOrder: 6 },
      { categoryId: 7, categoryName: '干货', level: 1, parentId: 0, children: [], sortOrder: 7 },
      { categoryId: 8, categoryName: '冻品', level: 1, parentId: 0, children: [], sortOrder: 8 },
    ];
    try {
      if (dbQuery) {
        const rows = dbQuery(
          "SELECT DISTINCT category_name FROM inbound_materials WHERE is_active = 1 AND category_name IS NOT NULL AND category_name != '' ORDER BY category_name",
          []
        );
        if (rows && rows.length > 0) {
          const names = rows.map(r => r.category_name);
          console.log('[ScaleInbound][MaterialCategory][' + traceId + '] ★ 从 inbound_materials 读取到 ' + rows.length + ' 个分类: ' + names.join(', '));
          return rows.map((r, i) => ({
            categoryId: i + 1,
            categoryName: r.category_name,
            level: 1,
            parentId: 0,
            children: [],
            sortOrder: i + 1,
          }));
        }
        console.log('[ScaleInbound][MaterialCategory][' + traceId + '] inbound_materials 表无分类数据，使用默认分类');
      } else {
        console.log('[ScaleInbound][MaterialCategory][' + traceId + '] dbQuery 不可用，使用默认分类');
      }
    } catch (e) {
      console.warn('[ScaleInbound][MaterialCategory][' + traceId + '] 读取分类失败: ' + e.message + ', 使用默认分类');
    }
    return fallback;
  }

  // ─── 构建符合API文档的 category-tree 树形结构 ───
  function buildApiCategoryTree() {
    const categories = getMaterialCategoryList();
    // 构建树形节点：categoryId→id, 匹配API文档字段名
    const tree = categories.map((c, idx) => {
      const node = {
        id: c.categoryId,
        parentId: 0,
        children: (c.children || []).map(ch => ({
          id: ch.categoryId,
          parentId: c.categoryId,
          children: [],
          areaId: 0,
          areaName: '',
          categoryName: ch.categoryName,
          categoryAreaName: ch.categoryName,
          categoryType: 1,
          categoryNum: 'CT' + String(ch.categoryId).padStart(4, '0'),
          disableStatus: 1,
          bigCategoryId: c.categoryId,
        })),
        areaId: 0,
        areaName: '',
        categoryName: c.categoryName,
        categoryAreaName: c.categoryName,
        categoryType: 1,
        categoryNum: 'CT' + String(c.categoryId).padStart(4, '0'),
        disableStatus: 1,
        bigCategoryId: 0,
      };
      return node;
    });
    return tree;
  }

  // ─── 构建入库原料分类树（从入库产品表动态读取）───
  function buildMaterialCategoryTree() {
    const categories = getMaterialCategoryList();
    // 不预设子分类，由实际数据决定（如果后台添加了子分类字段则读取，否则只返回一级分类）
    // 保留蔬菜/肉类的子分类作为常见场景的补充
    const vegIdx = categories.findIndex(c => c.categoryName === '蔬菜');
    if (vegIdx >= 0) {
      categories[vegIdx].children = [
        { categoryId: 100 + vegIdx * 10 + 1, categoryName: '叶菜类', level: 2, parentId: categories[vegIdx].categoryId, children: [], sortOrder: 1 },
        { categoryId: 100 + vegIdx * 10 + 2, categoryName: '根茎类', level: 2, parentId: categories[vegIdx].categoryId, children: [], sortOrder: 2 },
        { categoryId: 100 + vegIdx * 10 + 3, categoryName: '茄果类', level: 2, parentId: categories[vegIdx].categoryId, children: [], sortOrder: 3 },
        { categoryId: 100 + vegIdx * 10 + 4, categoryName: '菌菇类', level: 2, parentId: categories[vegIdx].categoryId, children: [], sortOrder: 4 },
      ];
    }
    const meatIdx = categories.findIndex(c => c.categoryName === '肉类');
    if (meatIdx >= 0) {
      categories[meatIdx].children = [
        { categoryId: 100 + meatIdx * 10 + 1, categoryName: '猪肉', level: 2, parentId: categories[meatIdx].categoryId, children: [], sortOrder: 1 },
        { categoryId: 100 + meatIdx * 10 + 2, categoryName: '牛肉', level: 2, parentId: categories[meatIdx].categoryId, children: [], sortOrder: 2 },
        { categoryId: 100 + meatIdx * 10 + 3, categoryName: '羊肉', level: 2, parentId: categories[meatIdx].categoryId, children: [], sortOrder: 3 },
        { categoryId: 100 + meatIdx * 10 + 4, categoryName: '禽肉', level: 2, parentId: categories[meatIdx].categoryId, children: [], sortOrder: 4 },
      ];
    }
    return categories;
  }

  // ─── 批量注册 DRP 路由的通用包装 ───
  function mountDrpRoute(pathPattern, handler) {
    app.all(`/api/v4/device/drp${pathPattern}`, handler);
    app.all(`/tengyun-api/api/v4/device/drp${pathPattern}`, handler);
    console.log('[ScaleInbound][INIT] DRP 路由已注册: /api/v4/device/drp' + pathPattern + ' (含腾云变体)');
  }

  // 1. 电子秤ai-获取本次采集货品
  mountDrpRoute('/list/this/wait-register-material', async (req, res) => {
    const content = drpContent(req);
    const info = (content.materialInfo || '').trim();
    // ★★★ 新APK排查：dump 原始请求
    const traceId6 = 'waitreg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[WaitRegisterMaterial] [traceId=' + traceId6 + '] ====== 本次采集货品 ======');
    console.log('[WaitRegisterMaterial] [traceId=' + traceId6 + '] 路径: ' + req.originalUrl);
    console.log('[WaitRegisterMaterial] [traceId=' + traceId6 + '] RAW BODY: ' + JSON.stringify(req.body || {}).substring(0, 2000));
    console.log('[WaitRegisterMaterial] [traceId=' + traceId6 + '] Content所有字段: ' + JSON.stringify(Object.keys(content)));
    for (const [k, v] of Object.entries(content)) {
      console.log('[WaitRegisterMaterial] [traceId=' + traceId6 + ']   content.' + k + ' = ' + (typeof v === 'object' ? JSON.stringify(v).substring(0, 300) : String(v).substring(0, 300)));
    }

    // ★★★ 关键修复：记录设备→货品映射（之前漏了这个接口！）
    const clientIPWaitReg = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const waitRegMatId = Number(content.materialId || content.material_id || content.materialIds || 0);
    if (waitRegMatId > 0 && clientIPWaitReg) {
      deviceMaterialMap.set(clientIPWaitReg, { materialId: waitRegMatId, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
      console.log('[WaitRegisterMaterial] [traceId=' + traceId6 + '] ★ 精确映射: ' + clientIPWaitReg + ' → materialId=' + waitRegMatId);
    }

    const products = await getInboundMaterialList(info);
    console.log('[WaitRegisterMaterial] [traceId=' + traceId6 + '] SQLite 返回 ' + products.length + ' 条');

    // ★ 关键修复：上传后设备端调用此接口刷新状态，pendingUploads 按设备IP精准合并
    if (pendingUploads.length > 0 && products.length > 0 && clientIPWaitReg) {
      console.log('[WaitRegisterMaterial] [traceId=' + traceId6 + '] ★ pendingUploads 不为空，按IP精准合并...');
      const consumed = [];
      const remaining = [];
      for (const p of pendingUploads) {
        if (p.deviceIp === clientIPWaitReg) consumed.push(p);
        else remaining.push(p);
      }
      if (consumed.length > 0) {
        // 优先合并到 waitRegMatId（设备明确选择的），否则到首个无照片货品
        let targetId = waitRegMatId;
        if (!targetId || targetId <= 0) {
          const firstWithoutPic = products.find(p => {
            const matId = p.materialId || p.id;
            return !getMaterialPicStatus(matId).hasPic;
          });
          if (firstWithoutPic) targetId = firstWithoutPic.materialId || firstWithoutPic.id;
        }
        if (targetId && targetId > 0) {
          const existing = materialPhotos.get(targetId) || [];
          consumed.forEach(p => {
            if (!existing.some(e => e.url === p.url)) {
              existing.push({ url: p.url, createdAt: p.createdAt || new Date().toISOString() });
            }
          });
          materialPhotos.set(targetId, existing);
          saveMaterialPhotosToDisk();
          console.log('[WaitRegisterMaterial] [traceId=' + traceId6 + '] ✓ 按IP合并 ' + consumed.length + ' 张到 materialId=' + targetId + ', 共 ' + existing.length + ' 张');
        }
        pendingUploads.splice(0, pendingUploads.length, ...remaining);
      }
    }

    const data = products.map(p => {
      const matId = p.materialId || p.id;
      const picStatus = getMaterialPicStatus(matId);
      return {
        materialId: matId,
        materialName: p.materialName || p.name,
        materialCode: String(matId),
        categoryId: p.categoryId || 0,
        categoryName: p.categoryName || '',
        imageUrl: picStatus.imageUrl,
        unitId: 1,
        unitName: p.unitName || p.unit || 'kg',
        unitPrice: p.unitPrice != null ? p.unitPrice : Math.round((Number(p.unit_price) || 0) * 100),
        barCode: p.barCode || p.bar_code || '',
        supplierId: p.supplierId || p.supplier_id || 0,
        ifRegister: picStatus.hasPic ? 1 : 0,
        ifCollect: picStatus.hasPic ? 1 : 0,
      };
    });
    console.log('[WaitRegisterMaterial] materialInfo="' + info + '", 返回 ' + data.length + ' 条');
    res.json(drpOk({ list: data, total: data.length }));
  });

  // 2. 电子秤v5-同步货品 ★ 最核心接口
  mountDrpRoute('/sync/menuMaterial', async (req, res) => {
    const content = drpContent(req);
    const traceId7 = scaleInboundTrace();
    scaleInboundLog('sync-menuMaterial', traceId7, '→REQ', { path: req.originalUrl, bodyKeys: Object.keys(req.body || {}), contentKeys: Object.keys(content), machineSn: req.headers['machine-sn'] || '' });
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const ifAll = size === -1;
    const pageSize = ifAll ? 99999 : Math.max(1, size || 20);
    scaleInboundLog('sync-menuMaterial', traceId7, 'PARAM', { current, size, ifAll, pageSize });
    const products = await getInboundMaterialList('');
    scaleInboundLog('sync-menuMaterial', traceId7, 'DB', 'inbound_materials 返回 ' + products.length + ' 条');
    const total = products.length;
    const start = (current - 1) * pageSize;
    const records = products.slice(start, start + pageSize).map(p => {
      const matId = p.materialId || p.id;
      const picStatus = getMaterialPicStatus(matId);
      return {
        materialId: matId, materialName: p.materialName || p.name,
        materialCode: String(matId), categoryId: p.categoryId || 0,
        categoryName: p.categoryName || '', unitId: 1, unitName: p.unitName || p.unit || 'kg',
        unitPrice: p.unitPrice != null ? p.unitPrice : Math.round((Number(p.unit_price) || 0) * 100),
        salesMode: 2, materialType: p.materialType || 1,
        imageUrl: picStatus.imageUrl, barCode: p.barCode || p.bar_code || '', stock: 999,
      };
    });
    scaleInboundLog('sync-menuMaterial', traceId7, '←RES', { total, current, pageSize, returned: records.length });
    res.json(drpOk({ current, size: pageSize, total, pages: Math.ceil(total / pageSize) || 1, records }));
  });

  // 3. 电子秤v5-出库货品类别
  mountDrpRoute('/out/inventory/category', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('out-inventory-cat', traceId, '→REQ', { path: req.originalUrl });
    const categories = getMaterialCategoryList();
    scaleInboundLog('out-inventory-cat', traceId, '←RES', { count: categories.length, names: categories.map(c => c.categoryName).join(', ') });
    res.json(drpOk({ list: categories }));
  });

  // 4. 电子秤-货品检索（分页）
  mountDrpRoute('/material/page', async (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    scaleInboundLog('material-page', traceId, '→REQ', { path: req.originalUrl, contentKeys: Object.keys(content), machineSn: req.headers['machine-sn'] || '' });
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const ifAll = size === -1;
    const pageSize = ifAll ? 99999 : Math.max(1, size || 10);
    const keyword = (content.materialName || content.materialInfo || content.materialCode || '').trim();
    scaleInboundLog('material-page', traceId, 'PARAM', { current, size, pageSize, keyword, materialType: content.materialType });
    let products = await getInboundMaterialList(keyword);
    if (content.materialType !== undefined) {
      const mt = Number(content.materialType);
      products = products.filter(p => (p.materialType || p.material_type || 1) === mt);
    }
    const total = products.length;
    const start = (current - 1) * pageSize;
    const records = products.slice(start, start + pageSize).map(p => {
      const matId = p.materialId || p.id;
      const picStatus = getMaterialPicStatus(matId);
      return { ...mapInboundMaterial(p), imageUrl: picStatus.imageUrl };
    });
    scaleInboundLog('material-page', traceId, '←RES', { total, returned: records.length });
    res.json(drpOk({ current, size: pageSize, total, pages: Math.ceil(total / pageSize) || 1, records }));
  });

  // 5. 电子秤-按库存获取出库货品
  mountDrpRoute('/page/out-material/by-inventory', async (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    scaleInboundLog('out-material-by-inv', traceId, '→REQ', { path: req.originalUrl, contentKeys: Object.keys(content) });
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const ifAll = size === -1;
    const pageSize = ifAll ? 99999 : Math.max(1, size || 10);
    const keyword = (content.materialName || content.materialInfo || content.materialCode || '').trim();
    let products = await getInboundMaterialList(keyword);
    scaleInboundLog('out-material-by-inv', traceId, 'DB', 'inbound_materials 返回 ' + products.length + ' 条');
    const total = products.length;
    const start = (current - 1) * pageSize;
    const records = products.slice(start, start + pageSize).map(p => {
      const matId = p.materialId || p.id;
      const picStatus = getMaterialPicStatus(matId);
      return {
        ...mapInboundMaterial(p),
        imageUrl: picStatus.imageUrl,
        inventoryNum: 999, materialNum: 999,
        warehouseId: 0, warehouseName: '默认仓库',
      };
    });
    res.json(drpOk({ current, size: pageSize, total, pages: Math.ceil(total / pageSize) || 1, records }));
  });

  // 6. 电子秤-新增货品
  // ★★★ 特别注意：额外显式注册精确路由（防止被 DRP catch-all 先匹配）
  async function handleAddMaterial(req, res) {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    try {

    // ★ 打印所有 content 字段，方便排查设备传的字段名
    console.log('[add-material] ====== 新增货品 ====== ' + new Date().toISOString());
    console.log('[add-material] [traceId=' + traceId + '] 请求路径: ' + req.originalUrl);
    console.log('[add-material] [traceId=' + traceId + '] RAW BODY: ' + JSON.stringify(req.body || {}).substring(0, 2000));
    console.log('[add-material] [traceId=' + traceId + '] Content 完整字段: ' + JSON.stringify(content).substring(0, 1000));
    scaleInboundLog('add-material', traceId, '→REQ', {
      path: req.originalUrl,
      name: (content.materialName || '').trim(),
      categoryId: content.categoryId,
      categoryName: content.categoryName,
      salesMode: content.salesMode,
      materialType: content.materialType,
      unitId: content.unitId,
      unitPrice: content.unitPrice,
      barCode: content.barCode,
      machineSn: req.headers['machine-sn'] || '',
    });

    const name = (content.materialName || '').trim();
    if (!name) { scaleInboundLog('add-material', traceId, 'ERROR', '货品名称不能为空'); return res.json(drpErr('货品名称不能为空')); }

    // ★★★ 关键修复：categoryId → categoryName 反查
    // 设备传的是 categoryId（整数），但 inbound_materials 表只有 category_name 字符串字段
    let categoryName = (content.categoryName || '').trim();
    const categoryId = Number(content.categoryId || 0);
    if (!categoryName && categoryId > 0) {
      const knownCategories = getMaterialCategoryList();
      const matched = knownCategories.find(c => c.categoryId === categoryId);
      if (matched) {
        categoryName = matched.categoryName;
        console.log('[add-material] [traceId=' + traceId + '] categoryId=' + categoryId + ' → categoryName=' + categoryName + ' (从分类列表反查)');
      } else {
        const defaultCats = ['蔬菜', '水果', '肉类', '水产', '粮油', '调味品', '干货', '冻品'];
        if (categoryId >= 1 && categoryId <= defaultCats.length) {
          categoryName = defaultCats[categoryId - 1];
          console.log('[add-material] [traceId=' + traceId + '] categoryId=' + categoryId + ' → categoryName=' + categoryName + ' (从默认分类映射)');
        }
      }
    }

    // ★ 单位：unitId → unitName
    let unitName = (content.unitName || '').trim();
    const unitId = Number(content.unitId || 1);
    if (!unitName) {
      const unitMap = { 1: 'kg', 2: 'g', 3: '斤', 4: '公斤', 5: '个', 6: '箱', 7: '袋' };
      unitName = unitMap[unitId] || 'kg';
    }

    // ★ 计量类型：salesMode=1按份 2称重；对应 material_type
    const salesMode = Number(content.salesMode || 2);
    const materialType = Number(content.materialType || (salesMode === 1 ? 2 : 1));

    // ★ unitPrice：设备API文档说传进价，是整数（分）；需除以100转元
    let unitPrice = 0;
    if (content.unitPrice !== undefined && content.unitPrice !== null && content.unitPrice !== '') {
      const rawPrice = Number(content.unitPrice);
      if (rawPrice > 0) {
        // rawPrice >= 100 认为是分，否则认为已经是元
        unitPrice = rawPrice >= 100 ? rawPrice / 100 : rawPrice;
      }
    }

    const barCode = (content.barCode || '').trim() || null;

    scaleInboundLog('add-material', traceId, 'PARSED', { name, categoryName, unitName, unitPrice, materialType, barCode });

    // 尝试 Supabase 写入
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const baseUrl = supabaseUrl.replace(/\/+$/, '');
        const headers = { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
        const bodyJson = JSON.stringify({
          name,
          category_name: categoryName,
          unit: unitName,
          unit_price: unitPrice,
          material_type: materialType,
          bar_code: barCode,
          is_active: true,
        });
        const cres = await safeFetch(`${baseUrl}/rest/v1/inbound_materials`, { method: 'POST', headers, body: bodyJson });
        if (cres.ok) {
          const created = await cres.json();
          const matId = created && created.length > 0 ? created[0].id : (created && created.id ? created.id : 0);
          scaleInboundLog('add-material', traceId, '←RES(Supabase)', { materialId: matId, name });
          return res.json(drpOk({ materialId: matId, materialName: name }));
        } else {
          const errText = await cres.text().catch(() => '');
          console.warn('[add-material] Supabase写入失败 status=' + cres.status + ': ' + errText.substring(0, 300));
        }
      } catch(e) { console.warn('[Drp] Supabase add material failed:', e.message); }
    }
    // 本地 SQLite 兜底
    if (dbQuery) {
      try {
        const ex = dbQuery('SELECT id FROM inbound_materials WHERE name = ?', [name]);
        if (ex && ex.length > 0) {
          scaleInboundLog('add-material', traceId, '←RES', { existed: true, materialId: ex[0].id });
          return res.json(drpOk({ materialId: ex[0].id, materialName: name }));
        }
        const now = new Date().toISOString();
        dbQuery("INSERT INTO inbound_materials (name, category_name, unit, unit_price, supplier_id, material_type, bar_code, is_active, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, '', ?, ?)", [name, categoryName, unitName, unitPrice, 0, materialType, barCode, now, now]);
        const nr = dbQuery('SELECT id FROM inbound_materials WHERE name = ? ORDER BY id DESC LIMIT 1', [name]);
        const newId = nr && nr.length > 0 ? nr[0].id : 0;
        scaleInboundLog('add-material', traceId, '←RES(SQLite)', { created: true, materialId: newId, name, categoryName, unitName, unitPrice });
        return res.json(drpOk({ materialId: newId, materialName: name }));
      } catch (e) { scaleInboundLog('add-material', traceId, 'ERROR', e.message); return res.json(drpErr(e.message)); }
    }
    scaleInboundLog('add-material', traceId, '←RES', 'dbQuery 不可用，返回 materialId=0');
    return res.json(drpOk({ materialId: 0, materialName: name }));

    } catch (outerErr) {
      console.error('[add-material] [traceId=' + traceId + '] ★★★ 未捕获异常: ' + outerErr.message);
      console.error('[add-material] [traceId=' + traceId + '] 堆栈: ' + (outerErr.stack || ''));
      if (!res.headersSent) return res.json(drpErr('服务器内部错误: ' + outerErr.message));
    }
  }
  // ★★★ 显式注册精确路由（防止 DRP catch-all 先拦截）
  app.all('/api/v4/device/drp/add/material', handleAddMaterial);
  app.all('/tengyun-api/api/v4/device/drp/add/material', handleAddMaterial);

  // 7. 电子秤4.0-根据货品ID、仓库名称获取库存
  mountDrpRoute('/getInventoryNumByMaterialId', async (req, res) => {
    const content = drpContent(req);
    const materialId = Number(content.materialId);
    if (!materialId) return res.json(drpErr('货品ID不能为空'));
    const picStatus = getMaterialPicStatus(materialId);
    // Supabase 查询
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const baseUrl = supabaseUrl.replace(/\/+$/, '');
        const headers = { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` };
        const sres = await safeFetch(`${baseUrl}/rest/v1/inbound_materials?id=eq.${materialId}&select=*`, { headers });
        if (sres.ok) {
          const rows = await sres.json();
          if (rows && rows.length > 0) {
            const r = rows[0];
            return res.json(drpOk({
              records: [{
                materialId: r.id, materialName: r.name,
                inventoryNum: 999, materialNum: 999,
                warehouseId: 0, warehouseName: '默认仓库',
                unitPrice: Math.round((Number(r.unit_price) || 0) * 100),
                imageUrl: picStatus.imageUrl,
              }],
              total: 1,
            }));
          }
        }
      } catch(e) {}
    }
    // 本地 SQLite 兜底
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, name, unit, unit_price, material_type FROM inbound_materials WHERE id = ?', [materialId]);
        if (rows && rows.length > 0) {
          const r = rows[0];
          return res.json(drpOk({
            records: [{
              materialId: r.id, materialName: r.name,
              inventoryNum: 999, materialNum: 999,
              warehouseId: 0, warehouseName: '默认仓库',
              unitPrice: Math.round((Number(r.unit_price) || 0) * 100),
              imageUrl: picStatus.imageUrl,
            }],
            total: 1,
          }));
        }
      } catch (e) { }
    }
    return res.json(drpOk({ records: [], total: 0 }));
  });

  // 8. 电子秤ai-单货品注册 ★ 严防崩溃
  mountDrpRoute('/ai/one-material-register', async (req, res) => {
    try {
    const content = drpContent(req);
    const requestId = content.requestId || String(Date.now());
    // ★ 重新识别时也需要回传重量，否则设备屏幕上的重量会归零
    const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const reqW = extractAndCacheWeightFromRequest(req);
    const resolvedWOneReg = resolveFinalWeight(reqW, clientIP);
    const respData = { requestId, status: 'success' };
    if (resolvedWOneReg) { respData.weight = resolvedWOneReg.weight; respData.weightUnit = resolvedWOneReg.unit; }
    res.json(drpOk(respData));
    } catch (err) {
      console.error('[OneMaterialRegister] ★★★ 崩溃捕获: ' + err.message);
      if (!res.headersSent) res.json(drpOk({ requestId: String(Date.now()), status: 'success' }));
    }
  });

  // 9. 电子秤-获取货品的保质期截止日期
  mountDrpRoute('/getMaterialShelfLifeDays', async (req, res) => {
    const content = drpContent(req);
    const materialId = content.materialId;
    const startDate = content.startDate || new Date().toISOString().slice(0, 10);
    res.json(drpOk({ materialId, startDate, shelfLifeDays: 180, expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10) }));
  });

  // 10. 电子秤v5-上传货品注册图（入库产品无 media 列，用内存存储）
  mountDrpRoute('/upload/material/register-pic', async (req, res) => {
    const content = drpContent(req);
    const materialId = Number(content.materialId);
    const urls = content.imageUrlList || content.picUrlList || [];

    console.log('[RegisterPic] ====== 上传货品注册图 ======');
    console.log('[RegisterPic] materialId: ' + materialId + ', urls数量: ' + urls.length);
    urls.forEach((u, i) => console.log('[RegisterPic]   url[' + i + ']: ' + u));

    const validUrls = urls.filter(Boolean);
    const now = new Date().toISOString();

    // ★ 方案一：materialId 无效直接拒绝，强制先选货品再拍照
    if (!materialId || materialId <= 0) {
      console.log('[RegisterPic] ★★★ 拒绝上传: materialId=' + materialId + ' (无效), 请先在设备上选择货品再拍照');
      return res.json({ code: 1, msg: '请先在设备上选择货品，再拍摄货品照片', data: null });
    }

    // 有 materialId → 直接关联
    const existing = materialPhotos.get(materialId) || [];
    validUrls.forEach(url => { if (url) existing.push({ url, createdAt: now }); });
    materialPhotos.set(materialId, existing);
    saveMaterialPhotosToDisk();
    console.log('[RegisterPic] 已存储, materialId=' + materialId + ' 共 ' + existing.length + ' 张');

    res.json(drpOk({ materialId, uploadedCount: validUrls.length, imageUrlList: validUrls }));
  });

  // 11. 电子秤v5-查询货品注册图
  mountDrpRoute('/list/material/register-pic', async (req, res) => {
    const content = drpContent(req);
    const materialId = Number(content.materialId);
    const traceId5 = 'qreg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] ====== 查询货品注册图 ======');
    console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] materialId: ' + materialId);
    console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] materialPhotos size: ' + materialPhotos.size + ', pendingUploads: ' + pendingUploads.length);

    // ★ 记录设备→货品映射
    if (materialId && materialId > 0) {
      const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
      deviceMaterialMap.set(clientIP, { materialId, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
      console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] ★ 记录设备映射: ' + clientIP + ' → materialId=' + materialId);
    }

    let list = [];
    if (materialId && materialId > 0) {
      list = materialPhotos.get(materialId) || [];
      console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] 找到 materialId=' + materialId + ' 的图片: ' + list.length + ' 张');

      // ★ 合并 pendingUploads
      if (pendingUploads.length > 0) {
        console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] ★ 合并 pendingUploads (' + pendingUploads.length + ' 条)');
        const drained = pendingUploads.splice(0);
        const merged = [...list];
        drained.forEach(u => {
          if (!merged.some(p => p.url === u.url)) {
            merged.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString() });
          }
        });
        materialPhotos.set(materialId, merged);
        saveMaterialPhotosToDisk();
        list = merged;
        console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] ✓ 合并后共 ' + list.length + ' 张');
      }
    } else {
      // ★★★ materialId=0 时也要把 pendingUploads 包含进来
      console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] 全量查询, materialId=' + materialId + ' (<=0)');
      for (const [, urls] of materialPhotos.entries()) {
        list.push(...urls);
      }
      console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] Map中图片数: ' + list.length);
      if (pendingUploads.length > 0) {
        console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] ★ materialId=0, 只读 pendingUploads (' + pendingUploads.length + ' 条), 不 drain');
        peekPendingUploads().forEach(u => {
          if (!list.some(p => p.url === u.url)) {
            list.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString() });
          }
        });
        console.log('[QueryRegisterPic] [traceId=' + traceId5 + '] ✓ 含队列共 ' + list.length + ' 张');
      }
    }
    // ★ DRP 体系成功码必须是 10000，且每条记录携带全部字段名变体
    res.json(buildPicListResponse(list, materialId));
  });

  // 12. 电子秤v5-初始化赋值类别表等级和货品一级类别
  mountDrpRoute('/init/category-level/material-big-category', async (req, res) => {
    const categories = getMaterialCategoryList();
    const tree = categories.map(c => ({
      ...c, level: 1, children: [],
      categoryLevelName: `一级-${c.categoryName}`,
    }));
    res.json(drpOk({ list: tree, bigCategoryList: categories }));
  });

  // 13. 电子秤ai-获取未注册/已注册货品
  mountDrpRoute('/page/register-material', async (req, res) => {
    const traceId = 'regmat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    // ★★★ 详细日志：先 dump 原始请求，再解析 content
    console.log('[RegisterMaterial] ====== 查询未注册/已注册货品 ======');
    console.log('[RegisterMaterial] [traceId=' + traceId + '] 请求路径: ' + req.originalUrl);
    console.log('[RegisterMaterial] [traceId=' + traceId + '] 请求方法: ' + req.method);
    console.log('[RegisterMaterial] [traceId=' + traceId + '] Content-Type: ' + (req.headers['content-type'] || '(none)'));
    console.log('[RegisterMaterial] [traceId=' + traceId + '] 客户端IP: ' + (req.ip || req.headers['x-forwarded-for'] || 'unknown'));
    console.log('[RegisterMaterial] [traceId=' + traceId + '] User-Agent: ' + (req.headers['user-agent'] || '(none)'));
    // ★ 打印所有请求头（便于识别新 APK 版本）
    const interestingHeaders = ['machine-sn', 'machinesn', 'x-machine-sn', 'machine-key', 'x-machine-key', 'merchant-id', 'x-token', 'x-version', 'x-app-version', 'x-device-type', 'x-model'];
    for (const h of interestingHeaders) {
      if (req.headers[h]) console.log('[RegisterMaterial] [traceId=' + traceId + '] Header[' + h + ']: ' + req.headers[h]);
    }
    // ★ dump 原始 body（截断到 2000 字符）
    const rawBodyStr = JSON.stringify(req.body || {});
    console.log('[RegisterMaterial] [traceId=' + traceId + '] ★ RAW BODY(' + rawBodyStr.length + '): ' + rawBodyStr.substring(0, 2000));

    const content = drpContent(req);
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const ifAll = size === -1;
    const pageSize = ifAll ? 99999 : Math.max(1, size || 10);
    const keyword = (content.materialInfo || '').trim();
    const ifRegister = content.ifRegister;

    // ★★★ 打印 content 所有字段（包括未知的新字段）
    console.log('[RegisterMaterial] [traceId=' + traceId + '] ★ CONTENT 所有字段: ' + JSON.stringify(Object.keys(content)));
    for (const [k, v] of Object.entries(content)) {
      const vs = typeof v === 'string' ? (v.length > 300 ? v.substring(0, 300) + '...(len=' + v.length + ')' : v) : JSON.stringify(v).substring(0, 300);
      console.log('[RegisterMaterial] [traceId=' + traceId + ']   content.' + k + ' = ' + vs);
    }
    console.log('[RegisterMaterial] [traceId=' + traceId + '] 分页参数: current=' + current + ', size=' + size + ', ifAll=' + ifAll + ', pageSize=' + pageSize);
    console.log('[RegisterMaterial] [traceId=' + traceId + '] keyword="' + keyword + '", ifRegister=' + (ifRegister !== undefined ? ifRegister : 'undefined(全部)'));
    console.log('[RegisterMaterial] [traceId=' + traceId + '] materialPhotos Map: ' + materialPhotos.size + ' 个货品, pendingUploads 队列: ' + pendingUploads.length + ' 条');
    console.log('[RegisterMaterial] [traceId=' + traceId + '] deviceMaterialMap: ' + deviceMaterialMap.size + ' 条映射');
    for (const [ip, entry] of deviceMaterialMap.entries()) {
      console.log('[RegisterMaterial] [traceId=' + traceId + ']   映射: ' + ip + ' → materialId=' + entry.materialId + ' (过期=' + new Date(entry.expireAt).toISOString() + ')');
    }

    // ★ 记录设备→货品映射：设备选择具体货品时更新映射
    // 电子秤切换货品后调用此接口，如果 content 携带 materialId 则精确映射
    const clientIPReg = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const contentMaterialId = Number(content.materialId || content.material_id || 0);
    if (contentMaterialId > 0 && clientIPReg) {
      deviceMaterialMap.set(clientIPReg, { materialId: contentMaterialId, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
      console.log('[RegisterMaterial] [traceId=' + traceId + '] ★ 精确映射: ' + clientIPReg + ' → materialId=' + contentMaterialId);
    }

    let products = await getInboundMaterialList(keyword);
    console.log('[RegisterMaterial] [traceId=' + traceId + '] SQLite 返回 ' + products.length + ' 个货品');

    // ★ 关键修复：上传后设备端调用此接口刷新状态，pendingUploads 按设备IP精准合并
    if (pendingUploads.length > 0 && products.length > 0 && clientIPReg) {
      console.log('[RegisterMaterial] [traceId=' + traceId + '] ★ pendingUploads 不为空，按IP精准合并...');
      const consumed = [];
      const remaining = [];
      for (const p of pendingUploads) {
        if (p.deviceIp === clientIPReg) consumed.push(p);
        else remaining.push(p);
      }
      if (consumed.length > 0) {
        // 优先合并到 contentMaterialId（设备明确选择的），否则到首个无照片货品
        let targetId = contentMaterialId;
        if (!targetId || targetId <= 0) {
          const firstWithoutPic = products.find(p => {
            const matId = p.materialId || p.id;
            return !getMaterialPicStatus(matId).hasPic;
          });
          if (firstWithoutPic) targetId = firstWithoutPic.materialId || firstWithoutPic.id;
        }
        if (targetId && targetId > 0) {
          const existing = materialPhotos.get(targetId) || [];
          consumed.forEach(p => {
            if (!existing.some(e => e.url === p.url)) {
              existing.push({ url: p.url, createdAt: p.createdAt || new Date().toISOString() });
            }
          });
          materialPhotos.set(targetId, existing);
          saveMaterialPhotosToDisk();
          console.log('[RegisterMaterial] [traceId=' + traceId + '] ✓ 按IP合并 ' + consumed.length + ' 张到 materialId=' + targetId + ', 共 ' + existing.length + ' 张');
        }
        pendingUploads.splice(0, pendingUploads.length, ...remaining);
      }
    }

    // ★ 逐个打印每个货品的照片状态
    console.log('[RegisterMaterial] [traceId=' + traceId + '] ====== 货品照片状态明细 ======');
    products = products.map((p, idx) => {
      const matId = p.materialId || p.id;
      const picStatus = getMaterialPicStatus(matId);
      console.log('[RegisterMaterial] [traceId=' + traceId + ']   [' + idx + '] materialId=' + matId + ', 名称=' + (p.materialName || p.name || '?') + ', hasPic=' + picStatus.hasPic + ', 图片数=' + picStatus.count + ', imageUrl=' + (picStatus.imageUrl || '(空)'));
      return {
        ...mapInboundMaterial(p),
        ifRegister: picStatus.hasPic ? 1 : 2,
        ifCollect: picStatus.hasPic ? 1 : 2,
        imageUrl: picStatus.imageUrl,
        modelVersion: 'v1.0.0',
      };
    });
    console.log('[RegisterMaterial] [traceId=' + traceId + '] 照片状态统计完毕');

    if (ifRegister !== undefined) {
      const beforeFilter = products.length;
      products = products.filter(p => p.ifRegister === Number(ifRegister));
      console.log('[RegisterMaterial] [traceId=' + traceId + '] 按 ifRegister=' + ifRegister + ' 过滤: ' + beforeFilter + ' → ' + products.length);
    }
    const total = products.length;
    const start = (current - 1) * pageSize;
    const records = products.slice(start, start + pageSize);

    // ★ 最终响应日志
    console.log('[RegisterMaterial] [traceId=' + traceId + '] ====== 响应: total=' + total + ', 当前页=' + current + ', 返回 ' + records.length + ' 条 ======');
    records.forEach((r, i) => {
      console.log('[RegisterMaterial] [traceId=' + traceId + ']   [' + i + '] materialId=' + r.materialId + ', ifRegister=' + r.ifRegister + ', hasImg=' + !!r.imageUrl);
    });
    console.log('[RegisterMaterial] [traceId=' + traceId + '] 响应结构: ' + JSON.stringify({ current, size: pageSize, total, pages: Math.ceil(total / pageSize) || 1, recordsCount: records.length }).substring(0, 400));

    res.json(drpOk({ current, size: pageSize, total, pages: Math.ceil(total / pageSize) || 1, records }));
  });

  // 13b. 电子秤V3-向量识别货品列表（新APK）★ 严防崩溃：外层 try-catch 确保任何异常都返回正常响应
  mountDrpRoute('/page/vector-material', async (req, res) => {
    const traceId = 'vecmat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    try {
    const content = drpContent(req);
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const ifAll = size === -1;
    const pageSize = ifAll ? 99999 : Math.max(1, size || 15);
    const keyword = (content.materialInfo || content.materialName || '').trim();

    console.log('[VectorMaterial] [traceId=' + traceId + '] ====== V3向量识别货品列表 ======');
    console.log('[VectorMaterial] [traceId=' + traceId + '] 路径: ' + req.originalUrl);
    console.log('[VectorMaterial] [traceId=' + traceId + '] RAW BODY: ' + JSON.stringify(req.body || {}).substring(0, 2000));
    console.log('[VectorMaterial] [traceId=' + traceId + '] Content所有字段: ' + JSON.stringify(Object.keys(content)));
    for (const [k, v] of Object.entries(content)) {
      console.log('[VectorMaterial] [traceId=' + traceId + ']   content.' + k + ' = ' + (typeof v === 'object' ? JSON.stringify(v).substring(0, 300) : String(v).substring(0, 300)));
    }
    console.log('[VectorMaterial] [traceId=' + traceId + '] 分页: current=' + current + ', size=' + size + ', pageSize=' + pageSize + ', keyword="' + keyword + '"');

    const products = await getInboundMaterialList(keyword);
    console.log('[VectorMaterial] [traceId=' + traceId + '] SQLite 返回 ' + products.length + ' 条');

    const total = products.length;
    const start = (current - 1) * pageSize;
    const slice = products.slice(start, start + pageSize);

    // ★ 记录设备→货品映射（兜底）：新APK不调 list/material-pic，
    //    直接调 sysfile/upload 拍照，需要在列表查询时建立映射
    const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const vectContentMatId = Number(content.materialId || content.material_id || 0);
    if (vectContentMatId > 0 && clientIP) {
      // ★ 设备明确选择了某个货品 → 精确映射
      deviceMaterialMap.set(clientIP, { materialId: vectContentMatId, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
      console.log('[VectorMaterial] [traceId=' + traceId + '] ★ 精确映射(用户选择): ' + clientIP + ' → materialId=' + vectContentMatId);
    } else if (slice.length === 1 && clientIP) {
      // 只有1个货品 → 大概率就是用户要拍的，直接映射
      const matId = slice[0].materialId || slice[0].id;
      deviceMaterialMap.set(clientIP, { materialId: matId, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
      console.log('[VectorMaterial] [traceId=' + traceId + '] ★ 单货品兜底映射: ' + clientIP + ' → materialId=' + matId);
    } else if (clientIP && slice.length > 1) {
      // ★ 多货品列表：保留现有映射不删除。
      //    之前 delete 的做法导致：称重中点击"重新识别"→映射被清→重量丢失。
      //    映射只在用户明确选择货品时覆盖，浏览列表不影响当前称重状态。
      const oldMapping = deviceMaterialMap.get(clientIP);
      if (oldMapping) {
        console.log('[VectorMaterial] [traceId=' + traceId + '] ★ 保留现有映射: ' + clientIP + ' → materialId=' + oldMapping.materialId + ' (多货品列表，不重置称重状态)');
      }
    }

    // ★ 合并 pendingUploads：只有明确知道目标货品时才合并，防止误关联到列表第一个
    // ★ 按设备IP精准消费：只消费该设备上传的照片，不影响其他设备的pendingUploads
    if (pendingUploads.length > 0 && slice.length > 0) {
      const targetMatId = Number(content.materialId || content.material_id || 0);
      if (targetMatId > 0) {
        console.log('[VectorMaterial] [traceId=' + traceId + '] ★ 消费 pendingUploads(' + pendingUploads.length + '条) → 明确货品 materialId=' + targetMatId);
        if (clientIP) {
          // ★ 只消费该设备的 pendingUploads，不影响其他设备的
          const consumed = [];
          const remaining = [];
          for (const p of pendingUploads) {
            if (p.deviceIp === clientIP) consumed.push(p);
            else remaining.push(p);
          }
          if (consumed.length > 0) {
            const existing = materialPhotos.get(targetMatId) || [];
            consumed.forEach(p => {
              if (!existing.some(e => e.url === p.url)) {
                existing.push({ url: p.url, createdAt: p.createdAt || new Date().toISOString() });
              }
            });
            materialPhotos.set(targetMatId, existing);
            saveMaterialPhotosToDisk();
            console.log('[VectorMaterial] [traceId=' + traceId + '] ✓ 已关联 ' + consumed.length + ' 张图片(deviceIp=' + clientIP + ')到 materialId=' + targetMatId + ', 共 ' + existing.length + ' 张');
          }
          pendingUploads.splice(0, pendingUploads.length, ...remaining);
        } else {
          mergePendingUploadsToMaterial(targetMatId);
        }
      } else if (slice.length === 1) {
        const firstMatId = slice[0].materialId || slice[0].id;
        console.log('[VectorMaterial] [traceId=' + traceId + '] ★ 合并 pendingUploads(' + pendingUploads.length + '条) → 唯一货品 materialId=' + firstMatId);
        mergePendingUploadsToMaterial(firstMatId);
      } else {
        console.log('[VectorMaterial] [traceId=' + traceId + '] ★ 多货品且未明确选择，pendingUploads 不合并（避免误关联到列表首个货品）');
      }
    }

    const records = slice.map(p => {
      const matId = p.materialId || p.id;
      const picStatus = getMaterialPicStatus(matId);
      // ★ 返回所有已上传的图片URL，不仅仅是第一张
      const pics = materialPhotos.get(matId) || [];
      const pictureList = pics.length > 0 ? pics.map(pic => pic.url) : [];
      return {
        materialId: matId,
        materialName: p.materialName || p.name || '',
        materialCode: String(matId),
        brandName: p.brandName || p.brand_name || '',
        spec: p.spec || p.specification || '',
        pictureList,
        imageUrl: picStatus.imageUrl,
        ifRegister: picStatus.hasPic ? 1 : 2,
        ifCollect: picStatus.hasPic ? 1 : 2,
        unitId: 1,
        unitName: p.unitName || p.unit || 'kg',
        unitPrice: p.unitPrice != null ? p.unitPrice : Math.round((Number(p.unit_price) || 0) * 100),
        salesMode: 2,
        materialType: p.materialType || p.material_type || 1,
        categoryId: p.categoryId || 0,
        categoryName: p.categoryName || '',
        barCode: p.barCode || p.bar_code || '',
        supplierId: p.supplierId || p.supplier_id || 0,
      };
    });

    console.log('[VectorMaterial] [traceId=' + traceId + '] ====== 响应: total=' + total + ', 返回 ' + records.length + ' 条 ======');
    records.forEach((r, i) => {
      console.log('[VectorMaterial] [traceId=' + traceId + ']   [' + i + '] materialId=' + r.materialId + ', name=' + r.materialName + ', hasPic=' + (r.pictureList.length > 0) + ', ifRegister=' + r.ifRegister);
    });

    // ★★★ 重量诊断日志 + 回传
    const reqWeight = extractAndCacheWeightFromRequest(req);
    const resolvedW = resolveFinalWeight(reqWeight, clientIP);
    console.log('[VectorMaterial] [traceId=' + traceId + '] 重量: req=' + reqWeight + ', final=' + (resolvedW ? resolvedW.weight + resolvedW.unit : 'null(无可用重量)'));

    const respData = {
      records,
      total,
      size: pageSize,
      current,
      pages: Math.ceil(total / pageSize) || 1,
    };
    if (resolvedW) { respData.weight = resolvedW.weight; respData.weightUnit = resolvedW.unit; }

    res.json({
      code: 10000,
      msg: '成功',
      data: respData,
    });

    } catch (err) {
      console.error('[VectorMaterial] [traceId=' + traceId + '] ★★★ 崩溃捕获: ' + err.message);
      console.error('[VectorMaterial] [traceId=' + traceId + '] 堆栈: ' + (err.stack || ''));
      if (!res.headersSent) {
        res.json({ code: 10000, msg: '成功', data: { records: [], total: 0, size: 15, current: 1, pages: 0 } });
      }
    }
  });

  // 14. 电子秤ai-获取未注册/已注册货品数量
  mountDrpRoute('/get/register-material-num', async (req, res) => {
    const content = drpContent(req);
    const ifRegister = content.ifRegister;
    const products = await getInboundMaterialList('');
    const registered = 0;
    const unregistered = products.length;
    let result = {};
    if (ifRegister === 1) result = { registerNum: registered, nonRegisterNum: unregistered, total: products.length };
    else if (ifRegister === 2) result = { registerNum: registered, nonRegisterNum: unregistered, total: products.length };
    else result = { allNum: products.length, registerNum: registered, nonRegisterNum: unregistered };
    res.json(drpOk(result));
  });

  // 15. 电子秤ai-获取货品照片
  mountDrpRoute('/list/material-pic', async (req, res) => {
    const content = drpContent(req);
    const materialId = Number(content.materialId);
    const now3 = Date.now();
    const traceId = 'picq_' + now3 + '_' + Math.random().toString(36).slice(2, 6);

    // ★ 详细日志：查询货品照片
    console.log('[MaterialPic] ====== 查询货品照片 ======');
    console.log('[MaterialPic] [traceId=' + traceId + '] 请求路径: ' + req.originalUrl);
    console.log('[MaterialPic] [traceId=' + traceId + '] content.materialId: ' + content.materialId + ' (解析: ' + materialId + ')');
    console.log('[MaterialPic] [traceId=' + traceId + '] content 完整: ' + JSON.stringify(content).substring(0, 500));

    // ★ 记录设备→货品映射：设备查询某货品照片 → 即将拍照 → sysfile/upload 可从此补全 materialId
    if (materialId && materialId > 0) {
      const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
      deviceMaterialMap.set(clientIP, { materialId, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
      console.log('[MaterialPic] [traceId=' + traceId + '] ★ 记录设备映射: ' + clientIP + ' → materialId=' + materialId + ' (5分钟有效)');
    }
    console.log('[MaterialPic] [traceId=' + traceId + '] materialPhotos Map 中有 ' + materialPhotos.size + ' 个货品, pendingUploads 队列: ' + pendingUploads.length + ' 条');
    for (const [id, pics] of materialPhotos.entries()) {
      console.log('[MaterialPic] [traceId=' + traceId + ']   materialId=' + id + ' -> ' + pics.length + ' 张');
    }
    if (pendingUploads.length > 0) {
      console.log('[MaterialPic] [traceId=' + traceId + '] pendingUploads 明细:');
      pendingUploads.forEach((u, i) => console.log('[MaterialPic] [traceId=' + traceId + ']   [' + i + '] ' + u.filename + ' traceId=' + u.traceId + ' createdAt=' + u.createdAt));
    }

    let list = [];
    if (materialId && materialId > 0) {
      list = materialPhotos.get(materialId) || [];
      console.log('[MaterialPic] [traceId=' + traceId + '] 查询 materialId=' + materialId + ', Map中找到 ' + list.length + ' 张');

      // ★★★ 核心修复：无论 Map 里有没有图，都把 pendingUploads 合并进来
      // 电子秤工作流程：拍照上传（不带materialId）→ 立即查询（带materialId）
      if (pendingUploads.length > 0) {
        console.log('[MaterialPic] [traceId=' + traceId + '] ★ pendingUploads 有 ' + pendingUploads.length + ' 条新上传 → 合并到 materialId=' + materialId);
        const drained = pendingUploads.splice(0);
        const merged = [...list];
        drained.forEach(u => {
          // 去重：URL 已存在就不重复加
          if (!merged.some(p => p.url === u.url)) {
            merged.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString(), traceId: u.traceId });
          }
        });
        materialPhotos.set(materialId, merged);
        saveMaterialPhotosToDisk();
        list = merged;
        console.log('[MaterialPic] [traceId=' + traceId + '] ✓ 合并后 materialId=' + materialId + ' 共 ' + list.length + ' 张');
      }

      // Map 里还是没图（且 pendingUploads 也空了）→ 文件系统兜底扫描
      // 【修复】只作为返回数据，不再自动关联到 materialPhotos，防止 orphan 文件污染
      if (list.length === 0) {
        console.log('[MaterialPic] [traceId=' + traceId + '] Map 为空，开始从文件系统扫描（只读，不自动关联）...');
        try {
          const host2 = req.headers.host || `127.0.0.1:${state.httpPort || port}`;
          const protocol2 = req.headers['x-forwarded-proto'] || 'http';
          const filesInDir = fs.readdirSync(sysfileUploadDir);
          console.log('[MaterialPic] [traceId=' + traceId + '] sysfile-uploads/ 目录下文件数: ' + filesInDir.length);

          const imgFiles = filesInDir
            .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
            .map(f => {
              const stat = fs.statSync(path.join(sysfileUploadDir, f));
              return { file: f, mtime: stat.mtimeMs };
            })
            .sort((a, b) => b.mtime - a.mtime);

          console.log('[MaterialPic] [traceId=' + traceId + '] 图片文件: ' + imgFiles.length + ' 个');
          imgFiles.forEach((f, i) => console.log('[MaterialPic] [traceId=' + traceId + ']   [' + i + '] ' + f.file + ' (mtime=' + new Date(f.mtime).toISOString() + ')'));

          list = imgFiles.slice(0, 20).map(f => ({
            url: `${protocol2}://${host2}/sysfile-uploads/${f.file}`,
            createdAt: new Date(f.mtime).toISOString(),
          }));

          if (list.length > 0) {
            console.log('[MaterialPic] [traceId=' + traceId + '] 扫描到 ' + list.length + ' 张 orphan 图片，仅返回，不自动关联 materialId=' + materialId);
          } else {
            console.log('[MaterialPic] [traceId=' + traceId + '] ★★★ 文件系统也没有图片！请检查上传是否成功 ★★★');
          }
        } catch (fsErr) {
          console.warn('[MaterialPic] [traceId=' + traceId + '] 扫描文件系统失败: ' + fsErr.message);
        }
      }
    } else {
      // ★★★ 修复：materialId=0 或未指定时，也要把 pendingUploads 包含进来
      console.log('[MaterialPic] [traceId=' + traceId + '] 全量查询(Map), materialId=' + materialId + ' (<=0)');
      // 先从 Map 收集
      for (const [, urls] of materialPhotos.entries()) {
        list.push(...urls);
      }
      console.log('[MaterialPic] [traceId=' + traceId + '] Map 中图片数: ' + list.length);
      // ★ 把 pendingUploads 也合并进去（materialId=0 时之前缺失这一步！）
      if (pendingUploads.length > 0) {
        console.log('[MaterialPic] [traceId=' + traceId + '] ★ materialId=0, 只读 pendingUploads (' + pendingUploads.length + ' 条), 不 drain');
        peekPendingUploads().forEach(u => {
          if (!list.some(p => p.url === u.url)) {
            list.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString(), traceId: u.traceId });
          }
        });
        console.log('[MaterialPic] [traceId=' + traceId + '] ✓ 含队列共 ' + list.length + ' 张');
      }
    }

    if (list.length > 0) {
      list.forEach((pic, i) => console.log('[MaterialPic] [traceId=' + traceId + ']   [' + i + '] ' + pic.url + ' (' + pic.createdAt + ')'));
    }

    console.log('[MaterialPic] [traceId=' + traceId + '] ====== 响应: total=' + list.length + ' ======');
    const resp = buildPicListResponse(list, materialId);
    console.log('[MaterialPic] [traceId=' + traceId + '] 响应结构: ' + JSON.stringify(resp).substring(0, 600));
    // ★ data 同时返回 list 与 records，且每条记录携带全部字段名变体，避免设备端 Gson 解析失败
    res.json(resp);
  });

  // 16. 电子秤ai-删除货品照片
  mountDrpRoute('/delete/material-pic', async (req, res) => {
    const content = drpContent(req);
    const materialId = Number(content.materialId);
    const urlsToDelete = content.imageUrlList || content.picUrlList || [];
    const ifAllDelete = Number(content.ifAllDelete || 0);  // 1=全部删除, 2=按列表删
    const ifDeleteModel = Number(content.ifDeleteModel || 0); // 1=删除模型
    
    const traceId = 'delpic_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[DeleteMaterialPic] [traceId=' + traceId + '] ====== 删除货品照片 ======');
    console.log('[DeleteMaterialPic] [traceId=' + traceId + '] 路径: ' + req.originalUrl);
    console.log('[DeleteMaterialPic] [traceId=' + traceId + '] RAW BODY: ' + JSON.stringify(req.body || {}).substring(0, 2000));
    console.log('[DeleteMaterialPic] [traceId=' + traceId + '] Content所有字段: ' + JSON.stringify(Object.keys(content)));
    for (const [k, v] of Object.entries(content)) {
      console.log('[DeleteMaterialPic] [traceId=' + traceId + ']   content.' + k + ' = ' + (typeof v === 'object' ? JSON.stringify(v).substring(0, 500) : String(v).substring(0, 500)));
    }
    console.log('[DeleteMaterialPic] [traceId=' + traceId + '] 解析: materialId=' + materialId + ', ifAllDelete=' + ifAllDelete + ', ifDeleteModel=' + ifDeleteModel + ', urlsToDelete=' + urlsToDelete.length);
    urlsToDelete.forEach((u, i) => console.log('[DeleteMaterialPic] [traceId=' + traceId + ']   url[' + i + ']: ' + u));
    
    // ★ 打印当前 materialPhotos 状态，方便对比
    console.log('[DeleteMaterialPic] [traceId=' + traceId + '] 当前 materialPhotos 状态:');
    for (const [id, pics] of materialPhotos.entries()) {
      console.log('[DeleteMaterialPic] [traceId=' + traceId + ']   materialId=' + id + ' -> ' + pics.length + ' 张');
      pics.forEach((p, j) => console.log('[DeleteMaterialPic] [traceId=' + traceId + ']     [' + j + '] ' + p.url));
    }
    console.log('[DeleteMaterialPic] [traceId=' + traceId + '] pendingUploads: ' + pendingUploads.length + ' 条');
    
    // ★ 辅助：从 URL 提取文件名并删除磁盘文件
    function deleteDiskFileByUrl(url) {
      if (!url) return;
      try {
        // URL 格式: http://host/sysfile-uploads/material_xxx.jpg 或 sysfile-uploads/material_xxx.jpg
        const filename = url.split('/').pop().split('?')[0]; // 去除 query 参数
        if (!filename || !/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename)) return;
        const filePath = path.join(sysfileUploadDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('[DeleteMaterialPic] [traceId=' + traceId + '] 已删除磁盘文件: ' + filename);
          return true;
        } else {
          console.log('[DeleteMaterialPic] [traceId=' + traceId + '] 磁盘文件不存在: ' + filename);
        }
      } catch(e) { console.warn('[DeleteMaterialPic] [traceId=' + traceId + '] 删除磁盘文件失败: ' + e.message); }
      return false;
    }

    // ★ 辅助：宽松 URL 匹配 — 设备和服务器可能用不同 host/port 访问同一文件
    //   存储: http://192.168.2.33:8081/sysfile-uploads/material_xxx.jpg
    //   删除请求: http://127.0.0.1:8081/sysfile-uploads/material_xxx.jpg
    //   只要文件名一致就算匹配
    function extractFilenameFromUrl(url) {
      if (!url) return '';
      return url.split('/').pop().split('?')[0];
    }
    function urlMatches(storedUrl, deleteUrl) {
      // 精确匹配
      if (storedUrl === deleteUrl) return true;
      // 宽松匹配：文件名一致即可
      const storedFile = extractFilenameFromUrl(storedUrl);
      const deleteFile = extractFilenameFromUrl(deleteUrl);
      return storedFile && deleteFile && storedFile === deleteFile;
    }

    if (!materialId) {
      // materialId=0 时清空 pendingUploads 并删除对应磁盘文件
      if (urlsToDelete.length > 0) {
        const before = pendingUploads.length;
        urlsToDelete.forEach(u => {
          const idx = pendingUploads.findIndex(p => urlMatches(p.url, u));
          if (idx !== -1) {
            console.log('[DeleteMaterialPic] [traceId=' + traceId + '] 从 pendingUploads 删除: ' + pendingUploads[idx].url);
            pendingUploads.splice(idx, 1);
          } else {
            console.log('[DeleteMaterialPic] [traceId=' + traceId + '] ★ pendingUploads 中未找到匹配: ' + u);
          }
          deleteDiskFileByUrl(u);
        });
        console.log('[DeleteMaterialPic] [traceId=' + traceId + '] materialId=0, 从 pendingUploads 删除 ' + (before - pendingUploads.length) + ' 条');
      } else if (ifAllDelete === 1) {
        // ★ ifAllDelete=1: 全部删除 pendingUploads
        const before = pendingUploads.length;
        pendingUploads.slice().forEach(u => deleteDiskFileByUrl(u.url));
        pendingUploads.splice(0);
        console.log('[DeleteMaterialPic] [traceId=' + traceId + '] materialId=0, ifAllDelete=1, 清空 pendingUploads(' + before + '条) 并删除磁盘文件');
      } else {
        console.log('[DeleteMaterialPic] [traceId=' + traceId + '] materialId=0, 无 urlsToDelete 且 ifAllDelete!=1, 不执行任何操作');
      }
      return res.json(drpOk({ materialId: 0, deleted: true }));
    }
    
    if (urlsToDelete.length > 0) {
      const existing = materialPhotos.get(materialId) || [];
      console.log('[DeleteMaterialPic] [traceId=' + traceId + '] materialId=' + materialId + ' 当前有 ' + existing.length + ' 张, 请求删除 ' + urlsToDelete.length + ' 张');
      const before = existing.length;
      // ★ 使用宽松匹配（文件名一致即匹配）
      const filtered = existing.filter(p => {
        const matched = urlsToDelete.some(u => urlMatches(p.url, u));
        if (matched) console.log('[DeleteMaterialPic] [traceId=' + traceId + ']   匹配删除: ' + p.url);
        return !matched;
      });
      const removed = before - filtered.length;
      console.log('[DeleteMaterialPic] [traceId=' + traceId + '] 匹配删除: ' + removed + ' 张, 剩余: ' + filtered.length + ' 张');
      if (removed === 0) {
        console.log('[DeleteMaterialPic] [traceId=' + traceId + '] ★★★ 警告: 0 张匹配! 可能 URL 格式不一致 ★★★');
        console.log('[DeleteMaterialPic] [traceId=' + traceId + '] 存储的URL: ' + JSON.stringify(existing.map(p => p.url)));
        console.log('[DeleteMaterialPic] [traceId=' + traceId + '] 删除的URL: ' + JSON.stringify(urlsToDelete));
      }
      materialPhotos.set(materialId, filtered);
      saveMaterialPhotosToDisk();
      // ★ 同步删除磁盘文件
      urlsToDelete.forEach(u => deleteDiskFileByUrl(u));
    } else if (ifAllDelete === 1) {
      // ★ ifAllDelete=1: 清空此货品所有照片
      const existing = materialPhotos.get(materialId) || [];
      console.log('[DeleteMaterialPic] [traceId=' + traceId + '] ifAllDelete=1, 清空 materialId=' + materialId + ' 的 ' + existing.length + ' 张照片');
      existing.forEach(p => deleteDiskFileByUrl(p.url));
      materialPhotos.delete(materialId);
      saveMaterialPhotosToDisk();
    } else {
      // 既没有 urlsToDelete 也没有 ifAllDelete=1 → 默认清空所有
      const existing = materialPhotos.get(materialId) || [];
      console.log('[DeleteMaterialPic] [traceId=' + traceId + '] 无 urlsToDelete 且 ifAllDelete!=' + 1 + ', 默认清空 materialId=' + materialId + ' 的 ' + existing.length + ' 张照片');
      existing.forEach(p => deleteDiskFileByUrl(p.url));
      materialPhotos.delete(materialId);
      saveMaterialPhotosToDisk();
    }
    console.log('[DeleteMaterialPic] [traceId=' + traceId + '] ====== 删除完成 ======');
    res.json(drpOk({ materialId, deleted: true }));
  });

  // 17. 电子秤ai-保存货品照片
  mountDrpRoute('/save/material-pic', async (req, res) => {
    const content = drpContent(req);
    const materialId = Number(content.materialId);
    const urls = content.imageUrlList || content.picUrlList || [];
    
    console.log('[SaveMaterialPic] ====== 保存货品照片 ======');
    console.log('[SaveMaterialPic] materialId: ' + materialId + ', urls: ' + urls.length);
    urls.forEach((u, i) => console.log('[SaveMaterialPic]   [' + i + '] ' + u));
    
    // ★ 方案一：materialId 无效直接拒绝
    if (!materialId || materialId <= 0) {
      console.log('[SaveMaterialPic] ★★★ 拒绝保存: materialId=' + materialId + ' (无效)');
      return res.json({ code: 1, msg: '请先在设备上选择货品，再保存货品照片', data: null });
    }

    const existing = materialPhotos.get(materialId) || [];
    const now = new Date().toISOString();
    urls.forEach(url => { if (url) existing.push({ url, createdAt: now }); });
    materialPhotos.set(materialId, existing);
    saveMaterialPhotosToDisk();
    console.log('[SaveMaterialPic] materialId=' + materialId + ' 共 ' + existing.length + ' 张');
    res.json(drpOk({ materialId, saved: true, count: urls.filter(Boolean).length, imageUrlList: urls.filter(Boolean) }));
  });

  // ═══ multer 通用上传配置（支持任意字段名 + 错误捕获）═══
  const uploadAny = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, sysfileUploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `material_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  }).any();

  function withMulterError(mw, handler) {
    return (req, res, next) => {
      mw(req, res, (err) => {
        if (err) {
          console.warn('[SysfileUpload] multer 错误:', err.code, err.message);
          return res.status(400).json({ code: 1, msg: `上传失败: ${err.message || err.code || '未知错误'}`, data: null });
        }
        handler(req, res, next);
      });
    };
  }

  // 17b. 货品照片分页列表（兼容 page 变体）
  mountDrpRoute('/material-pic/page', async (req, res) => {
    const content = drpContent(req);
    const materialId = Number(content.materialId);
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size) || 10;
    const traceId3 = 'picpg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[MaterialPicPage] [traceId=' + traceId3 + '] materialId=' + materialId + ', pendingUploads=' + pendingUploads.length);
    let all = [];
    if (materialId && materialId > 0) {
      all = materialPhotos.get(materialId) || [];
      // ★ 合并 pendingUploads
      if (pendingUploads.length > 0) {
        const drained = pendingUploads.splice(0);
        const merged = [...all];
        drained.forEach(u => {
          if (!merged.some(p => p.url === u.url)) {
            merged.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString() });
          }
        });
        materialPhotos.set(materialId, merged);
        saveMaterialPhotosToDisk();
        all = merged;
        console.log('[MaterialPicPage] [traceId=' + traceId3 + '] 合并 pendingUploads 后共 ' + all.length + ' 张');
      }
      // 文件系统兜底
      // 【修复】只作为返回数据，不再自动关联到 materialPhotos，防止 orphan 文件污染
      if (all.length === 0) {
        try {
          const host2 = req.headers.host || `127.0.0.1:${state.httpPort || port}`;
          const protocol2 = req.headers['x-forwarded-proto'] || 'http';
          const filesInDir = fs.readdirSync(sysfileUploadDir);
          const imgFiles = filesInDir
            .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
            .map(f => {
              const stat = fs.statSync(path.join(sysfileUploadDir, f));
              return { file: f, mtime: stat.mtimeMs };
            })
            .sort((a, b) => b.mtime - a.mtime);
          all = imgFiles.slice(0, 20).map(f => ({
            url: `${protocol2}://${host2}/sysfile-uploads/${f.file}`,
            createdAt: new Date(f.mtime).toISOString(),
          }));
          if (all.length > 0) {
            console.log('[MaterialPicPage] [traceId=' + traceId3 + '] 扫描到 ' + all.length + ' 张 orphan 图片，仅返回，不自动关联 materialId=' + materialId);
          }
        } catch (fsErr) { console.warn('[MaterialPicPage] 扫描失败: ' + fsErr.message); }
      }
    } else {
      // ★★★ materialId=0 时也要合并 pendingUploads
      console.log('[MaterialPicPage] [traceId=' + traceId3 + '] materialId=' + materialId + ' (<=0), 全量查询');
      for (const [, urls] of materialPhotos.entries()) all.push(...urls);
      console.log('[MaterialPicPage] [traceId=' + traceId3 + '] Map中图片数: ' + all.length);
      if (pendingUploads.length > 0) {
        console.log('[MaterialPicPage] [traceId=' + traceId3 + '] ★ materialId=0, 只读 pendingUploads (' + pendingUploads.length + ' 条), 不 drain');
        peekPendingUploads().forEach(u => {
          if (!all.some(p => p.url === u.url)) {
            all.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString() });
          }
        });
        console.log('[MaterialPicPage] [traceId=' + traceId3 + '] ✓ 含队列共 ' + all.length + ' 张');
      }
    }
    const total = all.length;
    const start = (current - 1) * size;
    const pageItems = all.slice(start, start + size);
    const records = pageItems.map((pic, i) => toPicRecord(pic, materialId, start + i));
    res.json(drpOk({ list: records, records, total, current, size, pages: Math.ceil(total / size) || 1 }));
  });

  // 17c. 货品注册图分页列表
  mountDrpRoute('/material/register-pic/page', async (req, res) => {
    const content = drpContent(req);
    const materialId = Number(content.materialId);
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size) || 10;
    const traceId4 = 'regpg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[RegisterPicPage] [traceId=' + traceId4 + '] materialId=' + materialId + ', pendingUploads=' + pendingUploads.length);
    let all = [];
    if (materialId && materialId > 0) {
      all = materialPhotos.get(materialId) || [];
      // ★ 合并 pendingUploads
      if (pendingUploads.length > 0) {
        const drained = pendingUploads.splice(0);
        const merged = [...all];
        drained.forEach(u => {
          if (!merged.some(p => p.url === u.url)) {
            merged.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString() });
          }
        });
        materialPhotos.set(materialId, merged);
        saveMaterialPhotosToDisk();
        all = merged;
        console.log('[RegisterPicPage] [traceId=' + traceId4 + '] 合并 pendingUploads 后共 ' + all.length + ' 张');
      }
      // 文件系统兜底
      // 【修复】只作为返回数据，不再自动关联到 materialPhotos，防止 orphan 文件污染
      if (all.length === 0) {
        try {
          const host2 = req.headers.host || `127.0.0.1:${state.httpPort || port}`;
          const protocol2 = req.headers['x-forwarded-proto'] || 'http';
          const filesInDir = fs.readdirSync(sysfileUploadDir);
          const imgFiles = filesInDir
            .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
            .map(f => {
              const stat = fs.statSync(path.join(sysfileUploadDir, f));
              return { file: f, mtime: stat.mtimeMs };
            })
            .sort((a, b) => b.mtime - a.mtime);
          all = imgFiles.slice(0, 20).map(f => ({
            url: `${protocol2}://${host2}/sysfile-uploads/${f.file}`,
            createdAt: new Date(f.mtime).toISOString(),
          }));
          if (all.length > 0) {
            console.log('[RegisterPicPage] [traceId=' + traceId4 + '] 扫描到 ' + all.length + ' 张 orphan 图片，仅返回，不自动关联 materialId=' + materialId);
          }
        } catch (fsErr) { console.warn('[RegisterPicPage] 扫描失败: ' + fsErr.message); }
      }
    } else {
      // ★★★ materialId=0 时也要合并 pendingUploads
      console.log('[RegisterPicPage] [traceId=' + traceId4 + '] materialId=' + materialId + ' (<=0), 全量查询');
      for (const [, urls] of materialPhotos.entries()) all.push(...urls);
      console.log('[RegisterPicPage] [traceId=' + traceId4 + '] Map中图片数: ' + all.length);
      if (pendingUploads.length > 0) {
        console.log('[RegisterPicPage] [traceId=' + traceId4 + '] ★ materialId=0, 只读 pendingUploads (' + pendingUploads.length + ' 条), 不 drain');
        peekPendingUploads().forEach(u => {
          if (!all.some(p => p.url === u.url)) {
            all.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString() });
          }
        });
        console.log('[RegisterPicPage] [traceId=' + traceId4 + '] ✓ 含队列共 ' + all.length + ' 张');
      }
    }
    const total = all.length;
    const start = (current - 1) * size;
    const pageItems = all.slice(start, start + size);
    const records = pageItems.map((pic, i) => toPicRecord(pic, materialId, start + i));
    res.json(drpOk({ list: records, records, total, current, size, pages: Math.ceil(total / size) || 1 }));
  });

  // 18. 交换密钥
  mountDrpRoute('/key/exchange', (req, res) => {
    res.json(drpOk({
      key: 'mock-key-' + Date.now(),
      timestamp: Date.now(),
    }));
  });

  // 19. 获取 AI 模型
  mountDrpRoute('/ai/model', (req, res) => {
    res.json(drpOk({
      modelVersion: 'v1.0.0',
      modelUrl: '',
      modelSize: 0,
    }));
  });

  // 20. 单位列表（电子秤验货入库必需）
  mountDrpRoute('/unit/all', (req, res) => {
    res.json(drpOk([
      { unitId: 1, unitName: 'kg', rate: 1000, unitDesc: '千克', conversionRate: 1000, decimalPlaces: 3, ifDefault: 1 },
      { unitId: 2, unitName: 'g', rate: 1, unitDesc: '克', conversionRate: 1, decimalPlaces: 0, ifDefault: 2 },
      { unitId: 3, unitName: '斤', rate: 500, unitDesc: '斤', conversionRate: 500, decimalPlaces: 2, ifDefault: 2 },
      { unitId: 4, unitName: '公斤', rate: 1000, unitDesc: '公斤', conversionRate: 1000, decimalPlaces: 3, ifDefault: 2 },
    ]));
  });

  mountDrpRoute('/list/unit', (req, res) => {
    res.json(drpOk({
      list: [
        { unitId: 1, unitName: 'kg', rate: 1000, unitDesc: '千克', conversionRate: 1000, decimalPlaces: 3, ifDefault: 1 },
        { unitId: 2, unitName: 'g', rate: 1, unitDesc: '克', conversionRate: 1, decimalPlaces: 0, ifDefault: 2 },
        { unitId: 3, unitName: '斤', rate: 500, unitDesc: '斤', conversionRate: 500, decimalPlaces: 2, ifDefault: 2 },
        { unitId: 4, unitName: '公斤', rate: 1000, unitDesc: '公斤', conversionRate: 1000, decimalPlaces: 3, ifDefault: 2 },
      ],
      total: 4,
    }));
  });

  mountDrpRoute('/unit/list', (req, res) => {
    res.json(drpOk({
      records: [
        { unitId: 1, unitName: 'kg', rate: 1000, unitDesc: '千克', conversionRate: 1000, decimalPlaces: 3, ifDefault: 1 },
        { unitId: 2, unitName: 'g', rate: 1, unitDesc: '克', conversionRate: 1, decimalPlaces: 0, ifDefault: 2 },
      ],
      total: 2,
      current: 1,
      size: 10,
      pages: 1,
    }));
  });

  mountDrpRoute('/unit/page', (req, res) => {
    res.json(drpOk({
      records: [
        { unitId: 1, unitName: 'kg', rate: 1000, unitDesc: '千克', conversionRate: 1000, decimalPlaces: 3, ifDefault: 1 },
        { unitId: 2, unitName: 'g', rate: 1, unitDesc: '克', conversionRate: 1, decimalPlaces: 0, ifDefault: 2 },
      ],
      total: 2,
      current: 1,
      size: 10,
      pages: 1,
    }));
  });

  // 21. 仓库列表
  mountDrpRoute('/warehouse/all', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    scaleInboundLog('warehouse-all', traceId, '→REQ', { path: req.originalUrl, areaIdList: content.areaIdList });
    const areaIdList = content.areaIdList || [];
    let warehouses = [];
    // ★ 从 SQLite warehouses 表读取真实数据
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, code, name, address, is_active FROM warehouses WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          warehouses = rows.map(r => ({
            warehouseId: r.id, warehouseName: r.name, warehouseNum: r.code || ('CK' + String(r.id).padStart(3, '0')),
            areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1,
            address: r.address || '', manager: '', phone: '',
          }));
          scaleInboundLog('warehouse-all', traceId, 'DB', 'warehouses 表返回 ' + warehouses.length + ' 个仓库');
        }
      } catch (e) { console.warn('[Warehouse] SQLite 查询失败: ' + e.message); }
    }
    // 兜底：表为空时返回默认仓库
    if (warehouses.length === 0) {
      warehouses = [
        { warehouseId: 1, warehouseName: '默认仓库', warehouseNum: 'CK001', areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1, address: '', manager: '', phone: '' },
      ];
      // ★ 自动写入默认仓库到 SQLite
      if (dbQuery) {
        try {
          dbQuery('INSERT OR IGNORE INTO warehouses (id, code, name, is_active, created_at) VALUES (?, ?, ?, ?, ?)',
            [1, 'CK001', '默认仓库', 1, new Date().toISOString()]);
        } catch (e) {}
      }
    }
    // 如果传了 areaIdList，只返回匹配的仓库
    let list = warehouses;
    if (Array.isArray(areaIdList) && areaIdList.length > 0) {
      list = warehouses.filter(w => areaIdList.includes(w.areaId));
    }
    res.json(drpOk(list));
  });

  // 21b. 电子秤V3-仓库列表（新APK，返回空数组兜底）
  mountDrpRoute('/warehouse/all-Android', (req, res) => {
    const traceId = 'whandr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[WarehouseAndroid] [traceId=' + traceId + '] ====== V3仓库列表 ======');
    console.log('[WarehouseAndroid] [traceId=' + traceId + '] 路径: ' + req.originalUrl);
    let warehouses = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, code, name, address, is_active FROM warehouses WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          warehouses = rows.map(r => ({
            warehouseId: r.id, warehouseName: r.name, warehouseNum: r.code || ('CK' + String(r.id).padStart(3, '0')),
            areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1,
            address: r.address || '', manager: '', phone: '',
          }));
        }
      } catch (e) { console.warn('[WarehouseAndroid] 查询失败: ' + e.message); }
    }
    if (warehouses.length === 0) {
      warehouses = [
        { warehouseId: 1, warehouseName: '默认仓库', warehouseNum: 'CK001', areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1, address: '', manager: '', phone: '' },
      ];
      if (dbQuery) {
        try { dbQuery('INSERT OR IGNORE INTO warehouses (id, code, name, is_active, created_at) VALUES (?, ?, ?, ?, ?)', [1, 'CK001', '默认仓库', 1, new Date().toISOString()]); } catch (e) {}
      }
    }
    res.json(drpOk(warehouses));
  });

  // 21c. V3-多单位配置
  mountDrpRoute('/get/if-more-unit', (req, res) => {
    const traceId = 'ifmu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[IfMoreUnit] [traceId=' + traceId + '] ====== 多单位配置 ======');
    console.log('[IfMoreUnit] [traceId=' + traceId + '] 路径: ' + req.originalUrl);
    res.json(drpOk({ ifMoreUnit: false }));
  });

  // 21d. V3-向量特征上传（★ 核心接口: 6张照片拍完后批量提交 materialId + URL）
  mountDrpRoute('/material-vector/upload', async (req, res) => {
    const content = drpContent(req);
    const traceId = 'vecup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[VectorUpload] [traceId=' + traceId + '] ====== V3向量特征上传 ======');
    console.log('[VectorUpload] [traceId=' + traceId + '] 路径: ' + req.originalUrl);
    console.log('[VectorUpload] [traceId=' + traceId + '] RAW BODY: ' + JSON.stringify(req.body || {}).substring(0, 2000));
    console.log('[VectorUpload] [traceId=' + traceId + '] Content所有字段: ' + JSON.stringify(Object.keys(content)));
    for (const [k, v] of Object.entries(content)) {
      console.log('[VectorUpload] [traceId=' + traceId + ']   content.' + k + ' = ' + (typeof v === 'object' ? JSON.stringify(v).substring(0, 500) : String(v).substring(0, 500)));
    }

    const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';

    // ★★★ V3 APK 修复：新版本把 materialId 和 imageUrlList 包在 content.vectors 数组里
    //   vectors: [{ materialId: 1, vectorPicList: [{ imageUrl: "http://..." }] }]
    //   而不是 content.materialId + content.imageUrlList（旧格式）
    const vectors = content.vectors || [];
    let materialId = Number(content.materialId || content.material_id || 0);
    let imageUrlList = content.imageUrlList || content.picUrlList || content.pictureList || [];

    // ★ 从 vectors 数组中提取 materialId 和 imageUrlList
    if ((!materialId || materialId <= 0) && vectors.length > 0) {
      const v0 = vectors[0];
      materialId = Number(v0.materialId || v0.material_id || 0);
      console.log('[VectorUpload] [traceId=' + traceId + '] ★ 从 vectors[0] 提取 materialId=' + materialId);
    }
    if (imageUrlList.length === 0 && vectors.length > 0) {
      for (const vec of vectors) {
        const picList = vec.vectorPicList || vec.imageList || vec.picList || [];
        for (const pic of picList) {
          const url = pic.imageUrl || pic.url || pic.picUrl || '';
          if (url) imageUrlList.push(url);
        }
      }
      console.log('[VectorUpload] [traceId=' + traceId + '] ★ 从 vectors 提取 ' + imageUrlList.length + ' 个图片URL');
    }

    // ★ 如果 materialId 还是 0，尝试从设备→货品映射补全
    if ((!materialId || materialId <= 0) && clientIP) {
      const mapRecord = deviceMaterialMap.get(clientIP);
      if (mapRecord && mapRecord.expireAt > Date.now()) {
        materialId = mapRecord.materialId;
        console.log('[VectorUpload] [traceId=' + traceId + '] ★ 从设备映射补全 materialId=' + materialId + ' (IP=' + clientIP + ')');
      }
    }

    // ★ 记录设备→货品映射（覆盖之前 page/vector-material 的默认映射）
    if (materialId > 0 && clientIP) {
      deviceMaterialMap.set(clientIP, { materialId, expireAt: Date.now() + 10 * 60 * 1000 });
      console.log('[VectorUpload] [traceId=' + traceId + '] ★ 记录设备映射(刷新): ' + clientIP + ' → materialId=' + materialId + ' (10分钟有效)');
    }

    // ★ 合并 pendingUploads 到此 materialId
    if (materialId > 0 && pendingUploads.length > 0) {
      console.log('[VectorUpload] [traceId=' + traceId + '] ★ 合并 pendingUploads(' + pendingUploads.length + '条) → materialId=' + materialId);
      // ★ 按设备IP精准消费，只合并本设备上传的
      if (clientIP) {
        const consumed = [];
        const remaining = [];
        for (const p of pendingUploads) {
          if (p.deviceIp === clientIP) consumed.push(p);
          else remaining.push(p);
        }
        if (consumed.length > 0) {
          const existing = materialPhotos.get(materialId) || [];
          consumed.forEach(p => {
            if (!existing.some(e => e.url === p.url)) {
              existing.push({ url: p.url, createdAt: p.createdAt || new Date().toISOString() });
            }
          });
          materialPhotos.set(materialId, existing);
          saveMaterialPhotosToDisk();
          console.log('[VectorUpload] [traceId=' + traceId + '] ✓ 按IP合并 ' + consumed.length + ' 张到 materialId=' + materialId + ', 共 ' + existing.length + ' 张');
        }
        pendingUploads.splice(0, pendingUploads.length, ...remaining);
      } else {
        mergePendingUploadsToMaterial(materialId);
      }
    }

    // ★ 保存 URL 列表到 materialPhotos
    const validUrls = imageUrlList.filter(Boolean);
    if (materialId > 0 && validUrls.length > 0) {
      const existing = materialPhotos.get(materialId) || [];
      const now = new Date().toISOString();
      validUrls.forEach(url => {
        if (!existing.some(p => p.url === url)) {
          existing.push({ url, createdAt: now });
        }
      });
      materialPhotos.set(materialId, existing);
      saveMaterialPhotosToDisk();
      console.log('[VectorUpload] [traceId=' + traceId + '] ✓ 已存储 materialId=' + materialId + ' 共 ' + existing.length + ' 张');
    } else if (materialId > 0 && validUrls.length === 0) {
      // 没有新的URL但materialId有效 → 仅刷新映射和合并pendingUploads
      console.log('[VectorUpload] [traceId=' + traceId + '] materialId=' + materialId + ' 无新URL，已合并pendingUploads');
    } else {
      // materialId=0 也没有URL → 至少记录日志
      console.log('[VectorUpload] [traceId=' + traceId + '] ★★★ materialId=0 且无URL，vectors=' + vectors.length + ', pendingUploads=' + pendingUploads.length);
    }

    console.log('[VectorUpload] [traceId=' + traceId + '] 返回成功: materialId=' + materialId + ', urls=' + validUrls.length);
    res.json(drpOk({ materialId, uploadedCount: validUrls.length, imageUrlList: validUrls }));
  });

  // 21e. V3-向量特征增量同步
  mountDrpRoute('/material-vector/sync', async (req, res) => {
    const content = drpContent(req);
    const traceId = 'vecsync_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[VectorSync] [traceId=' + traceId + '] ====== V3向量增量同步 ======');
    console.log('[VectorSync] [traceId=' + traceId + '] 路径: ' + req.originalUrl);
    console.log('[VectorSync] [traceId=' + traceId + '] Content: ' + JSON.stringify(Object.keys(content)));
    res.json(drpOk({ records: [], total: 0, current: 1, size: 10, pages: 0 }));
  });

  // 21f. V3-拉取缺失向量
  mountDrpRoute('/material-vector/init/missing/vector/pull', async (req, res) => {
    const traceId = 'vecpull_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[VectorPull] [traceId=' + traceId + '] ====== V3拉取缺失向量 ======');
    console.log('[VectorPull] [traceId=' + traceId + '] 路径: ' + req.originalUrl);
    res.json(drpOk({ records: [], total: 0 }));
  });

  mountDrpRoute('/list/warehouse', (req, res) => {
    const content = drpContent(req);
    const areaIdList = content.areaIdList || [];
    let warehouses = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, code, name, address, is_active FROM warehouses WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          warehouses = rows.map(r => ({
            warehouseId: r.id, warehouseName: r.name, warehouseNum: r.code || ('CK' + String(r.id).padStart(3, '0')),
            areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1,
            address: r.address || '', manager: '', phone: '',
          }));
        }
      } catch (e) { console.warn('[list/warehouse] 查询失败:', e.message); }
    }
    if (warehouses.length === 0) {
      warehouses = [{ warehouseId: 1, warehouseName: '默认仓库', warehouseNum: 'CK001', areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1, address: '', manager: '', phone: '' }];
    }
    let list = warehouses;
    if (Array.isArray(areaIdList) && areaIdList.length > 0) {
      list = warehouses.filter(w => areaIdList.includes(w.areaId));
    }
    res.json(drpOk({ list, total: list.length }));
  });

  mountDrpRoute('/warehouse/list', (req, res) => {
    const content = drpContent(req);
    const areaIdList = content.areaIdList || [];
    let warehouses = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, code, name, address, is_active FROM warehouses WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          warehouses = rows.map(r => ({
            warehouseId: r.id, warehouseName: r.name, warehouseNum: r.code || ('CK' + String(r.id).padStart(3, '0')),
            areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1,
            address: r.address || '', manager: '', phone: '',
          }));
        }
      } catch (e) { console.warn('[warehouse/list] 查询失败:', e.message); }
    }
    if (warehouses.length === 0) {
      warehouses = [{ warehouseId: 1, warehouseName: '默认仓库', warehouseNum: 'CK001', areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1, address: '', manager: '', phone: '' }];
    }
    let list = warehouses;
    if (Array.isArray(areaIdList) && areaIdList.length > 0) {
      list = warehouses.filter(w => areaIdList.includes(w.areaId));
    }
    res.json(drpOk({ records: list, total: list.length, current: 1, size: 10, pages: 1 }));
  });

  mountDrpRoute('/warehouse/page', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    scaleInboundLog('warehouse-page', traceId, '→REQ', { path: req.originalUrl });
    const areaIdList = content.areaIdList || [];
    let warehouses = [];
    // ★ 从 SQLite warehouses 表读取真实数据
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, code, name, address, is_active FROM warehouses WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          warehouses = rows.map(r => ({
            warehouseId: r.id, warehouseName: r.name, warehouseNum: r.code || ('CK' + String(r.id).padStart(3, '0')),
            address: r.address || '',
          }));
          scaleInboundLog('warehouse-page', traceId, 'DB', 'warehouses 返回 ' + warehouses.length + ' 个');
        }
      } catch (e) { scaleInboundLog('warehouse-page', traceId, 'ERROR', e.message); }
    }
    if (warehouses.length === 0) {
      warehouses = [{ warehouseId: 1, warehouseName: '默认仓库', warehouseNum: 'CK001', address: '' }];
      scaleInboundLog('warehouse-page', traceId, 'FALLBACK', '使用默认仓库');
    }
    scaleInboundLog('warehouse-page', traceId, '←RES', { count: warehouses.length });
    res.json(drpOk(warehouses));
  });

  // 21g. 仓库分页查询（common/warehouse-page — 腾云电子秤V3标准接口）
  mountDrpRoute('/common/warehouse-page', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('common-warehouse-page', traceId, '→REQ', { path: req.originalUrl, machineSn: req.headers['machine-sn'] || '' });
    const content = drpContent(req);
    const areaIdList = content.areaIdList || [];
    let warehouses = [];
    // ★ 从 SQLite warehouses 表读取真实数据
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, code, name, address, is_active FROM warehouses WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          warehouses = rows.map(r => ({
            warehouseId: r.id, warehouseName: r.name, warehouseNum: r.code || ('CK' + String(r.id).padStart(3, '0')),
            address: r.address || '',
          }));
          scaleInboundLog('common-warehouse-page', traceId, 'DB', 'warehouses 表返回 ' + warehouses.length + ' 个仓库');
        }
      } catch (e) { scaleInboundLog('common-warehouse-page', traceId, 'ERROR', e.message); }
    }
    // 兜底：表为空时返回默认仓库
    if (warehouses.length === 0) {
      warehouses = [{ warehouseId: 1, warehouseName: '默认仓库', warehouseNum: 'CK001', address: '' }];
      scaleInboundLog('common-warehouse-page', traceId, 'FALLBACK', '使用默认仓库');
      if (dbQuery) {
        try { dbQuery('INSERT OR IGNORE INTO warehouses (id, code, name, is_active, created_at) VALUES (?, ?, ?, ?, ?)', [1, 'CK001', '默认仓库', 1, new Date().toISOString()]); } catch (e) {}
      }
    }
    // 按 areaIdList 过滤
    let list = warehouses;
    if (Array.isArray(areaIdList) && areaIdList.length > 0) {
      list = warehouses.filter(w => w.areaId !== undefined && areaIdList.includes(w.areaId));
    }
    scaleInboundLog('common-warehouse-page', traceId, '←RES', { count: list.length });
    res.json(drpOk(list));
  });

  // 22. 供应商列表
  mountDrpRoute('/supplier/all', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('supplier-all', traceId, '→REQ', { path: req.originalUrl, machineSn: req.headers['machine-sn'] || '' });
    let suppliers = [];
    // ★ 从 SQLite suppliers 表读取真实数据
    if (dbQuery) {
      try {
        // ★ 先尝试从系统供应商表（如有数据）同步到本地 suppliers 表
        const existingSupplierRows = dbQuery('SELECT id, name, code, contact, phone, address, score, is_active FROM suppliers WHERE is_active = 1', []);
        if (existingSupplierRows && existingSupplierRows.length > 0) {
          suppliers = existingSupplierRows.map(r => ({
            supplierId: r.id, supplierName: r.name, supplierCode: r.code || ('GYS' + String(r.id).padStart(3, '0')),
            contact: r.contact || '', phone: r.phone || '', address: r.address || '',
            supplierScore: r.score || 5.0, status: 1,
          }));
          scaleInboundLog('supplier-all', traceId, 'DB', 'suppliers 表返回 ' + suppliers.length + ' 个供应商');
        }
      } catch (e) { console.warn('[Supplier] SQLite 查询失败: ' + e.message); }
    }
    // 兜底：表为空时返回默认供应商
    if (suppliers.length === 0) {
      suppliers = [
        { supplierId: 1, supplierName: '默认供应商', supplierCode: 'GYS001', contact: '', phone: '', status: 1 },
      ];
      // ★ 自动写入默认供应商到 SQLite
      if (dbQuery) {
        try {
          dbQuery('INSERT OR IGNORE INTO suppliers (id, name, code, is_active, created_at) VALUES (?, ?, ?, ?, ?)',
            [1, '默认供应商', 'GYS001', 1, new Date().toISOString()]);
        } catch (e) {}
      }
    }
    res.json(drpOk(suppliers));
  });

  mountDrpRoute('/list/supplier', (req, res) => {
    let supplierList = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, name, code, contact, phone, address, score FROM suppliers WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          supplierList = rows.map(r => ({
            supplierId: r.id, supplierName: r.name, supplierCode: r.code || ('GYS' + String(r.id).padStart(3, '0')),
            contact: r.contact || '', phone: r.phone || '', address: r.address || '',
            supplierScore: r.score || 5.0, status: 1,
          }));
        }
      } catch (e) {}
    }
    if (supplierList.length === 0) {
      supplierList = [{ supplierId: 1, supplierName: '默认供应商', supplierCode: 'GYS001', contact: '', phone: '', status: 1 }];
    }
    res.json(drpOk({ list: supplierList, total: supplierList.length }));
  });

  mountDrpRoute('/supplier/list', (req, res) => {
    let supplierList = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, name, code, contact, phone, address, score FROM suppliers WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          supplierList = rows.map(r => ({
            supplierId: r.id, supplierName: r.name, supplierCode: r.code || ('GYS' + String(r.id).padStart(3, '0')),
            contact: r.contact || '', phone: r.phone || '', address: r.address || '',
            supplierScore: r.score || 5.0, status: 1,
          }));
        }
      } catch (e) {}
    }
    if (supplierList.length === 0) {
      supplierList = [{ supplierId: 1, supplierName: '默认供应商', supplierCode: 'GYS001', contact: '', phone: '', status: 1 }];
    }
    res.json(drpOk({ records: supplierList, total: supplierList.length, current: 1, size: 10, pages: 1 }));
  });

  mountDrpRoute('/supplier/page', (req, res) => {
    let supplierList = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, name, code, contact, phone, address, score FROM suppliers WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          supplierList = rows.map(r => ({
            supplierId: r.id, supplierName: r.name, supplierCode: r.code || ('GYS' + String(r.id).padStart(3, '0')),
            contact: r.contact || '', phone: r.phone || '', address: r.address || '',
            supplierScore: r.score || 5.0, status: 1,
          }));
        }
      } catch (e) {}
    }
    if (supplierList.length === 0) {
      supplierList = [{ supplierId: 1, supplierName: '默认供应商', supplierCode: 'GYS001', contact: '', phone: '', status: 1 }];
    }
    res.json(drpOk({ records: supplierList, total: supplierList.length, current: 1, size: 10, pages: 1 }));
  });

  // 23. 区域列表
  mountDrpRoute('/area/all', (req, res) => {
    res.json(drpOk([
      { areaId: 1, areaName: '默认区域', areaNum: 'QY001', status: 1 },
    ]));
  });

  mountDrpRoute('/list/area', (req, res) => {
    res.json(drpOk({
      list: [
        { areaId: 1, areaName: '默认区域', areaNum: 'QY001', status: 1 },
      ],
      total: 1,
    }));
  });

  mountDrpRoute('/area/list', (req, res) => {
    res.json(drpOk({
      records: [
        { areaId: 1, areaName: '默认区域', areaNum: 'QY001', status: 1 },
      ],
      total: 1,
      current: 1,
      size: 10,
      pages: 1,
    }));
  });

  mountDrpRoute('/area/page', (req, res) => {
    res.json(drpOk({
      records: [
        { areaId: 1, areaName: '默认区域', areaNum: 'QY001', status: 1 },
      ],
      total: 1,
      current: 1,
      size: 10,
      pages: 1,
    }));
  });

  // 24. 电子秤-入库单接口（验货入库时可能用到）
  mountDrpRoute('/inbound/order/list', (req, res) => {
    res.json(drpOk({ records: [], total: 0, current: 1, size: 10, pages: 0 }));
  });

  mountDrpRoute('/inbound/order/page', (req, res) => {
    res.json(drpOk({ records: [], total: 0, current: 1, size: 10, pages: 0 }));
  });

  // 25. 电子秤-验收记录接口
  mountDrpRoute('/acceptance/record/list', (req, res) => {
    res.json(drpOk({ records: [], total: 0, current: 1, size: 10, pages: 0 }));
  });

  // 26. 出库单接口
  mountDrpRoute('/outbound/order/list', (req, res) => {
    res.json(drpOk({ records: [], total: 0, current: 1, size: 10, pages: 0 }));
  });

  // 27. 单据明细接口
  mountDrpRoute('/order/detail/list', (req, res) => {
    res.json(drpOk({ records: [], total: 0, current: 1, size: 10, pages: 0 }));
  });

  // 28. 电子秤-初始化配置（单位/仓库等汇总）
  mountDrpRoute('/init/base-config', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    scaleInboundLog('init-base-config', traceId, '→REQ', { path: req.originalUrl, contentKeys: Object.keys(content), machineSn: req.headers['machine-sn'] || '' });
    const areaIdList = content.areaIdList || [];
    let warehouses = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, code, name, address, is_active FROM warehouses WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          warehouses = rows.map(r => ({
            warehouseId: r.id, warehouseName: r.name, warehouseNum: r.code || ('CK' + String(r.id).padStart(3, '0')),
            areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1,
            address: r.address || '', manager: '', phone: '',
          }));
        }
      } catch (e) {}
    }
    if (warehouses.length === 0) {
      warehouses = [
        { warehouseId: 1, warehouseName: '默认仓库', warehouseNum: 'CK001', areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1, address: '', manager: '', phone: '' },
      ];
    }
    let warehouseList = warehouses;
    if (Array.isArray(areaIdList) && areaIdList.length > 0) {
      const areaIds = areaIdList.map(Number);
      warehouseList = warehouses.filter(w => areaIds.includes(Number(w.areaId)));
    }
    // ★ 从数据库读取供应商列表
    let supplierList = [{ supplierId: 1, supplierName: '默认供应商', supplierCode: 'GYS001', status: 1, contact: '', phone: '' }];
    if (dbQuery) {
      try {
        const supRows = dbQuery('SELECT id, name, code, contact, phone FROM suppliers WHERE is_active = 1', []);
        if (supRows && supRows.length > 0) {
          supplierList = supRows.map(r => ({
            supplierId: r.id, supplierName: r.name, supplierCode: r.code || ('GYS' + String(r.id).padStart(3, '0')),
            status: 1, contact: r.contact || '', phone: r.phone || '',
          }));
        }
      } catch (e) {}
    }
    const resp = {
      unitList: [
        { unitId: 1, unitName: 'kg', unitDesc: '千克', conversionRate: 1000, decimalPlaces: 3, ifDefault: 1 },
        { unitId: 2, unitName: 'g', unitDesc: '克', conversionRate: 1, decimalPlaces: 0, ifDefault: 2 },
      ],
      warehouseList,
      supplierList,
      areaList: [
        { areaId: 1, areaName: '默认区域', areaNum: 'QY001', status: 1 },
      ],
    };
    scaleInboundLog('init-base-config', traceId, '←RES', { warehouses: warehouseList.length, suppliers: supplierList.length });
    res.json(drpOk(resp));
  });

  // 29. 电子秤-批量获取基础参数（有些版本用这个接口一次性拉）
  mountDrpRoute('/base/param/list', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    scaleInboundLog('base-param-list', traceId, '→REQ', { path: req.originalUrl, contentKeys: Object.keys(content) });
    const areaIdList = content.areaIdList || [];
    let warehouses = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, code, name, address, is_active FROM warehouses WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          warehouses = rows.map(r => ({
            warehouseId: r.id, warehouseName: r.name, warehouseNum: r.code || ('CK' + String(r.id).padStart(3, '0')),
            areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1,
            address: r.address || '', manager: '', phone: '',
          }));
        }
      } catch (e) {}
    }
    if (warehouses.length === 0) {
      warehouses = [
        { warehouseId: 1, warehouseName: '默认仓库', warehouseNum: 'CK001', areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1, address: '', manager: '', phone: '' },
      ];
    }
    let warehouseList = warehouses;
    if (Array.isArray(areaIdList) && areaIdList.length > 0) {
      const areaIds = areaIdList.map(Number);
      warehouseList = warehouses.filter(w => areaIds.includes(Number(w.areaId)));
    }
    // ★ 从数据库读取供应商列表
    let supplierList = [{ supplierId: 1, supplierName: '默认供应商' }];
    if (dbQuery) {
      try {
        const supRows = dbQuery('SELECT id, name FROM suppliers WHERE is_active = 1', []);
        if (supRows && supRows.length > 0) {
          supplierList = supRows.map(r => ({ supplierId: r.id, supplierName: r.name }));
        }
      } catch (e) {}
    }
    scaleInboundLog('base-param-list', traceId, '←RES', { warehouses: warehouseList.length, suppliers: supplierList.length });
    res.json(drpOk({
      unitList: [
        { unitId: 1, unitName: 'kg', unitDesc: '千克', conversionRate: 1000 },
        { unitId: 2, unitName: 'g', unitDesc: '克', conversionRate: 1 },
      ],
      warehouseList,
      supplierList,
    }));
  });

  // 30. 电子秤-获取所有类别（含层级）
  // ─── 领料人列表（验货入库时设备调用）───
  mountDrpRoute('/fetch/user/list', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('fetch-user-list', traceId, '→REQ', { path: req.originalUrl, machineSn: req.headers['machine-sn'] || '' });
    let users = [];
    if (dbQuery) {
      try {
        const rows = dbQuery(
          'SELECT work_no, login_name, name, phone, role FROM scale_operators WHERE is_active = 1 ORDER BY id',
          []
        );
        if (rows && rows.length > 0) {
          users = rows.map(r => ({
            userId: r.work_no,
            userCode: r.work_no,
            loginName: r.login_name || r.work_no,
            userName: r.name || r.work_no,
            phone: r.phone || '',
            role: r.role || 'operator',
          }));
          scaleInboundLog('fetch-user-list', traceId, 'DB', 'scale_operators 返回 ' + users.length + ' 个操作员');
        }
      } catch (e) {
        scaleInboundLog('fetch-user-list', traceId, 'ERROR', e.message);
      }
    }
    // 兜底：没有数据时返回默认用户
    if (users.length === 0) {
      users = [
        { userId: '001', userCode: '001', loginName: '001', userName: '管理员', phone: '', role: 'admin' },
        { userId: '002', userCode: '002', loginName: '002', userName: '操作员', phone: '', role: 'operator' },
      ];
      scaleInboundLog('fetch-user-list', traceId, 'FALLBACK', '使用默认用户列表');
    }
    scaleInboundLog('fetch-user-list', traceId, '←RES', { count: users.length });
    res.json(drpOk(users));
  });

  // ─── 分类树接口（设备「按货品入库」必需）───
  function buildCategoryTree(db) {
    if (!db) {
      return [
        { categoryId: 1, categoryName: '蔬菜', parentId: 0, level: 1, children: [], sortOrder: 0 },
        { categoryId: 2, categoryName: '水果', parentId: 0, level: 1, children: [], sortOrder: 1 },
        { categoryId: 3, categoryName: '肉类', parentId: 0, level: 1, children: [], sortOrder: 2 },
      ];
    }
    try {
      const rows = db(
        'SELECT id, name, parent_id, level, sort_order FROM product_categories ORDER BY level, sort_order, id',
        []
      );
      if (!rows || rows.length === 0) {
        return [{ categoryId: 1, categoryName: '默认分类', parentId: 0, level: 1, children: [], sortOrder: 0 }];
      }
      const map = {};
      rows.forEach(r => {
        map[r.id] = {
          categoryId: r.id,
          categoryName: r.name || '',
          parentId: r.parent_id || 0,
          level: r.level || 1,
          sortOrder: r.sort_order || 0,
          children: [],
        };
      });
      const tree = [];
      Object.values(map).forEach(node => {
        if (!node.parentId || node.parentId === 0) {
          tree.push(node);
        } else if (map[node.parentId]) {
          map[node.parentId].children.push(node);
        } else {
          tree.push(node); // parent不存在时放根级
        }
      });
      return tree;
    } catch (e) {
      console.warn('[CategoryTree] 构建失败: ' + e.message);
      return [{ categoryId: 1, categoryName: '默认分类', parentId: 0, level: 1, children: [], sortOrder: 0 }];
    }
  }

  mountDrpRoute('/category/tree', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('category-tree', traceId, '→REQ', { path: req.originalUrl, machineSn: req.headers['machine-sn'] || '' });
    const tree = buildMaterialCategoryTree();
    scaleInboundLog('category-tree', traceId, '←RES', { rootCount: tree.length });
    res.json(drpOk({ list: tree, tree, total: tree.length }));
  });

  // ★ 补充：设备实际调用的是 /category-tree（带连字符），返回直接数组匹配API文档
  mountDrpRoute('/category-tree', (req, res) => {
    const traceId = scaleInboundTrace();
    const content = drpContent(req);
    const categoryType = Number(content.categoryType || 1);
    const categoryTypes = content.categoryTypes || [categoryType];
    const tenantId = Number(content.tenantId || 0);
    scaleInboundLog('category-tree-alt', traceId, '→REQ', { path: req.originalUrl, categoryType, categoryTypes, tenantId, machineSn: req.headers['machine-sn'] || '' });
    const tree = buildApiCategoryTree();
    scaleInboundLog('category-tree-alt', traceId, '←RES', { rootCount: tree.length, names: tree.map(c => c.categoryName).join(', ') });
    // ★ API文档规定返回直接数组，不包裹 code/msg/data
    res.json(tree);
  });

  mountDrpRoute('/category/tree/Android', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('category-tree-android', traceId, '→REQ', { path: req.originalUrl });
    const tree = buildMaterialCategoryTree();
    scaleInboundLog('category-tree-android', traceId, '←RES', { rootCount: tree.length });
    res.json(drpOk({ list: tree, tree, total: tree.length }));
  });

  mountDrpRoute('/category/list', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('category-list', traceId, '→REQ', { path: req.originalUrl });
    const categories = getMaterialCategoryList();
    scaleInboundLog('category-list', traceId, '←RES', { count: categories.length, names: categories.map(c => c.categoryName).join(', ') });
    res.json(drpOk({ list: categories, total: categories.length }));
  });

  mountDrpRoute('/category/page', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('category-page', traceId, '→REQ', { path: req.originalUrl });
    const categories = getMaterialCategoryList();
    scaleInboundLog('category-page', traceId, '←RES', { count: categories.length });
    res.json(drpOk({ records: categories, total: categories.length, current: 1, size: 10, pages: 1 }));
  });



  // 30c. 领料单详情分类列表（API文档规范：返回直接数组）
  mountDrpRoute('/fetch-material/detail/category/list', (req, res) => {
    const content = drpContent(req);
    const fetchMaterialId = content.fetchMaterialId || '';
    const traceId = scaleInboundTrace();
    scaleInboundLog('fetch-mat-cat-list', traceId, '→REQ', { fetchMaterialId, machineSn: req.headers['machine-sn'] || '' });

    let categories = [];
    if (dbQuery) {
      try {
        const rows = dbQuery(
          "SELECT DISTINCT category_name FROM inbound_materials WHERE is_active = 1 AND category_name IS NOT NULL AND category_name != '' ORDER BY category_name",
          []
        );
        if (rows && rows.length > 0) {
          categories = rows.map((r, i) => ({
            categoryId: i + 1,
            categoryName: r.category_name,
            parentId: 0,
            categoryType: 1,
          }));
          scaleInboundLog('fetch-mat-cat-list', traceId, 'DB', 'inbound_materials 返回 ' + categories.length + ' 个分类');
        }
      } catch (e) {
        scaleInboundLog('fetch-mat-cat-list', traceId, 'ERROR', e.message);
      }
    }
    if (categories.length === 0) {
      categories = [
        { categoryId: 1, categoryName: '蔬菜', parentId: 0, categoryType: 1 },
        { categoryId: 2, categoryName: '水果', parentId: 0, categoryType: 1 },
        { categoryId: 3, categoryName: '肉类', parentId: 0, categoryType: 1 },
        { categoryId: 4, categoryName: '水产', parentId: 0, categoryType: 1 },
        { categoryId: 5, categoryName: '粮油', parentId: 0, categoryType: 1 },
        { categoryId: 6, categoryName: '调味品', parentId: 0, categoryType: 1 },
        { categoryId: 7, categoryName: '干货', parentId: 0, categoryType: 1 },
        { categoryId: 8, categoryName: '冻品', parentId: 0, categoryType: 1 },
      ];
      scaleInboundLog('fetch-mat-cat-list', traceId, 'FALLBACK', '使用默认分类');
    }
    scaleInboundLog('fetch-mat-cat-list', traceId, '←RES', { count: categories.length });
    // ★ API文档规定 data 直接是数组
    res.json({ code: 10000, msg: '成功', data: categories });
  });

  // 30d. 电子秤v5-查询领料单明细（分页）
  mountDrpRoute('/fetch-material/detail/get', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    const fetchMaterialId = content.fetchMaterialId || '';
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const ifAll = size === -1;
    const pageSize = ifAll ? 99999 : Math.max(1, size || 10);
    scaleInboundLog('fetch-mat-detail-get', traceId, '→REQ', { fetchMaterialId, current, pageSize, fetchStatus: content.fetchStatus, materialType: content.materialType });

    // ★ 确保表存在
    if (dbQuery) {
      try {
        dbQuery('CREATE TABLE IF NOT EXISTS fetch_material_detail ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'fetch_material_id TEXT NOT NULL, '
          + 'material_id INTEGER NOT NULL, '
          + 'inventory_id INTEGER DEFAULT 0, '
          + 'material_name TEXT, '
          + 'material_code TEXT, '
          + 'category_id INTEGER DEFAULT 0, '
          + 'category_name TEXT, '
          + 'unit_id INTEGER DEFAULT 1, '
          + 'unit_name TEXT DEFAULT \'kg\', '
          + 'inventory_num REAL DEFAULT 0, '
          + 'fetch_num REAL DEFAULT 0, '
          + 'out_count REAL DEFAULT 0, '
          + 'residue_num REAL DEFAULT 0, '
          + 'remark TEXT, '
          + 'crby TEXT, '
          + 'crtime TEXT, '
          + 'bar_code TEXT, '
          + 'sales_mode INTEGER DEFAULT 2, '
          + 'created_at TEXT'
          + ')', []);
      } catch (e) { scaleInboundLog('fetch-mat-detail-get', traceId, 'TABLE-ERROR', e.message); }
    }

    let records = [];
    let total = 0;
    if (dbQuery && fetchMaterialId) {
      try {
        // 构建查询条件
        let sql = 'SELECT * FROM fetch_material_detail WHERE fetch_material_id = ?';
        const params = [fetchMaterialId];
        const fetchStatus = Number(content.fetchStatus || 0);
        const materialType = Number(content.materialType || 0);
        if (fetchStatus > 0) { sql += ' AND fetch_status = ?'; params.push(fetchStatus); }
        if (materialType > 0) { sql += ' AND material_type = ?'; params.push(materialType); }
        // count
        const cnt = dbQuery('SELECT COUNT(*) as total FROM fetch_material_detail WHERE fetch_material_id = ?', [fetchMaterialId]);
        total = (cnt && cnt.length > 0) ? (cnt[0].total || 0) : 0;
        // page
        sql += ' ORDER BY id LIMIT ? OFFSET ?';
        params.push(pageSize, (current - 1) * pageSize);
        const rows = dbQuery(sql, params);
        if (rows && rows.length > 0) {
          records = rows.map(r => ({
            detailId: r.id,
            fetchMaterialId: r.fetch_material_id || '',
            materialId: r.material_id || 0,
            inventoryId: r.inventory_id || 0,
            materialName: r.material_name || '',
            materialCode: r.material_code || '',
            categoryId: r.category_id || 0,
            categoryName: r.category_name || '',
            unitId: r.unit_id || 1,
            unitName: r.unit_name || 'kg',
            inventoryNum: r.inventory_num || 0,
            fetchNum: r.fetch_num || 0,
            remark: r.remark || '',
            crby: r.crby || '',
            crtime: r.crtime || '',
            outCount: r.out_count || 0,
            residueNum: r.residue_num || 0,
            barCode: r.bar_code || '',
            salesMode: r.sales_mode || 2,
          }));
        }
        scaleInboundLog('fetch-mat-detail-get', traceId, 'DB', 'fetch_material_detail 返回 ' + total + ' 条, 当前页 ' + records.length);
      } catch (e) {
        scaleInboundLog('fetch-mat-detail-get', traceId, 'ERROR', e.message);
      }
    }
    // 兜底：表为空时从 inbound_materials 动态生成
    if (records.length === 0 && dbQuery && fetchMaterialId) {
      try {
        const matRows = dbQuery('SELECT * FROM inbound_materials WHERE is_active = 1 LIMIT 20', []);
        if (matRows && matRows.length > 0) {
          records = matRows.map((r, i) => ({
            detailId: (current - 1) * pageSize + i + 1,
            fetchMaterialId,
            materialId: r.id,
            inventoryId: 0,
            materialName: r.name || '',
            materialCode: String(r.id),
            categoryId: 0,
            categoryName: r.category_name || '',
            unitId: 1,
            unitName: r.unit || 'kg',
            inventoryNum: 999,
            fetchNum: 0,
            remark: '',
            crby: '',
            crtime: '',
            outCount: 0,
            residueNum: 999,
            barCode: r.bar_code || '',
            salesMode: 2,
          }));
          total = matRows.length;
          scaleInboundLog('fetch-mat-detail-get', traceId, 'FALLBACK', '从 inbound_materials 兜底生成 ' + records.length + ' 条');
        }
      } catch (e) { /* ignore */ }
    }
    scaleInboundLog('fetch-mat-detail-get', traceId, '←RES', { total, returned: records.length });
    res.json(drpOk({ records, total, size: pageSize, current, searchCount: true, orderBy: '' }));
  });

  // 30e. 电子秤-分页查询领料单列表
  mountDrpRoute('/fetch-material/page', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const ifAll = size === -1;
    const pageSize = ifAll ? 99999 : Math.max(1, size || 10);
    const fetchStatus = Number(content.fetchStatus || 0);
    const commitStatus = Number(content.commitStatus || 0);
    const approveStatus = Number(content.approveStatus || 0);
    const fetchMaterialId = (content.fetchMaterialId || '').trim();
    const fetchUserId = Number(content.fetchUserId || 0);
    scaleInboundLog('fetch-mat-page', traceId, '→REQ', { fetchMaterialId, fetchStatus, commitStatus, approveStatus, fetchUserId, current, pageSize });

    // ★ 确保表存在
    if (dbQuery) {
      try {
        dbQuery('CREATE TABLE IF NOT EXISTS fetch_material ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'fetch_material_id TEXT UNIQUE NOT NULL, '
          + 'title TEXT, '
          + 'commit_status INTEGER DEFAULT 1, '
          + 'fetch_status INTEGER DEFAULT 2, '
          + 'area_id INTEGER DEFAULT 0, '
          + 'area_name TEXT, '
          + 'canteen_id INTEGER DEFAULT 0, '
          + 'canteen_name TEXT, '
          + 'stall_id INTEGER DEFAULT 0, '
          + 'stall_name TEXT, '
          + 'total_num REAL DEFAULT 0, '
          + 'warehouse_id INTEGER DEFAULT 0, '
          + 'warehouse_name TEXT, '
          + 'fetch_material_time TEXT, '
          + 'fetch_user_id INTEGER DEFAULT 0, '
          + 'fetch_user_name TEXT, '
          + 'approve_status INTEGER DEFAULT 1, '
          + 'crby TEXT, '
          + 'crtime TEXT, '
          + 'created_at TEXT'
          + ')', []);
        dbQuery('CREATE TABLE IF NOT EXISTS fetch_material_detail ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'fetch_material_id TEXT NOT NULL, '
          + 'material_id INTEGER NOT NULL, '
          + 'inventory_id INTEGER DEFAULT 0, '
          + 'material_name TEXT, '
          + 'material_code TEXT, '
          + 'category_id INTEGER DEFAULT 0, '
          + 'category_name TEXT, '
          + 'unit_id INTEGER DEFAULT 1, '
          + 'unit_name TEXT DEFAULT \'kg\', '
          + 'inventory_num REAL DEFAULT 0, '
          + 'fetch_num REAL DEFAULT 0, '
          + 'out_count REAL DEFAULT 0, '
          + 'residue_num REAL DEFAULT 0, '
          + 'remark TEXT, '
          + 'crby TEXT, '
          + 'crtime TEXT, '
          + 'bar_code TEXT, '
          + 'sales_mode INTEGER DEFAULT 2, '
          + 'created_at TEXT'
          + ')', []);
      } catch (e) { scaleInboundLog('fetch-mat-page', traceId, 'TABLE-ERROR', e.message); }
    }

    let records = [];
    let total = 0;
    if (dbQuery) {
      try {
        let sql = 'SELECT * FROM fetch_material';
        let countSql = 'SELECT COUNT(*) as total FROM fetch_material';
        const conditions = [];
        const params = [];
        if (fetchMaterialId) { conditions.push('(fetch_material_id LIKE ? OR title LIKE ?)'); params.push('%' + fetchMaterialId + '%', '%' + fetchMaterialId + '%'); }
        if (fetchStatus > 0) { conditions.push('fetch_status = ?'); params.push(fetchStatus); }
        if (commitStatus > 0) { conditions.push('commit_status = ?'); params.push(commitStatus); }
        if (approveStatus > 0) { conditions.push('approve_status = ?'); params.push(approveStatus); }
        if (fetchUserId > 0) { conditions.push('fetch_user_id = ?'); params.push(fetchUserId); }
        if (conditions.length > 0) {
          const where = ' WHERE ' + conditions.join(' AND ');
          sql += where;
          countSql += where;
        }
        // count
        const cnt = dbQuery(countSql, [...params]);
        total = (cnt && cnt.length > 0) ? (cnt[0].total || 0) : 0;
        // page
        sql += ' ORDER BY crtime DESC LIMIT ? OFFSET ?';
        const pageParams = [...params, pageSize, (current - 1) * pageSize];
        const rows = dbQuery(sql, pageParams);
        if (rows && rows.length > 0) {
          records = rows.map(r => ({
            fetchMaterialId: r.fetch_material_id || '',
            title: r.title || '',
            commitStatus: r.commit_status || 1,
            fetchStatus: r.fetch_status || 2,
            areaId: r.area_id || 0,
            areaName: r.area_name || '',
            canteenId: r.canteen_id || 0,
            canteenName: r.canteen_name || '',
            stallId: r.stall_id || 0,
            stallName: r.stall_name || '',
            totalNum: r.total_num || 0,
            warehouseId: r.warehouse_id || 0,
            warehouseName: r.warehouse_name || '',
            fetchMaterialTime: r.fetch_material_time || '',
            fetchUserId: r.fetch_user_id || 0,
            fetchUserName: r.fetch_user_name || '',
            approveStatus: r.approve_status || 1,
            crby: r.crby || '',
            crtime: r.crtime || '',
          }));
        }
        scaleInboundLog('fetch-mat-page', traceId, 'DB', 'fetch_material 返回 ' + total + ' 条, 当前页 ' + records.length);
      } catch (e) {
        scaleInboundLog('fetch-mat-page', traceId, 'ERROR', e.message);
      }
    }
    // 兜底：表为空时返回空列表
    if (records.length === 0 && total === 0) {
      scaleInboundLog('fetch-mat-page', traceId, 'FALLBACK', 'fetch_material 表为空，返回空列表');
    }
    scaleInboundLog('fetch-mat-page', traceId, '←RES', { total, returned: records.length });
    res.json(drpOk({ records, total, size: pageSize, current, searchCount: true, orderBy: '' }));
  });

  // 31. 电子秤-货品图片文件上传（/admin/api/1/sysfile/upload 代理）
  // 电子秤货品采集拍照后走这个路径上传，之前没注册导致走到 SPA fallback 返回 HTML
  function handleSysfileUpload(req, res) {
    // upload.any() 把文件放在 req.files 数组里，取第一个
    const file = req.file || (req.files && req.files[0]);
    const body = req.body || {};

    // ★★★ 深度排查 materialId：从 body、body.content、query、headers 的各字段尝试解析
    // 注意：uploadKey 的值通常是字符串标识（如"material"），不能当 materialId 用
    const now2 = Date.now();
    const traceId = 'pic_' + now2 + '_' + Math.random().toString(36).slice(2, 6);
    const rawCandidates = [
      body.materialId, body.material_id, body.materialIds, body.matId, body.materialCode,
      req.query.materialId, req.query.material_id, req.query.matId,
      req.headers['x-material-id'], req.headers['material-id'], req.headers['x-materialid'],
      req.headers['x-mat-id'], req.headers['mat-id']
    ];
    // 电子秤常把参数嵌套在 content 字段里（JSON 字符串）
    if (body.content) {
      try {
        const content = typeof body.content === 'string' ? JSON.parse(body.content) : body.content;
        if (content && typeof content === 'object') {
          rawCandidates.push(content.materialId, content.material_id, content.materialIds, content.matId, content.materialCode);
        }
      } catch (e) { /* ignore */ }
    }
    let parsedMaterialId = 0;
    let parsedMaterialIdSource = '';
    for (const raw of rawCandidates) {
      if (raw == null) continue;
      const s = String(raw).trim();
      if (!s || s === 'material' || s === 'file' || s === 'upload' || s === 'image') continue;
      const n = Number(s);
      if (!isNaN(n) && n > 0) { parsedMaterialId = n; parsedMaterialIdSource = s; break; }
    }
    let materialId = parsedMaterialId;

    // ★★★ 优先从设备→货品映射补全 materialId（必须在解析之后、所有判断之前）
    // 设备先 list/material-pic 查询货品照片 → 记录 IP→materialId
    // 然后拍照调 sysfile/upload → 此时从映射补全 materialId
    // ⚠️ 不能等 parsedMaterialId 判断完再查映射，因为设备可能在 multipart form 里无意带了个
    //    非零 materialId（固件默认值、缓存残留等），导致直接跳过映射查询
    const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const mapRecord = deviceMaterialMap.get(clientIP);
    const mappedMaterialId = (mapRecord && mapRecord.expireAt > Date.now()) ? mapRecord.materialId : null;

    if (mappedMaterialId && (!materialId || materialId <= 0)) {
      // 设备没带 materialId → 从映射补全
      materialId = mappedMaterialId;
    } else if (mappedMaterialId && materialId > 0) {
      // 设备带了 materialId → 保留设备值，但记日志方便排查
      console.log('[SysfileUpload] ★ 设备映射: ' + clientIP + ' → ' + mappedMaterialId + ', 但请求已携带 materialId=' + materialId + ' — 保留请求值');
    } else if (!mappedMaterialId && (!materialId || materialId <= 0)) {
      // 无映射且无materialId → pendingUploads
    }

    // ★ 详细日志：sysfile 上传请求（带 traceId）
    console.log('[SysfileUpload] ====== 收到上传请求 ======');
    console.log('[SysfileUpload] [traceId=' + traceId + '] 请求路径: ' + req.originalUrl);
    console.log('[SysfileUpload] [traceId=' + traceId + '] Content-Type: ' + (req.headers['content-type'] || '(none)'));
    console.log('[SysfileUpload] [traceId=' + traceId + '] 客户端IP: ' + (req.ip || req.headers['x-forwarded-for'] || 'unknown'));
    console.log('[SysfileUpload] [traceId=' + traceId + '] body keys: ' + JSON.stringify(Object.keys(body)));
    for (const [k, v] of Object.entries(body)) {
      const vs = typeof v === 'string' ? (v.length > 200 ? v.substring(0, 200) + '...(truncated ' + v.length + ')' : v) : JSON.stringify(v).substring(0, 200);
      console.log('[SysfileUpload] [traceId=' + traceId + ']   body.' + k + ' = ' + vs);
    }
    console.log('[SysfileUpload] [traceId=' + traceId + '] query: ' + JSON.stringify(req.query || {}));
    console.log('[SysfileUpload] [traceId=' + traceId + '] req.files: ' + (req.files ? JSON.stringify(req.files.map(f => ({ fieldname: f.fieldname, originalname: f.originalname, size: f.size }))) : 'undefined'));
    console.log('[SysfileUpload] [traceId=' + traceId + '] ★ materialId: parsed="' + parsedMaterialIdSource + '"=' + parsedMaterialId + ', mapped=' + (mappedMaterialId || 'null') + ', final=' + materialId);
    console.log('[SysfileUpload] [traceId=' + traceId + '] 有文件? ' + !!file + ', 请求方式: ' + req.method);
    console.log('[SysfileUpload] [traceId=' + traceId + '] materialPhotos状态: ' + materialPhotos.size + ' 个货品, pendingUploads: ' + pendingUploads.length + ' 条');

    // ★★★ 全局重量提取：拍照时设备可能在form里带当前秤重
    try {
      const weightFields = ['weight', 'currentWeight', 'realWeight', 'netWeight', 'weighValue', 'scaleWeight', 'actualWeight', 'deliveryNum', 'num', 'quantity'];
      const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
      const machineSn = (req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();
      for (const wf of weightFields) {
        if (body[wf] !== undefined && body[wf] !== null && body[wf] !== '') {
          const w = Number(body[wf]);
          if (!isNaN(w) && w > 0) {
            if (clientIP) cacheDeviceWeight(clientIP, w, 'kg', 'sysfile-upload-' + wf);
            if (machineSn) cacheDeviceWeight(machineSn, w, 'kg', 'sysfile-upload-' + wf);
            console.log('[SysfileUpload] [traceId=' + traceId + '] ★ 从form字段提取重量: ' + wf + '=' + w + 'kg');
            break;
          }
        }
      }
    } catch (e) { /* ignore */ }

    if (!file) {
      console.log('[SysfileUpload] [traceId=' + traceId + '] ★★★ 上传失败: 未收到文件！ ★★★');
      console.log('[SysfileUpload] [traceId=' + traceId + '] req.files类型: ' + typeof req.files + ', 值: ' + JSON.stringify(req.files));
      console.log('[SysfileUpload] [traceId=' + traceId + '] req.file: ' + JSON.stringify(req.file));
      console.log('[SysfileUpload] [traceId=' + traceId + '] Content-Type: ' + (req.headers['content-type'] || '(none)'));
      console.log('[SysfileUpload] [traceId=' + traceId + '] Content-Length: ' + (req.headers['content-length'] || '(none)'));
      console.log('[SysfileUpload] [traceId=' + traceId + '] body keys: ' + JSON.stringify(Object.keys(body)));
      console.log('[SysfileUpload] [traceId=' + traceId + '] deviceMaterialMap 条目数: ' + deviceMaterialMap.size + ', pendingUploads: ' + pendingUploads.length);
      return res.json({ code: 1, msg: '上传失败：未收到文件', data: null });
    }

    console.log('[SysfileUpload] [traceId=' + traceId + '] 文件: originalname=' + file.originalname + ', size=' + file.size + ', filename=' + file.filename + ', mimetype=' + file.mimetype);

    if (!materialId || materialId <= 0) {
      // ★ 无 materialId → 放入 pendingUploads 待关联队列
      // 真实设备 API 流程：sysfile/upload 只存文件（materialId 可选），
      // 后续调 upload/material/register-pic 才关联货品。
      // 设备端可能跳过 register-pic，服务端通过 pendingUploads 兜底：
      // 下次按 materialId 查询照片时自动从队列合并。
      const host = req.headers.host || `127.0.0.1:${state.httpPort || port}`;
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const url = `${protocol}://${host}/sysfile-uploads/${file.filename}`;
      console.log('[SysfileUpload] [traceId=' + traceId + '] ★ materialId 未识别, 放入待关联队列, url=' + url + ', deviceIp=' + clientIP);
      pendingUploads.push({ url, createdAt: new Date().toISOString(), filename: file.filename, traceId, deviceIp: clientIP });
      if (pendingUploads.length > MAX_PENDING) pendingUploads.splice(0, pendingUploads.length - MAX_PENDING);
      const relativeUrl = 'sysfile-uploads/' + file.filename;
      return res.json({ code: 10000, msg: '成功', data: { bucketName: 'sysfile-uploads', fileNameUrl: url, url: relativeUrl } });
    }

    const host = req.headers.host || `127.0.0.1:${state.httpPort || port}`;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${host}/sysfile-uploads/${file.filename}`;
    console.log('[SysfileUpload] [traceId=' + traceId + '] 图片URL: ' + url);

    // 有 materialId → 直接关联
    const existing = materialPhotos.get(materialId) || [];
    existing.push({ url, createdAt: new Date().toISOString(), traceId, filename: file.filename });
    materialPhotos.set(materialId, existing);
    saveMaterialPhotosToDisk();
    // ★ 刷新设备映射 TTL，确保后续拍照仍然能找到 materialId
    refreshDeviceMaterialMap(clientIP);
    console.log('[SysfileUpload] [traceId=' + traceId + '] ✓ 已关联到 materialId=' + materialId + ', 当前图片数: ' + existing.length + ', 映射已刷新');

    // ★★★ 自动注册为货品注册图
    // 设备拍照走 sysfile/upload 上传后，服务端自动将图片注册为货品注册图，
    // 与 upload/material/register-pic 共享同一份 materialPhotos 存储，
    // 后续 list/material/register-pic 查询可直接返回此图片
    console.log('[SysfileUpload] [traceId=' + traceId + '] ★ 自动注册货品注册图: materialId=' + materialId + ', url=' + url);

    // ★★★ 电子秤/IoT 设备期望的返回格式：code:10000 为成功，同时额外返回 code:0 兼容旧版设备
    console.log('[SysfileUpload] [traceId=' + traceId + '] ====== 上传成功，返回 code:10000 ======');
    const relativeUrl = 'sysfile-uploads/' + file.filename;
    res.json({ code: 10000, msg: '成功', data: { bucketName: 'sysfile-uploads', fileNameUrl: url, url: relativeUrl } });
  }

  app.post('/admin/api/1/sysfile/upload', withMulterError(uploadAny, handleSysfileUpload));
  app.post('/admin/api/1/sysfile/upload/:action', withMulterError(uploadAny, handleSysfileUpload));
  app.post('/admin/api/v1/sysfile/upload', withMulterError(uploadAny, handleSysfileUpload));
  app.post('/admin/api/v1/sysfile/upload/:action', withMulterError(uploadAny, handleSysfileUpload));
  // 通配兜底 /admin/api/:version/sysfile/upload 匹配 /admin/api/1/ 和 /admin/api/v1/
  app.post('/admin/api/:version/sysfile/upload', withMulterError(uploadAny, handleSysfileUpload));
  app.post('/api/v1/sysfile/upload', withMulterError(uploadAny, handleSysfileUpload));

  // 32. 电子秤-按货品ID查询照片（腾云变体）
  mountDrpRoute('/material/pic/list', async (req, res) => {
    const content = drpContent(req);
    const materialId = Number(content.materialId || content.material_id || 0);
    const traceId2 = 'picl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    console.log('[MaterialPicList] [traceId=' + traceId2 + '] ====== 按货品ID查询照片(腾云变体) ======');
    console.log('[MaterialPicList] [traceId=' + traceId2 + '] materialId: ' + materialId);
    console.log('[MaterialPicList] [traceId=' + traceId2 + '] materialPhotos Map 共 ' + materialPhotos.size + ' 个货品, pendingUploads: ' + pendingUploads.length);

    // ★ 记录设备→货品映射
    if (materialId && materialId > 0) {
      const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
      deviceMaterialMap.set(clientIP, { materialId, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
      console.log('[MaterialPicList] [traceId=' + traceId2 + '] ★ 记录设备映射: ' + clientIP + ' → materialId=' + materialId);
    }

    let list = [];
    if (materialId && materialId > 0) {
      list = materialPhotos.get(materialId) || [];
      console.log('[MaterialPicList] [traceId=' + traceId2 + '] Map中找到 ' + list.length + ' 张');

      // ★ 无论 Map 里有没有图，都把 pendingUploads 合并进来
      if (pendingUploads.length > 0) {
        console.log('[MaterialPicList] [traceId=' + traceId2 + '] ★ pendingUploads 有 ' + pendingUploads.length + ' 条 → 合并到 materialId=' + materialId);
        const drained = pendingUploads.splice(0);
        const merged = [...list];
        drained.forEach(u => {
          if (!merged.some(p => p.url === u.url)) {
            merged.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString(), traceId: u.traceId });
          }
        });
        materialPhotos.set(materialId, merged);
        saveMaterialPhotosToDisk();
        list = merged;
        console.log('[MaterialPicList] [traceId=' + traceId2 + '] ✓ 合并后共 ' + list.length + ' 张');
      }

      // 还是空 → 文件系统兜底
      if (list.length === 0) {
        console.log('[MaterialPicList] [traceId=' + traceId2 + '] 文件系统扫描...');
        try {
          const host2 = req.headers.host || `127.0.0.1:${state.httpPort || port}`;
          const protocol2 = req.headers['x-forwarded-proto'] || 'http';
          const filesInDir = fs.readdirSync(sysfileUploadDir);
          const imgFiles = filesInDir
            .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
            .map(f => {
              const stat = fs.statSync(path.join(sysfileUploadDir, f));
              return { file: f, mtime: stat.mtimeMs };
            })
            .sort((a, b) => b.mtime - a.mtime);
          list = imgFiles.slice(0, 20).map(f => ({
            url: `${protocol2}://${host2}/sysfile-uploads/${f.file}`,
            createdAt: new Date(f.mtime).toISOString(),
          }));
          if (list.length > 0) {
            // 【修复】只返回，不自动写入 materialPhotos Map，防止 orphan 文件污染
            console.log('[MaterialPicList] [traceId=' + traceId2 + '] 扫描到 ' + list.length + ' 张 orphan 图片，仅返回，不自动关联 materialId=' + materialId);
          }
        } catch (fsErr) {
          console.warn('[MaterialPicList] [traceId=' + traceId2 + '] 扫描失败: ' + fsErr.message);
        }
      }
    } else {
      // ★★★ materialId=0 时也要合并 pendingUploads（之前漏掉了！）
      console.log('[MaterialPicList] [traceId=' + traceId2 + '] 全量查询, materialId=' + materialId + ' (<=0)');
      for (const [, urls] of materialPhotos.entries()) {
        list.push(...urls);
      }
      console.log('[MaterialPicList] [traceId=' + traceId2 + '] Map 中图片数: ' + list.length);
      if (pendingUploads.length > 0) {
        console.log('[MaterialPicList] [traceId=' + traceId2 + '] ★ materialId=0, 只读 pendingUploads (' + pendingUploads.length + ' 条), 不 drain');
        peekPendingUploads().forEach(u => {
          if (!list.some(p => p.url === u.url)) {
            list.push({ url: u.url, createdAt: u.createdAt || new Date().toISOString(), traceId: u.traceId });
          }
        });
        console.log('[MaterialPicList] [traceId=' + traceId2 + '] ✓ 含队列共 ' + list.length + ' 张');
      }
    }
    // ★ data 同时返回 list 与 records，每条记录携带全部字段名变体
    const resp2 = buildPicListResponse(list, materialId);
    console.log('[MaterialPicList] [traceId=' + traceId2 + '] 响应结构: ' + JSON.stringify(resp2).substring(0, 600));
    res.json(resp2);
  });

  // 33. 电子秤ai-保存菜品图片并批量注册接口 ★ 严防崩溃
  // POST /api/v4/device/drp/ai/batch-save-pic-then-register
  // operation: NEW(新建) / APPEND(添加) / REMOVE(移除特征)
  // ★ API 响应格式需严格按照文档：genFlag / modelType / modelName / labelPath / indexPath / md5 / createTime / lastModifyVersion / requestId
  mountDrpRoute('/ai/batch-save-pic-then-register', async (req, res) => {
    try {
    const content = drpContent(req);
    const requestId = content.requestId || String(Date.now());
    const operation = (content.operation || 'NEW').toUpperCase();
    const materialList = content.materialList || [];
    
    // ★ 详细日志：批量保存图片
    console.log('[BatchSavePic] ====== 批量保存图片请求 ======');
    console.log('[BatchSavePic] requestId: ' + requestId + ', operation: ' + operation);
    console.log('[BatchSavePic] materialList 数量: ' + materialList.length);
    if (materialList.length > 0) {
      materialList.forEach((mat, i) => {
        console.log('[BatchSavePic]   [' + i + '] materialId=' + mat.materialId + ', name=' + mat.materialName + ', images=' + (mat.imageList || []).length);
        if (mat.imageList && mat.imageList.length > 0) {
          mat.imageList.forEach((url, j) => console.log('[BatchSavePic]     image[' + j + ']: ' + url));
        }
      });
    }
    
    // 处理图片存储
    for (const mat of materialList) {
      const materialId = Number(mat.materialId);
      const materialName = mat.materialName || '';
      const imageList = mat.imageList || [];
      if (materialId) {
        const existing = materialPhotos.get(materialId) || [];
        const now = new Date().toISOString();
        console.log('[BatchSavePic] 处理 materialId=' + materialId + ', 现有图片: ' + existing.length + ' 张, 操作: ' + operation);
        if (operation === 'REMOVE') {
          const beforeCount = existing.length;
          const filtered = existing.filter(p => !imageList.includes(p.url));
          materialPhotos.set(materialId, filtered);
          saveMaterialPhotosToDisk();
          console.log('[BatchSavePic] REMOVE: ' + beforeCount + ' -> ' + filtered.length + ' 张');
        } else {
          // NEW 或 APPEND：追加图片
          const addedCount = imageList.filter(Boolean).length;
          imageList.forEach(url => { if (url) existing.push({ url, createdAt: now }); });
          materialPhotos.set(materialId, existing);
          saveMaterialPhotosToDisk();
          console.log('[BatchSavePic] ' + operation + ': 追加 ' + addedCount + ' 张, 总计 ' + existing.length + ' 张');
        }
      } else {
        // materialId=0 → 放入 pendingUploads 待关联队列
        const now = new Date().toISOString();
        imageList.forEach(url => {
          if (url) pendingUploads.push({ url, createdAt: now, filename: 'batch-pic-' + Date.now() });
        });
        if (pendingUploads.length > MAX_PENDING) pendingUploads.splice(0, pendingUploads.length - MAX_PENDING);
        console.log('[BatchSavePic] materialId=0, 放入 pendingUploads (队列长度: ' + pendingUploads.length + ')');
      }
    }
    
    console.log('[BatchSavePic] materialPhotos 当前状态:');
    for (const [id, pics] of materialPhotos.entries()) {
      console.log('[BatchSavePic]   materialId=' + id + ' -> ' + pics.length + ' 张');
    }
    
    // ★★★ 按 API 文档返回模型注册结果格式
    // genFlag: 1=成功, 2=失败, 3=进行中
    // modelType: 1=菜品, 2=原料
    const now = new Date().toISOString();
    const modelVersion = Date.now();
    const modelData = {
      modelType: '2',                                       // 原料
      version: modelVersion,                                // 模型版本号
      modelName: 'material-model-v' + modelVersion,         // 模型名称
      labelPath: '',                                         // 标签路径（本地无真实模型）
      indexPath: '',                                         // 模型路径（本地无真实模型）
      md5: crypto.createHash('md5').update(requestId + '_' + modelVersion).digest('hex'),  // 文件签名
      createTime: now,                                      // 创建时间
      genFlag: 1,                                           // 1=创建成功
      lastModifyVersion: modelVersion,                      // 业务修改版本号
      requestId,                                            // 请求Id
    };
    
    // ★ 回传重量（拍照注册完成后屏幕不能就此归零）
    const clientIPBatch = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const reqWBatch = extractAndCacheWeightFromRequest(req);
    const resolvedWBatch = resolveFinalWeight(reqWBatch, clientIPBatch);

    const respModelData = { ...modelData };
    if (resolvedWBatch) { respModelData.weight = resolvedWBatch.weight; respModelData.weightUnit = resolvedWBatch.unit; }

    console.log('[BatchSavePic] ====== 返回 genFlag=1 (成功) ======');
    res.json(drpOk(respModelData));
    } catch (err) {
      console.error('[BatchSavePic] ★★★ 崩溃捕获: ' + err.message);
      console.error('[BatchSavePic] 堆栈: ' + (err.stack || ''));
      if (!res.headersSent) {
        const now = new Date().toISOString();
        const modelVersion = Date.now();
        res.json(drpOk({
          modelType: '2', version: modelVersion,
          modelName: 'material-model-v' + modelVersion,
          labelPath: '', indexPath: '',
          md5: crypto.createHash('md5').update('fallback_' + modelVersion).digest('hex'),
          createTime: now, genFlag: 1, lastModifyVersion: modelVersion,
          requestId: String(Date.now()),
        }));
      }
    }
  });

  // ★ V3 向量识别链路 — 直接路径（不带 drp 前缀），兼容新 APK 路由
  app.all('/tengyun-api/api/v4/device/page/vector-material', async (req, res) => {
    const content = drpContent(req);
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const ifAll = size === -1;
    const pageSize = ifAll ? 99999 : Math.max(1, size || 15);
    const keyword = (content.materialInfo || content.materialName || '').trim();
    const traceId = 'vecmat2_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] ====== V3向量识别(直接路径) ======');
    console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] 路径: ' + req.originalUrl);
    const products = await getInboundMaterialList(keyword);
    const total = products.length;
    const start = (current - 1) * pageSize;
    const slice = products.slice(start, start + pageSize);

    // ★ 记录设备→货品映射 + 合并 pendingUploads（只在明确知道目标时才操作）
    const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const vectContentMatId2 = Number(content.materialId || content.material_id || 0);
    if (vectContentMatId2 > 0 && clientIP) {
      const matId = vectContentMatId2;
      deviceMaterialMap.set(clientIP, { materialId: matId, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
      console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] ★ 精确映射(用户选择): ' + clientIP + ' → materialId=' + matId);
    } else if (slice.length === 1 && clientIP) {
      const matId = slice[0].materialId || slice[0].id;
      deviceMaterialMap.set(clientIP, { materialId: matId, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
      console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] ★ 单货品映射: ' + clientIP + ' → materialId=' + matId);
    } else if (clientIP && slice.length > 1) {
      // ★ 多货品列表：保留现有映射不删除（同 mountDrpRoute 版本）
      const oldMapping = deviceMaterialMap.get(clientIP);
      if (oldMapping) {
        console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] ★ 保留现有映射: ' + clientIP + ' → materialId=' + oldMapping.materialId + ' (多货品列表，不重置称重状态)');
      }
    }
    // ★ 按设备IP精准消费：只消费该设备上传的照片
    if (pendingUploads.length > 0 && slice.length > 0) {
      const targetMatId = Number(content.materialId || content.material_id || 0);
      if (targetMatId > 0) {
        console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] ★ 消费 pendingUploads(' + pendingUploads.length + '条) → 明确货品 materialId=' + targetMatId);
        if (clientIP) {
          const consumed = [];
          const remaining = [];
          for (const p of pendingUploads) {
            if (p.deviceIp === clientIP) consumed.push(p);
            else remaining.push(p);
          }
          if (consumed.length > 0) {
            const existing = materialPhotos.get(targetMatId) || [];
            consumed.forEach(p => {
              if (!existing.some(e => e.url === p.url)) {
                existing.push({ url: p.url, createdAt: p.createdAt || new Date().toISOString() });
              }
            });
            materialPhotos.set(targetMatId, existing);
            saveMaterialPhotosToDisk();
            console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] ✓ 已关联 ' + consumed.length + ' 张图片(deviceIp=' + clientIP + ')到 materialId=' + targetMatId + ', 共 ' + existing.length + ' 张');
          }
          pendingUploads.splice(0, pendingUploads.length, ...remaining);
        } else {
          mergePendingUploadsToMaterial(targetMatId);
        }
      } else if (slice.length === 1) {
        const firstMatId = slice[0].materialId || slice[0].id;
        console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] ★ 合并 pendingUploads(' + pendingUploads.length + '条) → 唯一货品 materialId=' + firstMatId);
        mergePendingUploadsToMaterial(firstMatId);
      } else {
        console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] ★ 多货品且未明确选择，pendingUploads 不合并');
      }
    }

    const records = slice.map(p => {
      const matId = p.materialId || p.id;
      const picStatus = getMaterialPicStatus(matId);
      // ★ 返回所有已上传的图片URL
      const pics = materialPhotos.get(matId) || [];
      const pictureList = pics.length > 0 ? pics.map(pic => pic.url) : [];
      return {
        materialId: matId,
        materialName: p.materialName || p.name || '',
        materialCode: String(matId),
        brandName: p.brandName || p.brand_name || '',
        spec: p.spec || p.specification || '',
        pictureList,
        imageUrl: picStatus.imageUrl,
        ifRegister: picStatus.hasPic ? 1 : 2,
        ifCollect: picStatus.hasPic ? 1 : 2,
        unitId: 1,
        unitName: p.unitName || p.unit || 'kg',
        unitPrice: p.unitPrice != null ? p.unitPrice : Math.round((Number(p.unit_price) || 0) * 100),
        salesMode: 2,
        materialType: p.materialType || p.material_type || 1,
        categoryId: p.categoryId || 0,
        categoryName: p.categoryName || '',
        barCode: p.barCode || p.bar_code || '',
        supplierId: p.supplierId || p.supplier_id || 0,
      };
    });
    console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] 返回 ' + records.length + '/' + total + ' 条');
    const reqWeight2 = extractAndCacheWeightFromRequest(req);
    const resolvedW2 = resolveFinalWeight(reqWeight2, clientIP);
    console.log('[VectorMaterial-Direct] [traceId=' + traceId + '] 重量: req=' + reqWeight2 + ', final=' + (resolvedW2 ? resolvedW2.weight + resolvedW2.unit : 'null(无可用重量)'));

    const respData2 = { records, total, size: pageSize, current, pages: Math.ceil(total / pageSize) || 1 };
    if (resolvedW2) { respData2.weight = resolvedW2.weight; respData2.weightUnit = resolvedW2.unit; }
    res.json({ code: 10000, msg: '成功', data: respData2 });
  });

  app.all('/tengyun-api/api/v4/device/warehouse/all-Android', (req, res) => {
    console.log('[WarehouseAndroid-Direct] 路径: ' + req.originalUrl);
    let warehouses = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, code, name, address, is_active FROM warehouses WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          warehouses = rows.map(r => ({
            warehouseId: r.id, warehouseName: r.name, warehouseNum: r.code || ('CK' + String(r.id).padStart(3, '0')),
            areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1,
            address: r.address || '', manager: '', phone: '',
          }));
        }
      } catch (e) {}
    }
    if (warehouses.length === 0) {
      warehouses = [
        { warehouseId: 1, warehouseName: '默认仓库', warehouseNum: 'CK001', areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1, address: '', manager: '', phone: '' },
      ];
      if (dbQuery) { try { dbQuery('INSERT OR IGNORE INTO warehouses (id, code, name, is_active, created_at) VALUES (?, ?, ?, ?, ?)', [1, 'CK001', '默认仓库', 1, new Date().toISOString()]); } catch (e) {} }
    }
    res.json(drpOk(warehouses));
  });

  app.all('/api/v4/device/page/vector-material', async (req, res) => {
    const content = drpContent(req);
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const ifAll = size === -1;
    const pageSize = ifAll ? 99999 : Math.max(1, size || 15);
    const keyword = (content.materialInfo || content.materialName || '').trim();
    const products = await getInboundMaterialList(keyword);
    const total = products.length;
    const start = (current - 1) * pageSize;
    const slice = products.slice(start, start + pageSize);
    const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const vectContentMatId3 = Number(content.materialId || content.material_id || 0);
    if (vectContentMatId3 > 0 && clientIP) {
      deviceMaterialMap.set(clientIP, { materialId: vectContentMatId3, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
    } else if (slice.length === 1 && clientIP) {
      const matId = slice[0].materialId || slice[0].id;
      deviceMaterialMap.set(clientIP, { materialId: matId, expireAt: Date.now() + DEVICE_MATERIAL_TTL });
    } else if (clientIP && slice.length > 1) {
      const oldMapping = deviceMaterialMap.get(clientIP);
      if (oldMapping) { console.log('[VectorMaterial-API] ★ 保留现有映射: ' + clientIP + ' → materialId=' + oldMapping.materialId); }
    }
    if (pendingUploads.length > 0 && slice.length > 0) {
      const targetMatId = Number(content.materialId || content.material_id || 0);
      if (targetMatId > 0) {
        if (clientIP) {
          const consumed = []; const remaining = [];
          for (const p of pendingUploads) { if (p.deviceIp === clientIP) consumed.push(p); else remaining.push(p); }
          if (consumed.length > 0) {
            const existing = materialPhotos.get(targetMatId) || [];
            consumed.forEach(p => { if (!existing.some(e => e.url === p.url)) { existing.push({ url: p.url, createdAt: p.createdAt || new Date().toISOString() }); } });
            materialPhotos.set(targetMatId, existing); saveMaterialPhotosToDisk();
          }
          pendingUploads.splice(0, pendingUploads.length, ...remaining);
        } else { mergePendingUploadsToMaterial(targetMatId); }
      } else if (slice.length === 1) { mergePendingUploadsToMaterial(slice[0].materialId || slice[0].id); }
    }
    const records = slice.map(p => {
      const matId = p.materialId || p.id;
      const picStatus = getMaterialPicStatus(matId);
      const pics = materialPhotos.get(matId) || [];
      const pictureList = pics.length > 0 ? pics.map(pic => pic.url) : [];
      return {
        materialId: matId, materialName: p.materialName || p.name || '', materialCode: String(matId),
        brandName: p.brandName || p.brand_name || '', spec: p.spec || p.specification || '',
        pictureList, imageUrl: picStatus.imageUrl, ifRegister: picStatus.hasPic ? 1 : 2, ifCollect: picStatus.hasPic ? 1 : 2,
        unitId: 1, unitName: p.unitName || p.unit || 'kg',
        unitPrice: p.unitPrice != null ? p.unitPrice : Math.round((Number(p.unit_price) || 0) * 100),
        salesMode: 2, materialType: p.materialType || p.material_type || 1,
        categoryId: p.categoryId || 0, categoryName: p.categoryName || '',
        barCode: p.barCode || p.bar_code || '', supplierId: p.supplierId || p.supplier_id || 0,
      };
    });
    const reqWeight3 = extractAndCacheWeightFromRequest(req);
    const resolvedW3 = resolveFinalWeight(reqWeight3, clientIP);
    const respData3 = { records, total, size: pageSize, current, pages: Math.ceil(total / pageSize) || 1 };
    if (resolvedW3) { respData3.weight = resolvedW3.weight; respData3.weightUnit = resolvedW3.unit; }
    res.json({ code: 10000, msg: '成功', data: respData3 });
  });

  app.all('/api/v4/device/warehouse/all-Android', (req, res) => {
    let warehouses = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, code, name, address, is_active FROM warehouses WHERE is_active = 1', []);
        if (rows && rows.length > 0) {
          warehouses = rows.map(r => ({
            warehouseId: r.id, warehouseName: r.name, warehouseNum: r.code || ('CK' + String(r.id).padStart(3, '0')),
            areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1,
            address: r.address || '', manager: '', phone: '',
          }));
        }
      } catch (e) {}
    }
    if (warehouses.length === 0) {
      warehouses = [
        { warehouseId: 1, warehouseName: '默认仓库', warehouseNum: 'CK001', areaId: 1, areaName: '默认区域', status: 1, warehouseType: 1, address: '', manager: '', phone: '' },
      ];
      if (dbQuery) { try { dbQuery('INSERT OR IGNORE INTO warehouses (id, code, name, is_active, created_at) VALUES (?, ?, ?, ?, ?)', [1, 'CK001', '默认仓库', 1, new Date().toISOString()]); } catch (e) {} }
    }
    res.json(drpOk(warehouses));
  });

  console.log('[DRP] 已注册 52 个 DRP 设备 API 路由 + V3向量识别直连路由（在 catch-all 之前）');

  // ★ 补充: 电子秤V3 缺失的 DRP 路由（分类/入库单/系统来源/大分类同步）
  // 这些接口在服务器上没有实现，电子秤调用时返回空数据，导致"获取分类异常"
  app.all('/api/v4/device/drp/category/top-list', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('category-top-list', traceId, '→REQ', { path: req.originalUrl, machineSn: req.headers['machine-sn'] || '' });
    const categories = getMaterialCategoryList();
    scaleInboundLog('category-top-list', traceId, '←RES', { count: categories.length, names: categories.map(c => c.categoryName).join(', ') });
    // ★ 设备期望 data 直接是数组，不是 {list, total}
    res.json({ code: 10000, msg: '成功', data: categories });
  });
  app.all('/tengyun-api/api/v4/device/drp/category/top-list', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('category-top-list-tengyun', traceId, '→REQ', { path: req.originalUrl, machineSn: req.headers['machine-sn'] || '' });
    const categories = getMaterialCategoryList();
    scaleInboundLog('category-top-list-tengyun', traceId, '←RES', { count: categories.length });
    // ★ 设备期望 data 直接是数组，不是 {list, total}
    res.json({ code: 10000, msg: '成功', data: categories });
  });

  function handleIntoPage(req, res, routeLabel) {
    const traceId = scaleInboundTrace();
    scaleInboundLog('into-page' + (routeLabel ? '-' + routeLabel : ''), traceId, '→REQ', { path: req.originalUrl, machineSn: req.headers['machine-sn'] || '' });
    let records = [];
    let total = 0;
    let current2 = 1;
    let size2 = 10;
    try {
      // ★★★ 确保表存在：设备先调 into/page 查询入库单，此时 into_inventory 可能还没创建
      // 之前只在 into/add/commit 写入时才创建表，导致先查询时 no such table
      if (dbQuery) {
        try {
          dbQuery('CREATE TABLE IF NOT EXISTS into_inventory ('
            + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
            + 'into_id TEXT UNIQUE NOT NULL, '
            + 'warehouse_id INTEGER, '
            + 'into_date TEXT, '
            + 'total_amount INTEGER DEFAULT 0, '
            + 'total_num REAL DEFAULT 0, '
            + 'into_type INTEGER DEFAULT 1, '
            + 'status INTEGER DEFAULT 1, '
            + 'supplier_id INTEGER DEFAULT 0, '
            + 'remark TEXT, '
            + 'created_at TEXT, '
            + 'updated_at TEXT'
            + ')', []);
        } catch (e) { /* ignore */ }
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const content = (typeof body.content === 'string' ? JSON.parse(body.content) : (body.content || {}));
      current2 = Number(content.current || 1);
      size2 = Number(content.size) || 10;
      const status = Number(content.status || 0);
      const intoType = Number(content.intoType || 0);
      scaleInboundLog('into-page' + (routeLabel ? '-' + routeLabel : ''), traceId, 'PARAM', { current: current2, size: size2, status, intoType });
      if (dbQuery) {
        let sql = 'SELECT * FROM into_inventory';
        const conditions = [];
        const params = [];
        if (status > 0) { conditions.push('status = ?'); params.push(status); }
        if (intoType > 0) { conditions.push('into_type = ?'); params.push(intoType); }
        if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(size2, (current2 - 1) * size2);
        const rows = dbQuery(sql, params);
        if (rows && rows.length > 0) {
          // ★ 预加载仓库/供应商名称，补全 warehouseName / supplierName 字段
          const warehouseMap = {};
          const supplierMap = {};
          try {
            const whRows = dbQuery('SELECT id, name FROM warehouses', []);
            (whRows || []).forEach(w => { warehouseMap[w.id] = w.name || ''; });
          } catch (e) { /* ignore */ }
          try {
            const spRows = dbQuery('SELECT id, name FROM suppliers', []);
            (spRows || []).forEach(s => { supplierMap[s.id] = s.name || ''; });
          } catch (e) { /* ignore */ }
          records = rows.map(row => {
            const intoIdVal = row.into_id;
            return {
              intoId: intoIdVal,
              intoNum: intoIdVal,
              intoNo: intoIdVal,
              warehouseId: row.warehouse_id,
              warehouseName: warehouseMap[row.warehouse_id] || '',
              intoDate: row.into_date,
              totalAmount: row.total_amount || 0,
              totalNum: row.total_num || 0,
              intoType: row.into_type || 1,
              status: row.status || 1,
              supplierId: row.supplier_id || 0,
              supplierName: supplierMap[row.supplier_id] || '',
              remark: row.remark || '',
              deliveryGoodsId: row.delivery_goods_id || '',
              crby: row.crby || '',
              crtime: row.created_at || '',
              upby: row.upby || '',
              uptime: row.updated_at || '',
              createdAt: row.created_at,
              createTime: row.created_at,
            };
          });
        }
        // count
        let countSql = 'SELECT COUNT(*) as total FROM into_inventory';
        const countParams = [];
        if (status > 0) { countSql += ' WHERE status = ?'; countParams.push(status); }
        else if (intoType > 0) { countSql += ' WHERE into_type = ?'; countParams.push(intoType); }
        const cnt = dbQuery(countSql, countParams);
        total = (cnt && cnt.length > 0) ? (cnt[0].total || 0) : 0;
        scaleInboundLog('into-page' + (routeLabel ? '-' + routeLabel : ''), traceId, 'DB', { into_inventory_total: total, returned: records.length });
      } else {
        scaleInboundLog('into-page' + (routeLabel ? '-' + routeLabel : ''), traceId, 'WARN', 'dbQuery 不可用!');
      }
    } catch (e) {
      scaleInboundLog('into-page' + (routeLabel ? '-' + routeLabel : ''), traceId, 'ERROR', e.message);
    }
    scaleInboundLog('into-page' + (routeLabel ? '-' + routeLabel : ''), traceId, '←RES', { total, returned: records.length });
    // ★ 官方文档要求返回 DrpIntoInventoryV2VO：{ pageVO, sumVO }，设备端 Gson 按 pageVO 解析
    let sumTotalNum = 0;
    let sumTotalAmount = 0;
    if (dbQuery) {
      try {
        const sumRow = dbQuery('SELECT COALESCE(SUM(total_num),0) AS tn, COALESCE(SUM(total_amount),0) AS ta FROM into_inventory', []);
        if (sumRow && sumRow.length > 0) { sumTotalNum = Number(sumRow[0].tn) || 0; sumTotalAmount = Number(sumRow[0].ta) || 0; }
      } catch (e) { /* ignore */ }
    }
    const sumVO = {
      intoId: '', warehouseId: 0, warehouseName: '', intoDate: '',
      totalNum: sumTotalNum, totalAmount: sumTotalAmount,
      status: 0, intoType: 0, remark: '', deliveryGoodsId: '',
      crby: '', crtime: '', upby: '', uptime: '', supplierName: '',
    };
    res.json({
      code: 10000,
      msg: '成功',
      data: {
        pageVO: { records, total, size: size2, current: current2, searchCount: true, orderBy: '' },
        sumVO,
        // ★ 兼容平铺字段，防止设备端不同版本模型取错
        records, total, current: current2, size: size2, pages: Math.ceil(total / size2) || 1, searchCount: true,
      },
    });
  }
  app.all('/api/v4/device/drp/into/page', (req, res) => handleIntoPage(req, res, ''));
  app.all('/tengyun-api/api/v4/device/drp/into/page', (req, res) => handleIntoPage(req, res, 'tengyun'));
  // (replaced by handleIntoPage above)

  // ★★★ 入库公共原料列表（设备调用 /list/into/common-material）
  // 电子秤入库验货时查询可选原料，从 inbound_materials 表返回真实数据
  function handleCommonMaterial(req, res) {
    const traceId = scaleInboundTrace();
    const content = drpContent(req);
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const pageSize = (size === -1) ? 99999 : Math.max(1, size || 20);
    scaleInboundLog('common-material', traceId, '→REQ', { path: req.originalUrl, current, pageSize, machineSn: req.headers['machine-sn'] || '' });
    let products = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT id, name, category_name, unit, unit_price, bar_code, supplier_id, material_type FROM inbound_materials WHERE is_active = 1 ORDER BY id', []);
        if (rows && rows.length > 0) {
          products = rows.map(r => ({
            materialId: r.id, materialName: r.name, materialCode: String(r.id),
            categoryId: 0, categoryName: r.category_name || '',
            unitId: 1, unitName: r.unit || 'kg',
            unitPrice: Math.round((Number(r.unit_price) || 0) * 100),
            barCode: r.bar_code || '',
            supplierId: r.supplier_id || 0, supplierName: '',
            salesMode: 2, materialType: r.material_type || 1,
          }));
        }
      } catch (e) { /* ignore */ }
    }
    const total = products.length;
    const start = (current - 1) * pageSize;
    const records = products.slice(start, start + pageSize);
    scaleInboundLog('common-material', traceId, '←RES', { total, returned: records.length });
    res.json({ code: 10000, msg: '成功', data: { records, total, current, size: pageSize, pages: Math.ceil(total / pageSize) || 1 } });
  }
  app.all('/api/v4/device/drp/list/into/common-material', handleCommonMaterial);
  app.all('/tengyun-api/api/v4/device/drp/list/into/common-material', handleCommonMaterial);

  // ★★★ 配送单分页查询（设备调用 /page/orderDelivery）
  function handleOrderDelivery(req, res) {
    const traceId = scaleInboundTrace();
    const content = drpContent(req);
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const pageSize = (size === -1) ? 99999 : Math.max(1, size || 10);
    scaleInboundLog('orderDelivery', traceId, '→REQ', { path: req.originalUrl, current, pageSize, machineSn: req.headers['machine-sn'] || '' });
    // orderDelivery 是配送/交货单查询，暂无对应业务数据，返回空列表
    scaleInboundLog('orderDelivery', traceId, '←RES', { total: 0, returned: 0 });
    res.json({ code: 10000, msg: '成功', data: { records: [], total: 0, current, size: pageSize, pages: 0, searchCount: true } });
  }
  app.all('/api/v4/device/drp/page/orderDelivery', handleOrderDelivery);
  app.all('/tengyun-api/api/v4/device/drp/page/orderDelivery', handleOrderDelivery);

  app.all('/api/v4/device/drp/get/system-source', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('system-source', traceId, '→REQ', { path: req.originalUrl, machineSn: req.headers['machine-sn'] || '' });
    res.json({ code: 10000, msg: '成功', data: { source: 'local' } });
  });
  app.all('/tengyun-api/api/v4/device/drp/get/system-source', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('system-source-tengyun', traceId, '→REQ', { path: req.originalUrl });
    res.json({ code: 10000, msg: '成功', data: { source: 'local' } });
  });

  app.all('/api/v4/device/drp/sync/big-category', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('sync-big-category', traceId, '→REQ', { path: req.originalUrl, machineSn: req.headers['machine-sn'] || '' });
    const categories = getMaterialCategoryList();
    scaleInboundLog('sync-big-category', traceId, '←RES', { count: categories.length, names: categories.map(c => c.categoryName).join(', ') });
    // ★ 设备期望 data 直接是数组
    res.json({ code: 10000, msg: '成功', data: categories });
  });
  app.all('/tengyun-api/api/v4/device/drp/sync/big-category', (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('sync-big-category-tengyun', traceId, '→REQ', { path: req.originalUrl });
    const categories = getMaterialCategoryList();
    scaleInboundLog('sync-big-category-tengyun', traceId, '←RES', { count: categories.length });
    // ★ 设备期望 data 直接是数组
    res.json({ code: 10000, msg: '成功', data: categories });
  });

  // init/category-level/material-big-category 已通过 mountDrpRoute 注册，
  // 但此处额外显式注册腾云路径变体以防路由匹配不到
  app.all('/tengyun-api/api/v4/device/drp/init/category-level/material-big-category', async (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('init-cat-level-tengyun', traceId, '→REQ', { path: req.originalUrl });
    const categories = getMaterialCategoryList();
    const tree = categories.map(c => ({
      ...c, level: 1, children: [],
      categoryLevelName: `一级-${c.categoryName}`,
    }));
    scaleInboundLog('init-cat-level-tengyun', traceId, '←RES', { count: categories.length });
    res.json({ code: 10000, msg: '成功', data: { list: tree, bigCategoryList: categories } });
  });
  app.all('/api/v4/device/drp/init/category-level/material-big-category', async (req, res) => {
    const traceId = scaleInboundTrace();
    scaleInboundLog('init-cat-level', traceId, '→REQ', { path: req.originalUrl });
    const categories = getMaterialCategoryList();
    const tree = categories.map(c => ({
      ...c, level: 1, children: [],
      categoryLevelName: `一级-${c.categoryName}`,
    }));
    scaleInboundLog('init-cat-level', traceId, '←RES', { count: categories.length });
    res.json({ code: 10000, msg: '成功', data: { list: tree, bigCategoryList: categories } });
  });

  // 34. 电子秤-入库提交（★ 核心：验货入库最终提交入口）★ 严防崩溃
  mountDrpRoute('/into/add/commit', async (req, res) => {
    const traceId = 'inbc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    try {
    const content = drpContent(req);
    console.log('[DRP-IntoCommit] [traceId=' + traceId + '] ====== 入库提交 ======');
    console.log('[DRP-IntoCommit] [traceId=' + traceId + '] RAW BODY: ' + JSON.stringify(req.body || {}).substring(0, 3000));
    console.log('[DRP-IntoCommit] [traceId=' + traceId + '] Content keys: ' + JSON.stringify(Object.keys(content)));

    const warehouseId = Number(content.warehouseId || 1);
    const intoDate = content.intoDate || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const totalAmount = Number(content.totalAmount || 0);
    const totalNum = Number(content.totalNum || 0);
    const intoType = Number(content.intoType || 1);
    const remark = content.remark || '';
    const sourceType = Number(content.sourceType || 2);
    const supplierId = Number(content.supplierId || 0);
    const canteenId = Number(content.canteenId || 0);
    const fetchUserId = Number(content.fetchUserId || 0);
    const forceCommit = Number(content.forceCommit || 0);

    // ★ 兼容两种 detailList 格式：
    //   DRP 标准: { materialId, unitId, unitPrice(int-分), deliveryNum, purNum, totalPrice(int-分) }
    //   前端旧格式: { goodsId, goodsName, num, unitName, price(元), amount(元), planNum, supplierName }
    const rawDetails = content.detailList || [];
    console.log('[DRP-IntoCommit] [traceId=' + traceId + '] warehouseId=' + warehouseId + ', intoDate=' + intoDate + ', intoType=' + intoType + ', detailList共' + rawDetails.length + '条');

    if (rawDetails.length === 0) {
      console.warn('[DRP-IntoCommit] [traceId=' + traceId + '] ★★★ detailList为空，拒绝提交');
      return res.json(drpErr('入库明细不能为空'));
    }

    // ★ 标准化每条明细：统一转为 DRP 字段名
    const normalizedDetails = rawDetails.map((d, i) => {
      // 尝试从多种字段名中提取 materialId
      const materialId = Number(d.materialId || d.goodsId || d.goods_id || d.id || d.spuId || 0);
      // materialName：DRP标准用 materialName，前端旧格式用 goodsName
      const materialName = d.materialName || d.goodsName || d.goods_name || d.name || '';
      const unitId = Number(d.unitId || d.unit_id || 1);
      const unitName = d.unitName || d.unit_name || 'kg';
      // unitPrice: DRP标准是分为单位整数；前端旧格式是元为单位的浮点数
      let unitPrice = Number(d.unitPrice || d.unit_price || 0);
      const frontendPrice = Number(d.price || 0);
      if (unitPrice === 0 && frontendPrice > 0) {
        // 前端传的元 → 转分
        unitPrice = Math.round(frontendPrice * 100);
      }
      // 如果 unitPrice 很小（<100），可能是元；如果很大（>=100），可能是分或者是真实的大额
      // 启发式：如果 unitPrice < 100 且 frontendPrice > 0，前端已经传了元但服务端拿到的值小于100
      if (unitPrice > 0 && unitPrice < 100 && frontendPrice === 0 && d.price === undefined) {
        // 可能是分，保持不变
      }
      const deliveryNum = Number(d.deliveryNum || d.num || d.quantity || d.qty || 0);
      const purNum = Number(d.purNum || d.planNum || d.plan_num || d.planQuantity || 0);
      let totalPrice = Number(d.totalPrice || d.total_price || 0);
      const frontendAmount = Number(d.amount || 0);
      if (totalPrice === 0 && frontendAmount > 0) {
        totalPrice = Math.round(frontendAmount * 100);
      }
      if (totalPrice === 0 && unitPrice > 0 && deliveryNum > 0) {
        totalPrice = unitPrice * deliveryNum;
      }
      const detailSupplierId = Number(d.supplierId || d.supplier_id || 0);
      const detailSupplierName = d.supplierName || d.supplier_name || '';
      const detailRemark = d.remark || d.notes || '';

      console.log('[DRP-IntoCommit] [traceId=' + traceId + ']   明细[' + i + ']: materialId=' + materialId + ', name=' + materialName + ', deliveryNum=' + deliveryNum + ', unitPrice=' + unitPrice + '(分), totalPrice=' + totalPrice + '(分), supplierId=' + detailSupplierId);

      return { materialId, materialName, unitId, unitName, unitPrice, deliveryNum, purNum, totalPrice, supplierId: detailSupplierId, supplierName: detailSupplierName, remark: detailRemark };
    });

    // ★ 写入 SQLite 入库记录表
    const intoId = 'IN' + Date.now() + '_' + Math.random().toString(36).slice(2, 6).toUpperCase();
    let savedCount = 0;
    if (dbQuery) {
      try {
        // ★ 创建 DRP 标准表格（已有）
        dbQuery('CREATE TABLE IF NOT EXISTS drp_inbound_records ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'into_id TEXT NOT NULL, '
          + 'warehouse_id INTEGER, '
          + 'into_date TEXT, '
          + 'total_amount INTEGER, '
          + 'total_num REAL, '
          + 'into_type INTEGER, '
          + 'remark TEXT, '
          + 'source_type INTEGER, '
          + 'supplier_id INTEGER, '
          + 'canteen_id INTEGER, '
          + 'fetch_user_id INTEGER, '
          + 'created_at TEXT'
          + ')', []);

        dbQuery('CREATE TABLE IF NOT EXISTS drp_inbound_details ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'into_id TEXT NOT NULL, '
          + 'material_id INTEGER, '
          + 'material_name TEXT, '
          + 'unit_id INTEGER, '
          + 'unit_name TEXT, '
          + 'unit_price INTEGER, '
          + 'delivery_num REAL, '
          + 'pur_num REAL, '
          + 'total_price INTEGER, '
          + 'supplier_id INTEGER, '
          + 'supplier_name TEXT, '
          + 'remark TEXT, '
          + 'created_at TEXT'
          + ')', []);

        // ★★★ 创建用户要求的 into_inventory / into_inventory_detail 表
        dbQuery('CREATE TABLE IF NOT EXISTS into_inventory ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'into_id TEXT UNIQUE NOT NULL, '
          + 'warehouse_id INTEGER, '
          + 'into_date TEXT, '
          + 'total_amount INTEGER DEFAULT 0, '
          + 'total_num REAL DEFAULT 0, '
          + 'into_type INTEGER DEFAULT 1, '
          + 'status INTEGER DEFAULT 1, '
          + 'supplier_id INTEGER DEFAULT 0, '
          + 'remark TEXT, '
          + 'created_at TEXT, '
          + 'updated_at TEXT'
          + ')', []);

        dbQuery('CREATE TABLE IF NOT EXISTS into_inventory_detail ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'into_id TEXT NOT NULL, '
          + 'material_id INTEGER NOT NULL, '
          + 'unit_id INTEGER DEFAULT 1, '
          + 'supplier_id INTEGER DEFAULT 0, '
          + 'unit_price INTEGER DEFAULT 0, '
          + 'delivery_num REAL DEFAULT 0, '
          + 'total_price INTEGER DEFAULT 0, '
          + 'product_date TEXT, '
          + 'expire_time TEXT, '
          + 'remark TEXT, '
          + 'created_at TEXT, '
          + 'FOREIGN KEY (into_id) REFERENCES into_inventory(into_id)'
          + ')', []);

        // ★★★ 创建 warehouses 表
        dbQuery('CREATE TABLE IF NOT EXISTS warehouses ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'code TEXT UNIQUE NOT NULL, '
          + 'name TEXT NOT NULL, '
          + 'address TEXT, '
          + 'is_active INTEGER DEFAULT 1, '
          + 'created_at TEXT'
          + ')', []);

        // ★★★ 创建 suppliers 表（本地缓存，同步自系统供应商管理）
        dbQuery('CREATE TABLE IF NOT EXISTS suppliers ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'name TEXT NOT NULL, '
          + 'code TEXT, '
          + 'contact TEXT, '
          + 'phone TEXT, '
          + 'address TEXT, '
          + 'score REAL DEFAULT 5.0, '
          + 'is_active INTEGER DEFAULT 1, '
          + 'created_at TEXT'
          + ')', []);

        // ★ 写入 drp_inbound_records 表（原有）
        dbQuery(
          'INSERT INTO drp_inbound_records (into_id, warehouse_id, into_date, total_amount, total_num, into_type, remark, source_type, supplier_id, canteen_id, fetch_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [intoId, warehouseId, intoDate, totalAmount, totalNum, intoType, remark, sourceType, supplierId || 0, canteenId, fetchUserId, new Date().toISOString()]
        );

        // ★★★ 同时写入 into_inventory 表
        dbQuery(
          'INSERT OR REPLACE INTO into_inventory (into_id, warehouse_id, into_date, total_amount, total_num, into_type, status, supplier_id, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [intoId, warehouseId, intoDate, totalAmount, totalNum, intoType, 1, supplierId || 0, remark, new Date().toISOString()]
        );

        // 写入明细
        for (const d of normalizedDetails) {
          // 写入 drp_inbound_details（原有）
          dbQuery(
            'INSERT INTO drp_inbound_details (into_id, material_id, material_name, unit_id, unit_name, unit_price, delivery_num, pur_num, total_price, supplier_id, supplier_name, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [intoId, d.materialId, d.materialName, d.unitId, d.unitName, d.unitPrice, d.deliveryNum, d.purNum, d.totalPrice, d.supplierId, d.supplierName, d.remark, new Date().toISOString()]
          );
          // ★★★ 同时写入 into_inventory_detail 表
          dbQuery(
            'INSERT INTO into_inventory_detail (into_id, material_id, unit_id, supplier_id, unit_price, delivery_num, total_price, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [intoId, d.materialId, d.unitId, d.supplierId, d.unitPrice, d.deliveryNum, d.totalPrice, d.remark, new Date().toISOString()]
          );
          savedCount++;
        }

        console.log('[DRP-IntoCommit] [traceId=' + traceId + '] ✓ SQLite写入成功: intoId=' + intoId + ', 明细=' + savedCount + '条');
      } catch (e) {
        console.error('[DRP-IntoCommit] [traceId=' + traceId + '] ★★★ SQLite写入失败: ' + e.message);
        console.error('[DRP-IntoCommit] [traceId=' + traceId + '] 堆栈: ' + (e.stack || '无'));
      }
    }

    // ★ 同时写入 acceptance_records（兼容验收管理页面）
    if (dbQuery) {
      try {
        normalizedDetails.forEach((d, i) => {
          const actual = d.deliveryNum || 0;
          const expected = d.purNum || 0;
          const deviation = expected > 0 ? parseFloat((((actual - expected) / expected) * 100).toFixed(1)) : 0;
          const status = Math.abs(deviation) > 8 ? 'fail' : Math.abs(deviation) > 3 ? 'warning' : 'pass';
          const recordNo = intoId + '_' + String(i + 1).padStart(2, '0');
          const nowBeijing = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('Z', '+08:00');
          dbQuery(
            "INSERT INTO acceptance_records (record_no, accepted_at, ingredient, supplier, expected, actual, deviation, unit, inspector, certificates, status, inbound_status, inbound_at, inbound_material_id, supplier_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
            [recordNo, nowBeijing, d.materialName, d.supplierName, expected, actual, deviation, d.unitName, '', '[]', status, 'submitted', nowBeijing, d.materialId || null, d.supplierId || null]
          );
        });
        console.log('[DRP-IntoCommit] [traceId=' + traceId + '] ✓ acceptance_records同步写入: ' + normalizedDetails.length + '条');
      } catch (e) {
        console.warn('[DRP-IntoCommit] [traceId=' + traceId + '] acceptance_records写入失败: ' + e.message);
      }
    }

    console.log('[DRP-IntoCommit] [traceId=' + traceId + '] ━━━ 入库提交完成: intoId=' + intoId + ' ━━━');

    // ★★★ 回传重量（设备完成验收后不能清零秤重）
    const clientIPCommit = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const reqWCommit = extractAndCacheWeightFromRequest(req);
    const resolvedWCommit = resolveFinalWeight(reqWCommit, clientIPCommit);
    const commitResp = { intoId, savedCount, status: 2, totalNum };
    if (resolvedWCommit) { commitResp.weight = resolvedWCommit.weight; commitResp.weightUnit = resolvedWCommit.unit; }
    console.log('[DRP-IntoCommit] [traceId=' + traceId + '] 重量回传: req=' + reqWCommit + ', final=' + (resolvedWCommit ? resolvedWCommit.weight + resolvedWCommit.unit : 'null(无可用重量)'));

    return res.json(drpOk(commitResp));

    } catch (err) {
      console.error('[DRP-IntoCommit] [traceId=' + traceId + '] ★★★ 崩溃捕获: ' + err.message);
      console.error('[DRP-IntoCommit] [traceId=' + traceId + '] 堆栈: ' + (err.stack || ''));
      if (!res.headersSent) return res.json(drpOk({ intoId: 'IN_FALLBACK_' + Date.now(), savedCount: 0, status: 2, totalNum: 0 }));
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // ★★★ 入库明细查询（补全 #10 into-detail/list + #11 into-detail/page）
  // ══════════════════════════════════════════════════════════════════
  // ★★★ 提取入库单号：兼容「content 直接是字符串单号」和「content 是对象」两种格式
  //    官方文档：content 是入库单号，String 类型，必填
  function extractOrderId(req) {
    const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
    const rawContent = body.content;
    if (typeof rawContent === 'string') {
      const trimmed = rawContent.trim();
      if (trimmed.startsWith('{')) {
        try { const obj = JSON.parse(trimmed); return (obj.orderId || obj.intoId || obj.into_id || '').trim(); } catch { return trimmed; }
      }
      return trimmed;
    }
    if (rawContent && typeof rawContent === 'object') {
      return (rawContent.orderId || rawContent.intoId || rawContent.into_id || '').trim();
    }
    return '';
  }

  // ★★★ 预加载原料/供应商映射，补全明细的 materialName / unitName / categoryName / barCode 等
  function loadDetailLookups() {
    const materialMap = {};
    const supplierMap = {};
    if (dbQuery) {
      try {
        const mrows = dbQuery('SELECT id, name, category_name, unit, bar_code, material_type, supplier_id FROM inbound_materials', []);
        (mrows || []).forEach(m => { materialMap[m.id] = m; });
      } catch (e) { /* ignore */ }
      try {
        const srows = dbQuery('SELECT id, name FROM suppliers', []);
        (srows || []).forEach(s => { supplierMap[s.id] = s.name || ''; });
      } catch (e) { /* ignore */ }
    }
    return { materialMap, supplierMap };
  }

  // ★★★ 把明细行映射为官方文档要求的完整字段集
  function mapIntoDetailRecord(r, orderId, materialMap, supplierMap) {
    const matId = Number(r.material_id || 0);
    const mat = materialMap[matId] || {};
    const pics = materialPhotos.get(matId) || [];
    const materialUrl = pics.length > 0 ? pics[0].url : '';
    const supplierId = Number(r.supplier_id || mat.supplier_id || 0);
    return {
      detailId: r.id,
      intoId: r.into_id || orderId,
      materialId: matId,
      materialName: r.material_name || mat.name || '',
      materialCode: String(matId),
      inventoryId: 0,
      categoryId: String(r.category_id || 0),
      categoryName: mat.category_name || '',
      unitPrice: r.unit_price || 0,
      totalPrice: r.total_price || 0,
      deliveryNum: r.delivery_num || 0,
      purNum: r.pur_num || 0,
      inventoryNum: 999,
      unitId: r.unit_id || 1,
      unitName: r.unit_name || mat.unit || 'kg',
      supplierId,
      supplierName: r.supplier_name || supplierMap[supplierId] || '',
      productDate: r.product_date || '',
      expireTime: r.expire_time || '',
      materialUrl,
      barCode: mat.bar_code || '',
      rate: 1000,
      salesMode: mat.material_type || 2,
      size: '',
      unqualifiedNum: 0,
      batchNumber: '',
      remark: r.remark || '',
      createdAt: r.created_at,
    };
  }

  function handleIntoDetailList(req, res) {
    const traceId = scaleInboundTrace();
    const orderId = extractOrderId(req);
    scaleInboundLog('into-detail-list', traceId, '→REQ', { orderId, machineSn: req.headers['machine-sn'] || '' });
    if (!orderId) { scaleInboundLog('into-detail-list', traceId, 'ERROR', '缺少入库单号'); return res.json(drpErr('入库单号不能为空')); }
    const { materialMap, supplierMap } = loadDetailLookups();
    let rows = [];
    // ★ 优先 drp_inbound_details（字段更全：material_name/unit_name/pur_num/supplier_name）
    if (dbQuery) {
      try {
        rows = dbQuery('SELECT * FROM drp_inbound_details WHERE into_id = ? ORDER BY id', [orderId]);
      } catch (e) { scaleInboundLog('into-detail-list', traceId, 'ERROR', e.message); }
    }
    // ★ 兜底：drp_inbound_details 为空时查 into_inventory_detail
    if ((!rows || rows.length === 0) && dbQuery) {
      try {
        rows = dbQuery('SELECT * FROM into_inventory_detail WHERE into_id = ? ORDER BY id', [orderId]);
      } catch (e) { /* ignore */ }
    }
    const records = (rows || []).map(r => mapIntoDetailRecord(r, orderId, materialMap, supplierMap));
    scaleInboundLog('into-detail-list', traceId, '←RES', { total: records.length });
    // ★ 官方文档规定 data 直接是数组
    res.json({ code: 10000, msg: '成功', data: records });
  }
  mountDrpRoute('/into-detail/list', handleIntoDetailList);

  function handleIntoDetailPage(req, res) {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    const orderId = extractOrderId(req);
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const pageSize = (size === -1) ? 99999 : Math.max(1, size || 10);
    scaleInboundLog('into-detail-page', traceId, '→REQ', { orderId, current, pageSize, machineSn: req.headers['machine-sn'] || '' });
    if (!orderId) { scaleInboundLog('into-detail-page', traceId, 'ERROR', '缺少入库单号'); return res.json(drpOk({ records: [], total: 0, current, size: pageSize, pages: 0 })); }
    const { materialMap, supplierMap } = loadDetailLookups();
    let records = []; let total = 0;
    if (dbQuery) {
      try {
        const cnt = dbQuery('SELECT COUNT(*) as total FROM drp_inbound_details WHERE into_id = ?', [orderId]);
        total = (cnt && cnt.length > 0) ? (cnt[0].total || 0) : 0;
        const rows = dbQuery('SELECT * FROM drp_inbound_details WHERE into_id = ? ORDER BY id LIMIT ? OFFSET ?', [orderId, pageSize, (current - 1) * pageSize]);
        if (rows && rows.length > 0) {
          records = rows.map(r => mapIntoDetailRecord(r, orderId, materialMap, supplierMap));
        }
        scaleInboundLog('into-detail-page', traceId, 'DB', 'total=' + total + ', returned=' + records.length);
      } catch (e) { scaleInboundLog('into-detail-page', traceId, 'ERROR', e.message); }
    }
    // ★ 兜底：drp_inbound_details 为空时从 into_inventory_detail 分页查询
    if (records.length === 0 && total === 0 && dbQuery) {
      try {
        const cnt2 = dbQuery('SELECT COUNT(*) as total FROM into_inventory_detail WHERE into_id = ?', [orderId]);
        total = (cnt2 && cnt2.length > 0) ? (cnt2[0].total || 0) : 0;
        const rows = dbQuery('SELECT * FROM into_inventory_detail WHERE into_id = ? ORDER BY id LIMIT ? OFFSET ?', [orderId, pageSize, (current - 1) * pageSize]);
        if (rows && rows.length > 0) {
          records = rows.map(r => mapIntoDetailRecord(r, orderId, materialMap, supplierMap));
        }
        scaleInboundLog('into-detail-page', traceId, 'FALLBACK', 'total=' + total + ', returned=' + records.length);
      } catch (e) { /* ignore */ }
    }
    scaleInboundLog('into-detail-page', traceId, '←RES', { total, returned: records.length });
    res.json(drpOk({ records, total, current, size: pageSize, pages: Math.ceil(total / pageSize) || 1, searchCount: true }));
  }
  mountDrpRoute('/into-detail/page', handleIntoDetailPage);

  // ══════════════════════════════════════════════════════════════════
  // ★★★ 入库编辑/删除（补全 #13 into/edit/commit + #14 remove/into）
  // ══════════════════════════════════════════════════════════════════
  mountDrpRoute('/into/edit/commit', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    const intoId = (content.intoId || content.into_id || '').trim();
    const warehouseId = Number(content.warehouseId || 0);
    const intoDate = content.intoDate || '';
    const totalAmount = Number(content.totalAmount || 0);
    const totalNum = Number(content.totalNum || 0);
    scaleInboundLog('into-edit-commit', traceId, '→REQ', { intoId, warehouseId, intoDate, totalAmount, totalNum, machineSn: req.headers['machine-sn'] || '' });
    if (!intoId) { scaleInboundLog('into-edit-commit', traceId, 'ERROR', '缺少入库单号'); return res.json(drpErr('入库单号不能为空')); }
    let updated = false;
    if (dbQuery) {
      try {
        const now = new Date().toISOString();
        const fields = []; const values = [];
        if (warehouseId > 0) { fields.push('warehouse_id = ?'); values.push(warehouseId); }
        if (intoDate) { fields.push('into_date = ?'); values.push(intoDate); }
        if (content.totalAmount !== undefined) { fields.push('total_amount = ?'); values.push(totalAmount); }
        if (content.totalNum !== undefined) { fields.push('total_num = ?'); values.push(totalNum); }
        fields.push('updated_at = ?'); values.push(now);
        values.push(intoId);
        dbQuery('UPDATE into_inventory SET ' + fields.join(', ') + ' WHERE into_id = ?', values);
        // 同时更新 drp_inbound_records
        const fields2 = []; const values2 = [];
        if (warehouseId > 0) { fields2.push('warehouse_id = ?'); values2.push(warehouseId); }
        if (intoDate) { fields2.push('into_date = ?'); values2.push(intoDate); }
        if (content.totalAmount !== undefined) { fields2.push('total_amount = ?'); values2.push(totalAmount); }
        if (content.totalNum !== undefined) { fields2.push('total_num = ?'); values2.push(totalNum); }
        if (fields2.length > 0) { values2.push(intoId); dbQuery('UPDATE drp_inbound_records SET ' + fields2.join(', ') + ' WHERE into_id = ?', values2); }
        updated = true;
        scaleInboundLog('into-edit-commit', traceId, 'DB', '✓ 入库单 ' + intoId + ' 已更新');
      } catch (e) { scaleInboundLog('into-edit-commit', traceId, 'ERROR', e.message); return res.json(drpErr(e.message)); }
    }
    scaleInboundLog('into-edit-commit', traceId, '←RES', { updated });
    res.json(drpOk({ intoId, updated }));
  });

  mountDrpRoute('/remove/into', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    const orderId = (content.orderId || content.intoId || '').trim();
    scaleInboundLog('remove-into', traceId, '→REQ', { orderId, machineSn: req.headers['machine-sn'] || '' });
    if (!orderId) { scaleInboundLog('remove-into', traceId, 'ERROR', '缺少入库单号'); return res.json(drpErr('入库单号不能为空')); }
    let deleted = false;
    if (dbQuery) {
      try {
        dbQuery('DELETE FROM into_inventory_detail WHERE into_id = ?', [orderId]);
        dbQuery('DELETE FROM into_inventory WHERE into_id = ?', [orderId]);
        dbQuery('DELETE FROM drp_inbound_details WHERE into_id = ?', [orderId]);
        dbQuery('DELETE FROM drp_inbound_records WHERE into_id = ?', [orderId]);
        deleted = true;
        scaleInboundLog('remove-into', traceId, 'DB', '✓ 入库单 ' + orderId + ' 已删除');
      } catch (e) { scaleInboundLog('remove-into', traceId, 'ERROR', e.message); return res.json(drpErr(e.message)); }
    }
    scaleInboundLog('remove-into', traceId, '←RES', { deleted });
    res.json(drpOk({ orderId, deleted }));
  });

  // ══════════════════════════════════════════════════════════════════
  // ★★★ 出库全链路（补全 #15~#20 共6个接口）
  // ══════════════════════════════════════════════════════════════════

  // #15 出库提交 — 核心接口
  mountDrpRoute('/out/add/commit', async (req, res) => {
    const traceId = 'outbc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    try {
    const content = drpContent(req);
    console.log('[DRP-OutCommit] [traceId=' + traceId + '] ====== 出库提交 ======');
    console.log('[DRP-OutCommit] [traceId=' + traceId + '] RAW BODY: ' + JSON.stringify(req.body || {}).substring(0, 3000));
    console.log('[DRP-OutCommit] [traceId=' + traceId + '] Content keys: ' + JSON.stringify(Object.keys(content)));

    const warehouseId = Number(content.warehouseId || 1);
    const fetchUserId = Number(content.fetchUserId || 0);
    const outDate = content.outDate || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const outType = Number(content.outType || 1);
    const totalAmount = Number(content.totalAmount || 0);
    const totalNum = Number(content.totalNum || 0);
    const remark = content.remark || '';
    const supplierId = Number(content.supplierId || 0);

    const rawDetails = content.detailList || [];
    console.log('[DRP-OutCommit] [traceId=' + traceId + '] warehouseId=' + warehouseId + ', fetchUserId=' + fetchUserId + ', outDate=' + outDate + ', outType=' + outType + ', detailList共' + rawDetails.length + '条');

    if (rawDetails.length === 0) {
      console.warn('[DRP-OutCommit] [traceId=' + traceId + '] ★★★ detailList为空，拒绝提交');
      return res.json(drpErr('出库明细不能为空'));
    }

    const normalizedDetails = rawDetails.map((d, i) => {
      const materialId = Number(d.materialId || d.goodsId || d.goods_id || d.id || 0);
      const materialName = d.materialName || d.goodsName || d.goods_name || d.name || '';
      const unitId = Number(d.unitId || d.unit_id || 1);
      const unitName = d.unitName || d.unit_name || 'kg';
      let unitPrice = Number(d.unitPrice || d.unit_price || 0);
      const frontendPrice = Number(d.price || 0);
      if (unitPrice === 0 && frontendPrice > 0) unitPrice = Math.round(frontendPrice * 100);
      const deliveryNum = Number(d.deliveryNum || d.num || d.quantity || d.qty || 0);
      let totalPrice = Number(d.totalPrice || d.total_price || 0);
      const frontendAmount = Number(d.amount || 0);
      if (totalPrice === 0 && frontendAmount > 0) totalPrice = Math.round(frontendAmount * 100);
      if (totalPrice === 0 && unitPrice > 0 && deliveryNum > 0) totalPrice = unitPrice * deliveryNum;
      return { materialId, materialName, unitId, unitName, unitPrice, deliveryNum, totalPrice, supplierId: Number(d.supplierId || 0), supplierName: d.supplierName || '', remark: d.remark || '' };
    });

    const outId = 'OUT' + Date.now() + '_' + Math.random().toString(36).slice(2, 6).toUpperCase();
    let savedCount = 0;
    if (dbQuery) {
      try {
        dbQuery('CREATE TABLE IF NOT EXISTS out_inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, out_id TEXT UNIQUE NOT NULL, warehouse_id INTEGER, out_date TEXT, total_amount INTEGER DEFAULT 0, total_num REAL DEFAULT 0, out_type INTEGER DEFAULT 1, status INTEGER DEFAULT 1, fetch_user_id INTEGER DEFAULT 0, supplier_id INTEGER DEFAULT 0, remark TEXT, created_at TEXT, updated_at TEXT)', []);
        dbQuery('CREATE TABLE IF NOT EXISTS out_inventory_detail (id INTEGER PRIMARY KEY AUTOINCREMENT, out_id TEXT NOT NULL, material_id INTEGER NOT NULL, unit_id INTEGER DEFAULT 1, supplier_id INTEGER DEFAULT 0, unit_price INTEGER DEFAULT 0, delivery_num REAL DEFAULT 0, total_price INTEGER DEFAULT 0, product_date TEXT, expire_time TEXT, remark TEXT, created_at TEXT, FOREIGN KEY (out_id) REFERENCES out_inventory(out_id))', []);

        dbQuery('INSERT OR REPLACE INTO out_inventory (out_id, warehouse_id, out_date, total_amount, total_num, out_type, status, fetch_user_id, supplier_id, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [outId, warehouseId, outDate, totalAmount, totalNum, outType, 1, fetchUserId, supplierId || 0, remark, new Date().toISOString()]);

        for (const d of normalizedDetails) {
          dbQuery('INSERT INTO out_inventory_detail (out_id, material_id, unit_id, supplier_id, unit_price, delivery_num, total_price, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [outId, d.materialId, d.unitId, d.supplierId, d.unitPrice, d.deliveryNum, d.totalPrice, d.remark, new Date().toISOString()]);
          savedCount++;
        }
        console.log('[DRP-OutCommit] [traceId=' + traceId + '] ✓ SQLite写入成功: outId=' + outId + ', 明细=' + savedCount + '条');
      } catch (e) {
        console.error('[DRP-OutCommit] [traceId=' + traceId + '] ★★★ SQLite写入失败: ' + e.message);
      }
    }

    console.log('[DRP-OutCommit] [traceId=' + traceId + '] ━━━ 出库提交完成: outId=' + outId + ' ━━━');
    return res.json(drpOk({ outId, savedCount, status: 2, totalNum }));
    } catch (err) {
      console.error('[DRP-OutCommit] [traceId=' + traceId + '] ★★★ 崩溃捕获: ' + err.message);
      if (!res.headersSent) return res.json(drpOk({ outId: 'OUT_FALLBACK_' + Date.now(), savedCount: 0, status: 2, totalNum: 0 }));
    }
  });

  // #16 出库编辑提交
  mountDrpRoute('/out/edit/commit', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    const outId = (content.outId || content.out_id || '').trim();
    const warehouseId = Number(content.warehouseId || 0);
    const fetchUserId = Number(content.fetchUserId || 0);
    const outDate = content.outDate || '';
    const outType = Number(content.outType || 0);
    const totalAmount = Number(content.totalAmount || 0);
    const totalNum = Number(content.totalNum || 0);
    scaleInboundLog('out-edit-commit', traceId, '→REQ', { outId, warehouseId, fetchUserId, outDate, outType, machineSn: req.headers['machine-sn'] || '' });
    if (!outId) { scaleInboundLog('out-edit-commit', traceId, 'ERROR', '缺少出库单号'); return res.json(drpErr('出库单号不能为空')); }
    let updated = false;
    if (dbQuery) {
      try {
        const now = new Date().toISOString();
        const fields = []; const values = [];
        if (warehouseId > 0) { fields.push('warehouse_id = ?'); values.push(warehouseId); }
        if (fetchUserId > 0) { fields.push('fetch_user_id = ?'); values.push(fetchUserId); }
        if (outDate) { fields.push('out_date = ?'); values.push(outDate); }
        if (outType > 0) { fields.push('out_type = ?'); values.push(outType); }
        if (content.totalAmount !== undefined) { fields.push('total_amount = ?'); values.push(totalAmount); }
        if (content.totalNum !== undefined) { fields.push('total_num = ?'); values.push(totalNum); }
        if (fields.length > 0) { fields.push('updated_at = ?'); values.push(now); values.push(outId); dbQuery('UPDATE out_inventory SET ' + fields.join(', ') + ' WHERE out_id = ?', values); updated = true; }
        scaleInboundLog('out-edit-commit', traceId, 'DB', '✓ 出库单 ' + outId + ' 已更新');
      } catch (e) { scaleInboundLog('out-edit-commit', traceId, 'ERROR', e.message); return res.json(drpErr(e.message)); }
    }
    scaleInboundLog('out-edit-commit', traceId, '←RES', { updated });
    res.json(drpOk({ outId, updated }));
  });

  // #17 删除出库记录
  mountDrpRoute('/remove/out', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    const orderId = (content.orderId || content.outId || '').trim();
    scaleInboundLog('remove-out', traceId, '→REQ', { orderId, machineSn: req.headers['machine-sn'] || '' });
    if (!orderId) { scaleInboundLog('remove-out', traceId, 'ERROR', '缺少出库单号'); return res.json(drpErr('出库单号不能为空')); }
    let deleted = false;
    if (dbQuery) {
      try {
        dbQuery('DELETE FROM out_inventory_detail WHERE out_id = ?', [orderId]);
        dbQuery('DELETE FROM out_inventory WHERE out_id = ?', [orderId]);
        deleted = true;
        scaleInboundLog('remove-out', traceId, 'DB', '✓ 出库单 ' + orderId + ' 已删除');
      } catch (e) { scaleInboundLog('remove-out', traceId, 'ERROR', e.message); return res.json(drpErr(e.message)); }
    }
    scaleInboundLog('remove-out', traceId, '←RES', { deleted });
    res.json(drpOk({ orderId, deleted }));
  });

  // #18 出库列表分页查询
  function handleOutPage(req, res, routeLabel) {
    const traceId = scaleInboundTrace();
    scaleInboundLog('out-page' + (routeLabel ? '-' + routeLabel : ''), traceId, '→REQ', { path: req.originalUrl, machineSn: req.headers['machine-sn'] || '' });
    let records = []; let total = 0; let current = 1; let size = 10;
    try {
      if (dbQuery) {
        try { dbQuery('CREATE TABLE IF NOT EXISTS out_inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, out_id TEXT UNIQUE NOT NULL, warehouse_id INTEGER, out_date TEXT, total_amount INTEGER DEFAULT 0, total_num REAL DEFAULT 0, out_type INTEGER DEFAULT 1, status INTEGER DEFAULT 1, fetch_user_id INTEGER DEFAULT 0, supplier_id INTEGER DEFAULT 0, remark TEXT, created_at TEXT, updated_at TEXT)', []); } catch (e) { /* ignore */ }
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const content = (typeof body.content === 'string' ? JSON.parse(body.content) : (body.content || {}));
      current = Math.max(1, Number(content.current || 1));
      size = Number(content.size) || 10;
      const status = Number(content.status || 0);
      const outType = Number(content.outType || 0);
      scaleInboundLog('out-page' + (routeLabel ? '-' + routeLabel : ''), traceId, 'PARAM', { current, size, status, outType });
      if (dbQuery) {
        let sql = 'SELECT * FROM out_inventory';
        const conditions = []; const params = [];
        if (status > 0) { conditions.push('status = ?'); params.push(status); }
        if (outType > 0) { conditions.push('out_type = ?'); params.push(outType); }
        if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(size, (current - 1) * size);
        const rows = dbQuery(sql, params);
        if (rows && rows.length > 0) {
          // ★ 预加载仓库/供应商名称，补全 warehouseName / supplierName 字段
          const warehouseMap = {};
          const supplierMap = {};
          try {
            const whRows = dbQuery('SELECT id, name FROM warehouses', []);
            (whRows || []).forEach(w => { warehouseMap[w.id] = w.name || ''; });
          } catch (e) { /* ignore */ }
          try {
            const spRows = dbQuery('SELECT id, name FROM suppliers', []);
            (spRows || []).forEach(s => { supplierMap[s.id] = s.name || ''; });
          } catch (e) { /* ignore */ }
          records = rows.map(row => {
            const outIdVal = row.out_id;
            return {
              outId: outIdVal, outNum: outIdVal, outNo: outIdVal,
              warehouseId: row.warehouse_id, warehouseName: warehouseMap[row.warehouse_id] || '',
              outDate: row.out_date,
              totalAmount: row.total_amount || 0, totalNum: row.total_num || 0,
              outType: row.out_type || 1, status: row.status || 1,
              fetchUserId: row.fetch_user_id || 0,
              supplierId: row.supplier_id || 0, supplierName: supplierMap[row.supplier_id] || '',
              remark: row.remark || '', createdAt: row.created_at, createTime: row.created_at,
            };
          });
        }
        let countSql = 'SELECT COUNT(*) as total FROM out_inventory';
        const countParams = [];
        if (status > 0) { countSql += ' WHERE status = ?'; countParams.push(status); }
        const cnt = dbQuery(countSql, countParams);
        total = (cnt && cnt.length > 0) ? (cnt[0].total || 0) : 0;
        scaleInboundLog('out-page' + (routeLabel ? '-' + routeLabel : ''), traceId, 'DB', { total, returned: records.length });
      }
    } catch (e) { scaleInboundLog('out-page' + (routeLabel ? '-' + routeLabel : ''), traceId, 'ERROR', e.message); }
    scaleInboundLog('out-page' + (routeLabel ? '-' + routeLabel : ''), traceId, '←RES', { total, returned: records.length });
    res.json({ code: 10000, msg: '成功', data: { records, total, current, size, pages: Math.ceil(total / size) || 1, searchCount: true } });
  }
  app.all('/api/v4/device/drp/out/page', (req, res) => handleOutPage(req, res, ''));
  app.all('/tengyun-api/api/v4/device/drp/out/page', (req, res) => handleOutPage(req, res, 'tengyun'));

  // #19 出库明细列表
  mountDrpRoute('/out-detail/list', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    const orderId = (content.orderId || content.outId || content.out_id || '').trim();
    scaleInboundLog('out-detail-list', traceId, '→REQ', { orderId, machineSn: req.headers['machine-sn'] || '' });
    if (!orderId) { scaleInboundLog('out-detail-list', traceId, 'ERROR', '缺少出库单号'); return res.json(drpErr('出库单号不能为空')); }
    let records = [];
    if (dbQuery) {
      try {
        const rows = dbQuery('SELECT * FROM out_inventory_detail WHERE out_id = ? ORDER BY id', [orderId]);
        if (rows && rows.length > 0) {
          records = rows.map(r => ({
            detailId: r.id, outId: r.out_id, materialId: r.material_id,
            unitId: r.unit_id || 1, unitPrice: r.unit_price || 0,
            deliveryNum: r.delivery_num || 0, totalPrice: r.total_price || 0,
            supplierId: r.supplier_id || 0, productDate: r.product_date || '',
            expireTime: r.expire_time || '', remark: r.remark || '',
            createdAt: r.created_at,
          }));
        }
        scaleInboundLog('out-detail-list', traceId, 'DB', 'out_inventory_detail 返回 ' + records.length + ' 条');
      } catch (e) { scaleInboundLog('out-detail-list', traceId, 'ERROR', e.message); }
    }
    scaleInboundLog('out-detail-list', traceId, '←RES', { total: records.length });
    res.json({ code: 10000, msg: '成功', data: records });
  });

  // #20 出库明细分页查询
  mountDrpRoute('/out-detail/page', (req, res) => {
    const content = drpContent(req);
    const traceId = scaleInboundTrace();
    const orderId = (content.orderId || content.outId || content.out_id || '').trim();
    const current = Math.max(1, Number(content.current || 1));
    const size = Number(content.size);
    const pageSize = (size === -1) ? 99999 : Math.max(1, size || 10);
    scaleInboundLog('out-detail-page', traceId, '→REQ', { orderId, current, pageSize, machineSn: req.headers['machine-sn'] || '' });
    if (!orderId) { scaleInboundLog('out-detail-page', traceId, 'ERROR', '缺少出库单号'); return res.json(drpOk({ records: [], total: 0, current, size: pageSize, pages: 0 })); }
    let records = []; let total = 0;
    if (dbQuery) {
      try {
        const cnt = dbQuery('SELECT COUNT(*) as total FROM out_inventory_detail WHERE out_id = ?', [orderId]);
        total = (cnt && cnt.length > 0) ? (cnt[0].total || 0) : 0;
        const rows = dbQuery('SELECT * FROM out_inventory_detail WHERE out_id = ? ORDER BY id LIMIT ? OFFSET ?', [orderId, pageSize, (current - 1) * pageSize]);
        if (rows && rows.length > 0) {
          records = rows.map(r => ({
            detailId: r.id, outId: r.out_id, materialId: r.material_id,
            unitId: r.unit_id || 1, unitPrice: r.unit_price || 0,
            deliveryNum: r.delivery_num || 0, totalPrice: r.total_price || 0,
            supplierId: r.supplier_id || 0, productDate: r.product_date || '',
            expireTime: r.expire_time || '', remark: r.remark || '',
            createdAt: r.created_at,
          }));
        }
        scaleInboundLog('out-detail-page', traceId, 'DB', 'total=' + total + ', returned=' + records.length);
      } catch (e) { scaleInboundLog('out-detail-page', traceId, 'ERROR', e.message); }
    }
    scaleInboundLog('out-detail-page', traceId, '←RES', { total, returned: records.length });
    res.json(drpOk({ records, total, current, size: pageSize, pages: Math.ceil(total / pageSize) || 1, searchCount: true }));
  });

  // ★★★ DRP 兜底日志：新 APK 可能调了未知的 DRP 路径，在这里捕获
  app.all('/tengyun-api/api/v4/device/drp/*', (req, res) => {
    const traceId = scaleInboundTrace();
    const rawBody = JSON.stringify(req.body || {});
    scaleInboundLog('DRP-UNKNOWN-tengyun', traceId, '→REQ', { path: req.originalUrl, method: req.method, bodyPreview: rawBody.substring(0, 500), machineSn: req.headers['machine-sn'] || '' });
    scaleInboundLog('DRP-UNKNOWN-tengyun', traceId, 'WARN', '★★★ 此路径未注册处理器，返回空数据。请将此日志发给开发人员添加路由 ★★★');
    res.json({ code: 10000, msg: '成功', data: { records: [], total: 0, current: 1, size: 10, pages: 0 } });
  });
  app.all('/api/v4/device/drp/*', (req, res) => {
    const traceId = scaleInboundTrace();
    const rawBody = JSON.stringify(req.body || {});
    scaleInboundLog('DRP-UNKNOWN', traceId, '→REQ', { path: req.originalUrl, method: req.method, bodyPreview: rawBody.substring(0, 500), machineSn: req.headers['machine-sn'] || '' });
    scaleInboundLog('DRP-UNKNOWN', traceId, 'WARN', '★★★ 此路径未注册处理器，返回空数据。请将此日志发给开发人员添加路由 ★★★');
    res.json({ code: 10000, msg: '成功', data: { records: [], total: 0, current: 1, size: 10, pages: 0 } });
  });

  // ═══ 腾云 catch-all ═══
  // 【注意】所有精确路由（尤其是 DRP 路由）必须在此 catch-all 之前注册
  app.all('/tengyun-api/*', async (req, res) => {
    const freezeTraceId3 = 'freeze_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    try {
      const ps = req.path;
      // ★★★ 卡死排查：记录所有被 catch-all 匹配的 buffet 和关键路径
      if (ps.includes('buffet') || ps.includes('getsetting') || ps.includes('get-main-device') || ps.includes('bind-info-config') || ps.includes('register') || ps.includes('login')) {
        console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] ══════════════════════════════════════');
        console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] ★★★ 关键路径被 catch-all 命中: ' + ps);
        console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] 完整URL=' + req.originalUrl + ', 方法=' + req.method);
        console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] machine-sn=' + JSON.stringify(req.headers['machine-sn']));
        console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] machinenum=' + JSON.stringify(req.headers['machinenum']));
        console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] 客户端IP=' + (req.ip || 'unknown'));
        console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] RAW BODY=' + JSON.stringify(req.body || {}).substring(0, 500));
      }
      // ★★★ [DEVICE-INTEG] 记录设备接入
      if (ps.includes('base-config') || ps.includes('getsetting') || ps.includes('get-main-device') || ps.includes('bind-info-config') || ps.includes('interval-config') || ps.includes('exchange') || ps.includes('/key') || ps.includes('/config')) {
        const devSn = (req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();
        console.log('[DEVICE-INTEG] [traceId=' + freezeTraceId3 + '] path=' + ps + ' | sn=' + (devSn || '(none)') + ' | ip=' + (req.ip || 'unknown'));
      }
      // ★★★ 检测 DRP 相关但未被精确路由匹配的路径
      if (ps.includes('drp') || ps.includes('register-material') || ps.includes('material-pic') || ps.includes('material/') || ps.includes('inbound') || ps.includes('register') || ps.includes('sync/menu')) {
        const traceIdCatch = scaleInboundTrace();
        scaleInboundLog('TENGYUN-CATCHALL-DRP', traceIdCatch, '→REQ', { path: ps, method: req.method, bodyPreview: JSON.stringify(req.body || {}).substring(0, 500), machineSn: req.headers['machine-sn'] || '' });
        scaleInboundLog('TENGYUN-CATCHALL-DRP', traceIdCatch, 'WARN', '★★★ 此DRP路径未被精确路由匹配，返回空数据。请检查路径是否正确 ★★★');
        return res.json({ code: 10000, msg: '成功', data: { records: [], total: 0, current: 1, size: 10, pages: 0 } });
      }
      // ★★★ 乐牛自助餐电子屏接口：buffet/get-main-device、buffet/getsetting 等
      // 这些精确路由虽然后面也注册了，但被此 catch-all 先匹配到，必须在此处理
      if (ps.includes('buffet')) {
        console.log('[TENGYUN-CATCHALL] ★ buffet 路径被 catch-all 命中，主动转发处理: ' + ps);
        if (ps.includes('getsetting')) {
          try {
            const cm = getCurrentMealType();
            const sn = resolveDeviceSn(req, dbQuery);
            console.log('[TENGYUN-CATCHALL-getsetting] ★★★ sn=' + JSON.stringify(sn) + ', path=' + ps);
            console.log('[TENGYUN-CATCHALL-getsetting] headers: machine-sn=' + JSON.stringify(req.headers['machine-sn']) + ', machinenum=' + JSON.stringify(req.headers['machinenum']));
            const dbDevice = await resolveDeviceConfig(sn);
            console.log('[TENGYUN-CATCHALL-getsetting] ★ resolveDeviceConfig 返回: ' + JSON.stringify(dbDevice ? { ui_template: dbDevice.ui_template } : null));
            const deviceConfig = buildGetSettingDeviceConfig(dbDevice);
            console.log('[TENGYUN-CATCHALL-getsetting] deviceConfig 字段数=' + Object.keys(deviceConfig).length + ', deviceUITemplate=' + deviceConfig.deviceUITemplate);
            console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] catchall-getsetting: deviceUITemplate=' + deviceConfig.deviceUITemplate);
            console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] ═══ catchall-getsetting 响应结束 ═══');
            // ★★★ [DEVICE-INTEG] 设备对接日志
            console.log('[DEVICE-INTEG] [traceId=' + freezeTraceId3 + '] getsetting OK | sn=' + (sn || '(none)') + ' | deviceUITemplate=' + deviceConfig.deviceUITemplate + ' | fields=' + Object.keys(deviceConfig).length);
            return res.json({ code: 10000, msg: '成功', data: { currentMeal: cm, currentMealName: getMealNameByType(cm), pricingMode: 1, unitPrice: 5, ...deviceConfig } });
          } catch (getsettingErr) {
            console.error('[DEVICE-INTEG] [traceId=' + freezeTraceId3 + '] ★★★ getsetting 内部异常! ' + getsettingErr.message);
            console.error('[DEVICE-INTEG] [traceId=' + freezeTraceId3 + '] 堆栈: ' + (getsettingErr.stack || '无堆栈'));
            console.error('[TENGYUN-CATCHALL-getsetting] ★★★ 内部异常: ' + getsettingErr.message + '\n' + (getsettingErr.stack || ''));
            // ★ 兜底返回默认配置，不让设备收到 data:null
            const fallbackConfig = buildGetSettingDeviceConfig(null);
            return res.json({ code: 10000, msg: '成功', data: { currentMeal: getCurrentMealType(), currentMealName: getMealNameByType(getCurrentMealType()), pricingMode: 1, unitPrice: 5, ...fallbackConfig } });
          }
        }
        if (ps.includes('get-main-device') || ps.includes('getbinde') || ps.includes('bind-info')) {
          const sn = resolveDeviceSn(req, dbQuery);
          let bindMode = 'all'; let bindValue = ''; let stationId = null; let dbDevice = null;
          if (sn && dbQuery) {
            try {
              const rows = dbQuery('SELECT bind_mode, bind_value, station_id, ui_template, bind_plate_before_take, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish FROM tray_display_devices WHERE sn = ?', [sn]);
              if (rows && rows.length > 0) { dbDevice = rows[0]; bindMode = dbDevice.bind_mode || 'all'; bindValue = dbDevice.bind_value || ''; stationId = dbDevice.station_id || null; }
              console.log('[BuffetExact] DB查询结果: found=' + (rows ? rows.length : 0) + ', bindMode=' + bindMode + ', bindValue=' + (bindValue || '(empty)'));
            } catch (dbErr) {
              console.error('[BuffetExact] ★ DB查询错误: ' + dbErr.message);
            }
          }
          // 纯局域网环境，本地 SQLite 即权威数据源
          if (bindMode === 'station' && stationId) { const resolved = resolveStationProductId(dbQuery, stationId); bindMode = resolved.bindMode; bindValue = resolved.bindValue; }
          let dishes;
          if ((bindMode === 'single') && bindValue) { dishes = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, bindMode, bindValue); }
          else { dishes = await fetchTodayDishNutrition(supabaseUrl, supabaseAnonKey, dbQuery); }
          // ★ 防止撑爆硬件：今日无菜品时不拉全量，返回空
          if (!dishes) dishes = [];
          // ★ 支持设备传入 dishId 参数，只返回指定菜品的详情
          const body = req.body || {};
          const content = (typeof body.content === 'string' ? (() => { try { return JSON.parse(body.content); } catch { return {}; } })() : body.content) || {};
          const reqDishId = (body.dishId || content.dishId || req.query.dishId || '').toString().trim();
          if (reqDishId) {
            dishes = dishes.filter(d => {
              const id = String(d.dishId || d.id || d.dishesId || '');
              return id === reqDishId;
            });
            if (dishes.length === 0) {
              console.log('[BuffetExact] ★ dishId=' + reqDishId + ' 未匹配任何菜品，返回空');
            }
          } else {
            // 未传 dishId：向后兼容，返回第一个菜品
            if (dishes.length > 1) dishes = [dishes[0]];
          }
          // ★★★ 新版: 使用 buildMainDeviceResponse 构建扁平格式响应
          // ★★★ 同时准备短SN（用于 Session 查询兜底）
          const shortSnCatch = sn && sn.includes('@') ? sn.split('@').pop() : sn;
          const dishData2 = dishes.length > 0 ? buildMainDeviceResponse(dishes[0], sn) : null;
          // ★★★ 关键修复：如果长SN没拿到 mealWeight，尝试用短SN再查一次
          if (dishData2 && dishData2.mealWeight === 0 && shortSnCatch && shortSnCatch !== sn) {
            const shortSessionCatch = getDeviceSessionWeight(shortSnCatch);
            if (shortSessionCatch.mealWeight > 0) {
              const displayWCatch = shortSessionCatch.lastDropWeight > 0 ? shortSessionCatch.lastDropWeight : shortSessionCatch.mealWeight;
              dishData2.mealWeight = displayWCatch;
              dishData2.initialWeight = shortSessionCatch.initialWeight;
              dishData2.currentWeight = shortSessionCatch.currentWeight;
              const factorCatch = displayWCatch / 100;
              dishData2.actualNutrition = displayWCatch > 0 ? {
                calories: Math.round(dishData2.nutritionPer100g.calories * factorCatch * 10) / 10,
                protein: Math.round(dishData2.nutritionPer100g.protein * factorCatch * 10) / 10,
                fat: Math.round(dishData2.nutritionPer100g.fat * factorCatch * 10) / 10,
                carbohydrate: Math.round(dishData2.nutritionPer100g.carbohydrate * factorCatch * 10) / 10,
                dietaryFiber: Math.round(dishData2.nutritionPer100g.dietaryFiber * factorCatch * 10) / 10,
                calcium: Math.round(dishData2.nutritionPer100g.calcium * factorCatch * 10) / 10,
              } : dishData2.actualNutrition;
              console.log('[TENGYUN-CATCHALL] ★ 短SN补全 mealWeight: shortSn=' + shortSnCatch + ', mealWeight=' + shortSessionCatch.mealWeight + 'g');
            }
          }
          if (sn) await updateDeviceLastPull(supabaseUrl, supabaseAnonKey, dbQuery, sn);
          console.log('[TENGYUN-CATCHALL] buffet/main-device: sn=' + sn + ' | shortSn=' + shortSnCatch + ' | dish=' + (dishData2 ? dishData2.dishName : 'null') + ' | mealWeight=' + (dishData2 ? dishData2.mealWeight : 0));
          console.log('[DEVICE-INTEG] [traceId=' + freezeTraceId3 + '] get-main-device (catchall) OK | sn=' + (sn || '(none)') + ' | mealWeight=' + (dishData2 ? dishData2.mealWeight : 0));
          console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] catchall-get-main-device: dishId参数=' + (reqDishId || '(无)') + ', mealWeight=' + (dishData2 ? dishData2.mealWeight : 0));
          console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId3 + '] ═══ catchall-get-main-device 响应结束 ═══');
          const frontendDataCatch = buildFrontendCompatDishResponse(dishData2, dbDevice);
          return res.json({ code: 10000, msg: '成功', data: frontendDataCatch });
        }
        if (ps.includes('bindplate')) {
          const sn = resolveDeviceSn(req, dbQuery);
          if (dbQuery && sn) { try { dbQuery('UPDATE tray_display_devices SET status = ?, last_seen = ? WHERE sn = ?', ['online', new Date().toISOString(), sn]); } catch (e) { } }
          const b = req.body || {}; const content = b.content || {};
          return res.json({ code: 10000, msg: '成功', data: { plateSerialNum: content.plateSerialNum || '', bindTime: Date.now() } });
        }
      }
      if (ps.includes('bind-info-config')) {
        // ★★★ 走周菜谱 dish_nutrition 表，不落入下方 menu 分支的 product_items 查询
        const { products } = await handleMenuRequest(req, res);
        const ml = buildMealListFromProducts(products); const dl = buildRecipeDateListFromDishNutrition(products);
        console.log('[TENGYUN-CATCHALL] bind-info-config 走 dish_nutrition: 菜品=' + (products ? products.length : 0) + '条');
        return res.json({ code: 10000, msg: '成功', data: { recipeId: 0, recipeType: 0, uptime: new Date().toISOString(), dateList: dl, mealList: ml } });
      }
      if (ps.includes('bind-recipeid-info-config')) {
        // ★★★ 同样走 dish_nutrition 表
        const { products: rcpProducts } = await handleMenuRequest(req, res);
        console.log('[TENGYUN-CATCHALL] bind-recipeid-info-config 走 dish_nutrition: 菜品=' + (rcpProducts ? rcpProducts.length : 0) + '条');
        return res.json({ code: 10000, msg: '成功', data: { recipeId: 0, recipeType: 0, uptime: new Date().toISOString(), dateList: buildRecipeDateList(rcpProducts), mealList: buildMealListFromProducts(rcpProducts) } });
      }
      if (ps.includes('menu') || ps.includes('dishes') || ps.includes('recipe')) {
        try {
          const products = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, 'all', '');
          return res.json({ code: 10000, msg: '成功', data: { recipeId: 0, recipeType: 0, uptime: new Date().toISOString(), dateList: buildRecipeDateList(products), mealList: buildMealListFromProducts(products) } });
        } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
      }
      if (ps.endsWith('/register') || ps.endsWith('/login') || ps.includes('/internal-config')) return handleDeviceRegister(req, res);
      if (ps.includes('exchange') || ps.includes('/key')) return handleYunshitangExchangeKey(req, res);
      return res.json({ code: 10000, msg: 'success', data: null });
    } catch (err) { if (!res.headersSent) return res.json({ code: 10000, msg: 'success', data: null }); }
  });

  // ═══ 传感器网关路由 ═══
  app.all('/api/v1/android/back/selectBindDeviceListByGateWaySN', (req, res) => {
    const b = req.body || {}; const q = req.query || {}; const h = req.headers || {};
    const content = b.content || {};
    const gatewaySn = content.gatewaySn || b.gatewaySn || q.gatewaySn || h['machine-sn'] || '';
    const { mqClientAddress } = resolveMqttAddress(req, state, preferredMqttPort, '传感器网关V1');
    const deviceInfo = {};
    if (dbQuery && gatewaySn) {
      try {
        const rows = dbQuery('SELECT id, gateway_sn, device_sn, device_type, device_type_name, device_name, device_no, zone, protocol, mqtt_topic, slave_addr, enabled FROM gateway_sensor_bindings WHERE gateway_sn = ? ORDER BY device_type, id', [gatewaySn]);
        (rows || []).forEach(r => { const dt = r.device_type || 'GAS_SENSOR'; if (!deviceInfo[dt]) deviceInfo[dt] = []; deviceInfo[dt].push({ deviceId: r.id || 0, deviceNo: r.device_no || r.device_sn || '', deviceType: 0, deviceTypeName: r.device_type_name || dt, deviceSize: '', deviceName: r.device_name || '', deviceSn: r.device_sn || '', canteenId: 0, areaFullName: r.zone || '', deviceNetworkState: r.enabled ? 1 : 0, subExtendInfo: { protocol: r.protocol || 'modbus_tcp', mqttTopic: r.mqtt_topic || '', slaveAddr: r.slave_addr || 0 } }); });
      } catch (e) { }
    }
    return res.json({ code: 0, msg: '', data: { deviceInfo, deviceSn: gatewaySn, mqttAddress: mqClientAddress } });
  });

  app.all('/tengyun-api/api/v4/back/device/gateway/selectBindDeviceListByGateWaySN', (req, res) => {
    const b = req.body || {}; const q = req.query || {}; const h = req.headers || {};
    const content = b.content || {};
    const gatewaySn = content.gatewaySn || b.gatewaySn || q.gatewaySn || h['machine-sn'] || '';
    const { mqClientAddress } = resolveMqttAddress(req, state, preferredMqttPort, '腾云V4后场');
    const deviceInfo = {};
    if (dbQuery && gatewaySn) {
      try {
        const rows = dbQuery('SELECT id, gateway_sn, device_sn, device_type, device_type_name, device_name, device_no, zone, protocol, mqtt_topic, slave_addr, enabled FROM gateway_sensor_bindings WHERE gateway_sn = ? ORDER BY device_type, id', [gatewaySn]);
        (rows || []).forEach(r => { const dt = r.device_type || 'GAS_SENSOR'; if (!deviceInfo[dt]) deviceInfo[dt] = []; deviceInfo[dt].push({ deviceId: r.id || 0, deviceNo: r.device_no || r.device_sn || '', deviceType: 0, deviceTypeName: r.device_type_name || dt, deviceSize: '', deviceName: r.device_name || '', deviceSn: r.device_sn || '', canteenId: 0, areaFullName: r.zone || '', deviceNetworkState: r.enabled ? 1 : 0, subExtendInfo: { protocol: r.protocol || 'modbus_tcp', mqttTopic: r.mqtt_topic || '', slaveAddr: r.slave_addr || 0 } }); });
      } catch (e) { }
    }
    return res.json({ code: 0, msg: '', data: { deviceInfo, deviceSn: gatewaySn, mqttAddress: mqClientAddress } });
  });

  app.all('/tengyun-api/api/v1/android/back/selectBindDeviceListByGateWaySN', (req, res) => {
    const b = req.body || {}; const q = req.query || {}; const h = req.headers || {};
    const content = b.content || {};
    const gatewaySn = content.gatewaySn || b.gatewaySn || q.gatewaySn || h['machine-sn'] || '';
    const { mqClientAddress } = resolveMqttAddress(req, state, preferredMqttPort, '腾云V1后场');
    const deviceInfo = {};
    if (dbQuery && gatewaySn) {
      try {
        const rows = dbQuery('SELECT id, gateway_sn, device_sn, device_type, device_type_name, device_name, device_no, zone, protocol, mqtt_topic, slave_addr, enabled FROM gateway_sensor_bindings WHERE gateway_sn = ? ORDER BY device_type, id', [gatewaySn]);
        (rows || []).forEach(r => { const dt = r.device_type || 'GAS_SENSOR'; if (!deviceInfo[dt]) deviceInfo[dt] = []; deviceInfo[dt].push({ deviceId: r.id || 0, deviceNo: r.device_no || r.device_sn || '', deviceType: 0, deviceTypeName: r.device_type_name || dt, deviceSize: '', deviceName: r.device_name || '', deviceSn: r.device_sn || '', canteenId: 0, areaFullName: r.zone || '', deviceNetworkState: r.enabled ? 1 : 0, subExtendInfo: { protocol: r.protocol || 'modbus_tcp', mqttTopic: r.mqtt_topic || '', slaveAddr: r.slave_addr || 0 } }); });
      } catch (e) { }
    }
    return res.json({ code: 0, msg: '', data: { deviceInfo, deviceSn: gatewaySn, mqttAddress: mqClientAddress } });
  });

  app.all('/tengyun-api/api/v4/back/device/common/base/base-config', (req, res) => {
    const { mqClientAddress } = resolveMqttAddress(req, state, preferredMqttPort, '腾云V4后场base');
    res.json({ code: 10000, msg: '成功', data: { tenantId: Number(req.headers['merchant-id'] || '1000000001'), mqClientAddress } });
  });

  app.all('/tengyun-api/api/v4/back/device/gateway/refreshBindDeviceInfo', (req, res) => {
    return res.json({ code: 10000, msg: '成功', data: { refreshed: true } });
  });

  // ═══ v4 interval-config ═══
  app.all('/api/v4/device/common/base/interval-config', (req, res) => {
    const periods = getEffectiveMealPeriods();
    const bti = periods.map(p => ({ intervalId: p.mealType, intervalName: p.mealName, startTime: p.startTimeStr, endTime: p.endTimeStr, ifUse: 1 }));
    res.json({ level: 0, basicsTimeIntervals: bti });
  });

  // ═══ 小牛设备自助餐路由 ═══
  app.all('/api/v4/device/buffet/*', async (req, res) => {
    const pathName = req.path || '';
    const freezeTraceId4 = 'freeze_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    if (pathName.includes('get-main-device') || pathName.includes('getbinde') || pathName.includes('bind-info') || pathName.includes('getsetting')) {
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId4 + '] ══════════════════════════════════════');
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId4 + '] ★★★ api/v4/device/buffet/* 路径被命中: ' + pathName);
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId4 + '] 完整URL=' + req.originalUrl + ', 方法=' + req.method);
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId4 + '] machine-sn=' + JSON.stringify(req.headers['machine-sn']));
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId4 + '] RAW BODY=' + JSON.stringify(req.body || {}).substring(0, 500));
    }
    // ★ upweightmenu 消费上报由独立 handler 处理
    if (pathName.includes('upweightmenu')) return;
    const b = req.body || {};
    const content = b.content || {};
    const sn = resolveDeviceSn(req, dbQuery);
    let bindMode = 'all'; let bindValue = ''; let stationId = null; let dbDevice = null;
    if (sn && dbQuery) {
      const rows = dbQuery('SELECT bind_mode, bind_value, station_id, ui_template, bind_plate_before_take, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish FROM tray_display_devices WHERE sn = ?', [sn]);
      if (rows && rows.length > 0) { dbDevice = rows[0]; bindMode = dbDevice.bind_mode || 'all'; bindValue = dbDevice.bind_value || ''; stationId = dbDevice.station_id || null; }
    }
    // 纯局域网环境，本地 SQLite 即权威数据源
    if (bindMode === 'station' && stationId) { const resolved = resolveStationProductId(dbQuery, stationId); bindMode = resolved.bindMode; bindValue = resolved.bindValue; }
    const deviceConfig = buildGetSettingDeviceConfig(dbDevice);

    if (pathName.includes('getbinde') || pathName.includes('bind-info')) {
      let dishes;
      if ((bindMode === 'single') && bindValue) { dishes = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, bindMode, bindValue); }
      else { dishes = await fetchTodayDishNutrition(supabaseUrl, supabaseAnonKey, dbQuery); }
      // ★ 防止撑爆硬件：今日无菜品时不拉全量，返回空
      if (!dishes) dishes = [];
      // ★ 支持设备传入 dishId 参数，只返回指定菜品的详情
      const body3 = req.body || {};
      const content3 = (typeof body3.content === 'string' ? (() => { try { return JSON.parse(body3.content); } catch { return {}; } })() : body3.content) || {};
      const reqDishId3 = (body3.dishId || content3.dishId || req.query.dishId || '').toString().trim();
      if (reqDishId3) {
        dishes = dishes.filter(d => {
          const id = String(d.dishId || d.id || d.dishesId || '');
          return id === reqDishId3;
        });
      } else {
        // 未传 dishId：向后兼容，返回第一个菜品
        if (dishes.length > 1) dishes = [dishes[0]];
      }
      // ★★★ 新版: 使用 buildMainDeviceResponse 构建扁平格式响应
      const dishData3 = dishes.length > 0 ? buildMainDeviceResponse(dishes[0], sn) : null;
      if (sn) await updateDeviceLastPull(supabaseUrl, supabaseAnonKey, dbQuery, sn);
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId4 + '] api/v4-buffet-getbinde: dish=' + (dishData3 ? dishData3.dishName : 'null') + ' | mealWeight=' + (dishData3 ? dishData3.mealWeight : 0));
      console.log('[DEVICE-INTEG] [traceId=' + freezeTraceId4 + '] get-main-device (apiv4-buffet) OK | sn=' + (sn || '(none)') + ' | mealWeight=' + (dishData3 ? dishData3.mealWeight : 0));
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId4 + '] api/v4-buffet-getbinde: dishId参数=' + (reqDishId3 || '(无)') + ', 未传dishId→返回首菜兜底');
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId4 + '] ═══ api/v4-buffet-getbinde 响应结束 ═══');
      const frontendDataBuffet = buildFrontendCompatDishResponse(dishData3, dbDevice);
      return res.json({ code: 10000, msg: '成功', data: frontendDataBuffet });
    }

    if (pathName.includes('getsetting')) {
      const cm = getCurrentMealType();
      console.log('[getsetting-apiv4-buffet] ====== 自助餐获取配置 ======');
      console.log('[getsetting-apiv4-buffet] sn=' + sn + ', deviceConfig 字段数=' + Object.keys(deviceConfig).length + ', deviceUITemplate=' + deviceConfig.deviceUITemplate);
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId4 + '] api/v4-buffet-getsetting: deviceUITemplate=' + deviceConfig.deviceUITemplate);
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId4 + '] ═══ api/v4-buffet-getsetting 响应结束 ═══');
      return res.json({ code: 0, msg: 'success', data: { ...deviceConfig, currentMeal: cm, currentMealName: getMealNameByType(cm), pricingMode: 1, unitPrice: 0 } });
    }

    if (pathName.includes('bindplate')) {
      if (dbQuery && sn) { try { dbQuery('UPDATE tray_display_devices SET status = ?, last_seen = ? WHERE sn = ?', ['online', new Date().toISOString(), sn]); } catch (e) { } }
      return res.json({ code: 0, msg: 'success', data: { plateSerialNum: content.plateSerialNum || '', bindTime: Date.now() } });
    }

    return res.json({ code: 0, msg: 'success', data: null });
  });

  // ═══ 重量上报 ═══
  app.post('/api/weight/report', async (req, res) => {
    const b = req.body || {};
    const sn = b.sn || b.SN || ''; const key = b.key || b.hw_key || ''; const w = Number(b.weight);
    const reqSource = (b.source || '').toLowerCase().trim();
    const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const traceId = 'wt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    console.log('[ScaleInbound-WeightReport] ━━━ 重量上报 ━━━');
    console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] sn=' + sn + ', weight=' + w + ', source=' + (reqSource || 'auto') + ', clientIP=' + clientIP);
    console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] body keys: ' + JSON.stringify(Object.keys(b)));
    if (!sn || !key || isNaN(w) || w < 0) {
      console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] ★ 参数校验失败: sn=' + !!sn + ', key=' + !!key + ', weightValid=' + (!isNaN(w) && w >= 0));
      return res.status(400).json({ code: 400, message: '参数错误', data: null });
    }
    // ★★★ 缓存重量到全局缓存（供 VectorMaterial 等接口使用）
    if (w > 0 && sn) {
      cacheDeviceWeight(sn, w, 'kg', 'http-upweight');
      if (clientIP) cacheDeviceWeight(clientIP, w, 'kg', 'http-upweight');
      // ★★★ 同步会话重量（供 get-main-device / meal-current 使用）
      updateDeviceSessionWeight(sn, w);
      console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] ★ 已缓存重量: sn=' + sn + ' → ' + w + 'kg, 会话已更新');
    }
    console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] 查询设备: sn=' + sn);
    const devices = dbQuery ? dbQuery('SELECT id, name, sn, hw_key, station_id, status, device_type FROM tray_display_devices WHERE sn = ?', [String(sn)]) : [];
    if (!devices || devices.length === 0) {
      // ★ 短SN兜底
      let fallbackDevices = [];
      if (dbQuery && sn && !sn.includes('@')) {
        fallbackDevices = dbQuery('SELECT id, name, sn, hw_key, station_id, status, device_type FROM tray_display_devices WHERE sn LIKE ?', ['%@' + sn]);
        console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] 短SN兜底查询: ' + (fallbackDevices ? fallbackDevices.length : 0) + ' 条');
      }
      console.warn('[ScaleInbound-WeightReport] [traceId=' + traceId + '] ★★★ 设备不存在: sn=' + sn + ', 兜底=' + (fallbackDevices && fallbackDevices.length > 0 ? '命中' : '未命中'));
      return res.status(404).json({ code: 404, message: '设备不存在', data: null });
    }
    const device = devices[0];
    console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] 设备匹配: id=' + device.id + ', name=' + device.name + ', station_id=' + device.station_id + ', device_type=' + device.device_type);
    if (device.hw_key !== String(key)) {
      console.warn('[ScaleInbound-WeightReport] [traceId=' + traceId + '] ★★★ 验证码错误: 期望=' + (device.hw_key ? device.hw_key.substring(0, 6) + '...' : '(空)') + ', 收到=' + (String(key).substring(0, 6) || '(空)'));
      return res.status(403).json({ code: 403, message: '验证码错误', data: null });
    }

    // ★ 查找关联的托盘站（优先），若无绑定则自动兜底创建
    let station = null;
    console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] 查找托盘站: station_id=' + device.station_id);
    if (device.station_id && dbQuery) {
      const sr = dbQuery('SELECT * FROM tray_stations WHERE id = ?', [device.station_id]);
      if (sr && sr.length > 0) {
        station = sr[0];
        console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] 托盘站已绑定: id=' + station.id + ', code=' + station.station_code + ', dish=' + station.dish_name + ', last_weight=' + station.hw_last_weight);
      } else {
        console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] 托盘站 station_id=' + device.station_id + ' 在 tray_stations 中不存在');
      }
    }

    // ★ 若设备未绑定托盘站，自动创建一个默认托盘站并关联到设备
    if (!station && dbQuery) {
      console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] ★ 设备未绑定托盘站，尝试自动创建...');
      try {
        const now = new Date().toISOString();
        // 先检查是否已有同名托盘站（按 station_code = sn 查找）
        const existing = dbQuery('SELECT * FROM tray_stations WHERE station_code = ?', [sn]);
        if (existing && existing.length > 0) {
          station = existing[0];
          // 把设备关联到这个托盘站
          dbQuery('UPDATE tray_display_devices SET station_id = ?, updated_at = ? WHERE id = ?', [station.id, now, device.id]);
          console.log('[WeightReport] 设备 ' + sn + ' 自动关联到现有托盘站 id=' + station.id);
        } else {
          // 创建默认托盘站
          dbQuery(
            'INSERT INTO tray_stations (name, station_code, dish_name, category, tare_weight, hw_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [device.name || sn, sn, '未命名菜品', '其他', 0, 1, now, now]
          );
          const newRows = dbQuery('SELECT * FROM tray_stations WHERE station_code = ? ORDER BY id DESC LIMIT 1', [sn]);
          if (newRows && newRows.length > 0) {
            station = newRows[0];
            dbQuery('UPDATE tray_display_devices SET station_id = ?, updated_at = ? WHERE id = ?', [station.id, now, device.id]);
            console.log('[WeightReport] 设备 ' + sn + ' 自动创建并关联默认托盘站 id=' + station.id);
          }
        }
      } catch (err) {
        console.warn('[WeightReport] 自动创建托盘站失败:', err.message);
      }
    }

    // ★ 仍然没有 station（比如 dbQuery 不可用），用设备自身信息兜底
    const stationCode = station ? station.station_code : (device.name || sn);
    const dishName = station ? (station.dish_name || '未知菜品') : (device.name || '未知菜品');
    const category = station ? (station.category || '其他') : '其他';
    const tareWeight = station ? (Number(station.tare_weight) || 0) : 0;
    const lastW = station ? (Number(station.hw_last_weight) || 0) : 0;

    const now = new Date().toISOString();
    // ★ 北京时间（UTC+8），用于 pickup_time 字段，避免凌晨0-8点日期跨天
    const nowBeijing = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('Z', '+08:00');
    const pw = Math.max(0, lastW - w);
    let logCreated = false;
    // ★ 来源确定：手动测试上报使用 'manual'，真实设备自动上报使用 'auto'
    const pickupSource = (reqSource === 'manual') ? 'manual' : 'auto';
    // ★ 如果托盘已经绑定了真实菜品，优先使用托盘上的菜品名；'未命名菜品' 属缺省占位符
    const finalDishName = (dishName && dishName !== '未命名菜品') ? dishName : '未命名菜品';
    const finalCategory = (category && category !== '其他') ? category : '其他';
    console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] 取餐判断: lastW=' + lastW + ', w=' + w + ', pw=' + pw + ', tareWeight=' + tareWeight);
    if (dbQuery && lastW > 0 && pw > 50) {
      try {
        const mealTypeName = getMealNameByType(getCurrentMealType());
        dbQuery('INSERT INTO tray_pickup_logs (station_id, station_code, dish_name, category, meal_type, pickup_time, weight_before, weight_after, pickup_weight, pickup_portions, notes, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [station ? station.id : null, stationCode, finalDishName, finalCategory, mealTypeName, nowBeijing, lastW, w, pw, 1, pickupSource === 'manual' ? '手动测试' : '自动记录', pickupSource]);
        logCreated = true;
        console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] ✓ 取餐记录写入: station=' + stationCode + ', dish=' + finalDishName + ', pw=' + pw + 'g, meal=' + mealTypeName + ', source=' + pickupSource);
      } catch (err) {
        console.warn('[ScaleInbound-WeightReport] [traceId=' + traceId + '] ★ 取餐记录写入失败: ' + err.message);
      }
    } else {
      console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] 不生成取餐记录: dbQuery=' + !!dbQuery + ', lastW=' + lastW + ', pw=' + pw + ' (需要 lastW>0 && pw>50)');
    }
    if (station && dbQuery) {
      try {
        dbQuery('UPDATE tray_stations SET hw_last_weight = ?, hw_last_seen = ?, hw_enabled = 1 WHERE id = ?', [w, now, station.id]);
        console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] 托盘站重量已更新: id=' + station.id + ' → ' + w + 'g');
      } catch (err) {
        console.warn('[ScaleInbound-WeightReport] [traceId=' + traceId + '] 更新托盘站重量失败: ' + err.message);
      }
    }
    updateDeviceStatus(supabaseUrl, supabaseAnonKey, dbQuery, sn, device.token || '', 'online').catch(() => {});
    console.log('[ScaleInbound-WeightReport] [traceId=' + traceId + '] ━━━ 响应: currentWeight=' + w + ', netWeight=' + Math.max(0, w - tareWeight) + ', logCreated=' + logCreated + ' ━━━');
    return res.json({ code: 200, message: 'success', data: { current_weight: w, net_weight: Math.max(0, w - tareWeight), log_created: logCreated, pickup_weight: logCreated ? pw : 0 } });
  });

  app.get('/api/weight', (req, res) => {
    const sn = req.query.sn || ''; const key = req.query.key || '';
    if (!sn || !key) return res.status(400).json({ code: 400, message: '缺少参数', data: null });
    const devices = dbQuery ? dbQuery('SELECT id, name, sn, hw_key, station_id FROM tray_display_devices WHERE sn = ?', [String(sn)]) : [];
    if (!devices || devices.length === 0) return res.status(404).json({ code: 404, message: '设备不存在', data: null });
    const device = devices[0];
    if (device.hw_key !== String(key)) return res.status(403).json({ code: 403, message: '验证码错误', data: null });
    let station = null;
    if (device.station_id && dbQuery) { const sr = dbQuery('SELECT id, hw_last_weight, tare_weight FROM tray_stations WHERE id = ?', [device.station_id]); if (sr && sr.length > 0) station = sr[0]; }
    if (!station) return res.json({ code: 200, message: 'success', data: { weight: null } });
    return res.json({ code: 200, message: 'success', data: { device: { name: device.name }, weight: { current: Number(station.hw_last_weight) || 0, tare: Number(station.tare_weight) || 0, net: Math.max(0, (Number(station.hw_last_weight) || 0) - (Number(station.tare_weight) || 0)) } } });
  });

  // ═══ MQTT 诊断 ═══
  app.get('/api/mqtt/diagnose', (req, res) => {
    const since = parseInt(req.query.since || '0', 10);
    const brokerStatus = { running: (state.mqttPort || 0) > 0, mqttPort: state.mqttPort || preferredMqttPort, httpPort: state.httpPort || port };
    const clients = [];
    for (const [cid, info] of mqttClientList.entries()) {
      if (info.status === 'connected') clients.push({ clientId: cid, sn: info.sn || 'unknown', connectedAt: info.connectedAt, lastTopic: info.lastTopic || '', msgCount: info.msgCount || 0 });
    }
    let allMsgs = mqttAllTopicLogs.filter(l => l.timestamp >= since);
    const topicFilter = req.query.topic || '';
    if (topicFilter) allMsgs = allMsgs.filter(m => m.topic.includes(topicFilter));
    const sensorLogs = getMqttSensorLogs(since);
    res.json({ code: 0, msg: 'ok', data: { brokerStatus, onlineClients: clients, onlineClientCount: clients.length, allTopicMessages: allMsgs.slice(0, 100), sensorLogs: sensorLogs.slice(0, 50), timestamp: Date.now() } });
  });

  // ═══ Modbus 读取 ═══
  app.get('/api/sensor/modbus-read', async (req, res) => {
    const { host, port: modbusPort, slaveAddr, registerAddr, registerType } = req.query;
    if (!host || !slaveAddr || registerAddr === undefined) return res.status(400).json({ code: 400, msg: '缺少参数', data: null });
    const slave = parseInt(String(slaveAddr), 10); const reg = parseInt(String(registerAddr), 10); const rt = parseInt(String(registerType || '3'), 10);
    if (isNaN(slave) || isNaN(reg)) return res.status(400).json({ code: 400, msg: '参数无效', data: null });
    let ModbusRTU = null;
    try { const m = await import('modbus-serial'); ModbusRTU = m.default; } catch (e) { return res.status(500).json({ code: 500, msg: 'Modbus 模块未安装', data: null }); }
    const client = new ModbusRTU(); let connected = false;
    try {
      client.setTimeout(3000);
      await new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('连接超时')), 3200); client.connectTCP(host, { port: parseInt(String(modbusPort || '502'), 10) }).then(() => { clearTimeout(t); resolve(); }).catch(e => { clearTimeout(t); reject(e); }); });
      connected = true; client.setID(slave); client.setTimeout(3000);
      let result;
      if (rt === 4) result = await client.readInputRegisters(reg, 1);
      else result = await client.readHoldingRegisters(reg, 1);
      if (result && result.data && result.data.length > 0) return res.json({ code: 0, msg: 'success', data: { value: result.data[0] } });
      return res.json({ code: 1, msg: '从站返回空数据', data: null });
    } catch (e) { return res.json({ code: 1, msg: `Modbus 读取失败: ${e.message}`, data: null }); }
    finally { if (connected) { try { client.close(() => {}); } catch { } } }
  });

  // ═══ Modbus 轮询控制 ═══
  let modbusPollingTimer = null;
  let modbusPollingState = { running: false, lastPoll: '', lastError: '', successCount: 0, failCount: 0, deviceCount: 0 };

  app.get('/api/modbus/poll/start', (req, res) => {
    modbusPollingState.running = true;
    res.json({ code: 0, msg: 'ok', data: { running: true } });
  });

  app.get('/api/modbus/poll/stop', (req, res) => {
    modbusPollingState.running = false;
    if (modbusPollingTimer) { clearInterval(modbusPollingTimer); modbusPollingTimer = null; }
    res.json({ code: 0, msg: 'ok', data: { running: false } });
  });

  app.get('/api/modbus/poll/status', (req, res) => {
    res.json({ code: 0, msg: 'ok', data: { ...modbusPollingState } });
  });

  app.get('/api/modbus/latest-readings', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      const rows = dbQuery("SELECT sensor_id, temp, humidity, recorded_at, source FROM environment_readings ORDER BY recorded_at DESC LIMIT 5", []);
      const latest = {};
      (rows || []).forEach(r => { if (!latest[r.sensor_id]) latest[r.sensor_id] = { temp: r.temp, humidity: r.humidity, recorded_at: r.recorded_at, source: r.source }; });
      return res.json({ code: 0, msg: 'ok', data: Object.entries(latest).map(([sn, v]) => ({ device_sn: sn, ...v })) });
    } catch (e) { return res.status(500).json({ code: 500, msg: e.message, data: [] }); }
  });

  // ═══ v1/v4 catch-all ═══
  app.all('/api/v1/*', (req, res) => {
    const p = req.path;
    if (p.includes('exchange') || p.includes('/key')) return handleYunshitangExchangeKey(req, res);
    if (p.includes('timestamp') || p.includes('time')) { const n = Date.now(); return res.json({ code: 10000, msg: 'success', data: { timestamp: n, serverTime: n } }); }
    if (p.includes('register') || p.includes('login')) return handleDeviceRegister(req, res);
    return res.json({ code: 10000, msg: 'success', data: null });
  });

  // ═══  v4 menu catch-all ═══
  app.all('/api/v4/device/common/menu/recipe/get', (req, res) => {
    const d = new Date(Date.now() + 8 * 3600 * 1000); const ts = d.toISOString().slice(0, 10);
    res.json({ code: 10000, msg: '成功', data: [{ recipeId: 1, canteenId: 0, stallId: 0, canteenName: '', recipeName: '今日菜单', stallName: '', stallIfOpen: 1, stallStaTime: '05:00:00', stallEndTime: '22:00:00', applyDate: ts }] });
  });

  app.all('/api/v4/device/common/menu/dishes/add', (req, res) => {
    const b = req.body || {}; const content = b.content || {};
    const dn = String(content.dishesName || b.dishesName || '').trim();
    if (!dn) return res.json({ code: 10000, msg: '菜品名称不能为空', data: null });
    let id = null;
    if (dbQuery) {
      try {
        const ex = dbQuery('SELECT id FROM product_items WHERE name = ?', [dn]);
        if (ex && ex.length > 0) { id = ex[0].id; dbQuery('UPDATE product_items SET price = ?, updated_at = ? WHERE id = ?', [(Number(content.price || 0)) / 100, new Date().toISOString(), id]); }
        else { dbQuery("INSERT INTO product_items (name, status, pricing_mode, currency, price, stock, media, created_at, updated_at) VALUES (?, 'active', 0, 'CNY', ?, 999, ?, datetime('now'), datetime('now'))", [dn, (Number(content.price || 0)) / 100, content.picUrl ? JSON.stringify([{ url: content.picUrl, type: 'image' }]) : '[]']); const nr = dbQuery('SELECT id FROM product_items WHERE name = ? ORDER BY id DESC LIMIT 1', [dn]); if (nr && nr.length > 0) id = nr[0].id; }
      } catch (e) { }
    }
    return res.json({ code: 10000, msg: '成功', data: id ? { dishesId: id, dishesName: dn } : null });
  });

  // ═══ 腾云 buffet ═══
  app.all('/tengyun-api/api/v4/device/buffet/getsetting', async (req, res) => {
    const freezeTraceId2 = 'freeze_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId2 + '] ══════════════════════════════════════');
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId2 + '] ★★★ getsetting 被调用 (精确路由)');
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId2 + '] 路径=' + req.path + ', 方法=' + req.method);
    const cm = getCurrentMealType();
    const sn = resolveDeviceSn(req, dbQuery);
    console.log('[getsetting-tengyun-exact] ====== 自助餐获取配置 ======');
    console.log('[getsetting-tengyun-exact] ★★★ sn=' + JSON.stringify(sn) + ', path=' + req.path);
    console.log('[getsetting-tengyun-exact] headers: machine-sn=' + JSON.stringify(req.headers['machine-sn']) + ', machinenum=' + JSON.stringify(req.headers['machinenum']));
    const dbDevice = await resolveDeviceConfig(sn);
    console.log('[getsetting-tengyun-exact] ★ resolveDeviceConfig 返回: ' + JSON.stringify(dbDevice ? { ui_template: dbDevice.ui_template } : null));
    const deviceConfig = buildGetSettingDeviceConfig(dbDevice);
    console.log('[getsetting-tengyun-exact] deviceConfig 字段数=' + Object.keys(deviceConfig).length + ', deviceUITemplate=' + deviceConfig.deviceUITemplate + ', 完整deviceConfig:', JSON.stringify(deviceConfig));
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId2 + '] deviceUITemplate=' + deviceConfig.deviceUITemplate + ', deviceConfig字段数=' + Object.keys(deviceConfig).length);
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId2 + '] 响应数据: currentMeal=' + cm + ', pricingMode=1, unitPrice=5, +deviceConfig(' + Object.keys(deviceConfig).length + '字段)');
    console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId2 + '] ═══ getsetting 响应结束 ═══');
    res.json({ code: 10000, msg: '成功', data: { currentMeal: cm, currentMealName: getMealNameByType(cm), pricingMode: 1, unitPrice: 5, ...deviceConfig } });
  });

  app.all('/tengyun-api/api/v4/device/buffet/get-main-device', async (req, res) => {
    // ★ 此精确路由与 catch-all /tengyun-api/* 中的 buffet handler 会同时执行。
    // ★ 精确路由先返回（catch-all 的异步 fetch 可能较慢），
    // ★ 所以这里独立实现完整逻辑，并加 try-catch 防止未捕获异常导致 data:null。
    const freezeTraceId = 'freeze_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    try {
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] ══════════════════════════════════════');
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] ★★★ get-main-device 被调用 (精确路由)');
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] 路径=' + req.path + ', 方法=' + req.method);
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] machine-sn=' + (req.headers['machine-sn'] || '(missing)') + ', machinenum=' + (req.headers['machinenum'] || '(missing)'));
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] 客户端IP=' + (req.ip || req.connection?.remoteAddress || 'unknown'));
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] Content-Type=' + (req.headers['content-type'] || '(none)'));
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] RAW BODY=' + JSON.stringify(req.body || {}).substring(0, 1000));
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] RAW QUERY=' + JSON.stringify(req.query || {}));
      console.log('[BuffetExact] ★ get-main-device 精确路由被调用, path=' + req.path + ', sn-header=' + (req.headers['machine-sn'] || '(none)'));
      const sn = resolveDeviceSn(req, dbQuery);
      console.log('[BuffetExact] resolveDeviceSn = ' + (sn || 'null'));
      let bindMode = 'all'; let bindValue = ''; let stationId = null; let dbDevice = null;
      if (sn && dbQuery) {
        try {
          const rows = dbQuery('SELECT bind_mode, bind_value, station_id, ui_template, bind_plate_before_take, weigh_alarm_model, min_settlement_weight, stable_difference, alarm_below_grams, max_weight_dish, max_price_temp_dish, interval_price_temp_dish, min_price_temp_dish FROM tray_display_devices WHERE sn = ?', [sn]);
          if (rows && rows.length > 0) { dbDevice = rows[0]; bindMode = dbDevice.bind_mode || 'all'; bindValue = dbDevice.bind_value || ''; stationId = dbDevice.station_id || null; }
          console.log('[BuffetExact] DB查询结果: found=' + (rows ? rows.length : 0) + ', bindMode=' + bindMode + ', bindValue=' + (bindValue || '(empty)'));
        } catch (dbErr) {
          console.error('[BuffetExact] ★ DB查询错误: ' + dbErr.message);
        }
      }
      // 纯局域网环境，本地 SQLite 即权威数据源
      if (bindMode === 'station' && stationId) { const resolved = resolveStationProductId(dbQuery, stationId); bindMode = resolved.bindMode; bindValue = resolved.bindValue; }
      let dishes;
      if ((bindMode === 'single') && bindValue) {
        console.log('[BuffetExact] 单菜品模式, bindValue=' + bindValue);
        dishes = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, bindMode, bindValue);
      } else {
        console.log('[BuffetExact] 多菜品模式, 先查 dish_nutrition...');
        dishes = await fetchTodayDishNutrition(supabaseUrl, supabaseAnonKey, dbQuery);
        console.log('[BuffetExact] fetchTodayDishNutrition 返回: ' + (dishes ? dishes.length : 'null') + ' 条');
        // ★ 防止撑爆硬件：今日无菜品时不拉全量产品
      }
      // ★ 确保 dishes 至少是空数组，不能是 null/undefined
      if (!dishes) dishes = [];
      // ★ 支持设备传入 dishId 参数，只返回指定菜品的详情
      //    设备流程：先通过 bind-info-config 获取菜品列表 → 用户选择一道 → 传 dishId 调此接口获取详情
      const body = req.body || {};
      const content = (typeof body.content === 'string' ? (() => { try { return JSON.parse(body.content); } catch { return {}; } })() : body.content) || {};
      const reqDishId = (body.dishId || content.dishId || req.query.dishId || '').toString().trim();
      if (reqDishId) {
        dishes = dishes.filter(d => {
          const id = String(d.dishId || d.id || d.dishesId || '');
          return id === reqDishId;
        });
        if (dishes.length === 0) {
          console.log('[BuffetExact] ★ dishId=' + reqDishId + ' 未匹配任何菜品，返回空');
        }
      } else {
        // 未传 dishId：向后兼容，返回第一个菜品
        if (dishes.length > 1) dishes = [dishes[0]];
      }
      // ★★★ 新版: 使用 buildMainDeviceResponse 构建扁平格式响应（含实时重量+实际营养）
      const dishData = dishes.length > 0 ? buildMainDeviceResponse(dishes[0], sn) : null;
      // ★★★ 关键修复：如果长SN没拿到 mealWeight，尝试用短SN再查一次（外层保险）
      const shortSnExact = sn && sn.includes('@') ? sn.split('@').pop() : null;
      if (dishData && dishData.mealWeight === 0 && shortSnExact && shortSnExact !== sn) {
        const shortSessionExact = getDeviceSessionWeight(shortSnExact);
        if (shortSessionExact.mealWeight > 0) {
          const displayWExact = shortSessionExact.lastDropWeight > 0 ? shortSessionExact.lastDropWeight : shortSessionExact.mealWeight;
          dishData.mealWeight = displayWExact;
          dishData.initialWeight = shortSessionExact.initialWeight;
          dishData.currentWeight = shortSessionExact.currentWeight;
          const factorExact = displayWExact / 100;
          dishData.actualNutrition = displayWExact > 0 ? {
            calories: Math.round(dishData.nutritionPer100g.calories * factorExact * 10) / 10,
            protein: Math.round(dishData.nutritionPer100g.protein * factorExact * 10) / 10,
            fat: Math.round(dishData.nutritionPer100g.fat * factorExact * 10) / 10,
            carbohydrate: Math.round(dishData.nutritionPer100g.carbohydrate * factorExact * 10) / 10,
            dietaryFiber: Math.round(dishData.nutritionPer100g.dietaryFiber * factorExact * 10) / 10,
            calcium: Math.round(dishData.nutritionPer100g.calcium * factorExact * 10) / 10,
          } : dishData.actualNutrition;
          console.log('[BuffetExact] ★ 短SN补全 mealWeight: shortSn=' + shortSnExact + ', mealWeight=' + shortSessionExact.mealWeight + 'g');
        }
      }
      if (sn) await updateDeviceLastPull(supabaseUrl, supabaseAnonKey, dbQuery, sn);
      const deviceConfig = buildGetSettingDeviceConfig(dbDevice);
      console.log('[BuffetExact] ★ 返回成功: dish=' + (dishData ? dishData.dishName : 'null') + ' | mealWeight=' + (dishData ? dishData.mealWeight : 0) + 'g | shortSn=' + (shortSnExact || '(none)'));
      // ★★★ [DEVICE-INTEG] 设备对接核心日志：营养+重量数据
      console.log('[DEVICE-INTEG] [traceId=' + freezeTraceId + '] get-main-device OK | sn=' + (sn || '(none)') + ' | dish=' + (dishData ? dishData.dishName : 'null'));
      if (dishData) {
        console.log('[DEVICE-INTEG] [traceId=' + freezeTraceId + ']   initialWeight=' + dishData.initialWeight + ' | currentWeight=' + dishData.currentWeight + ' | mealWeight=' + dishData.mealWeight + ' | 每100g热量=' + dishData.nutritionPer100g.calories);
        console.log('[DEVICE-INTEG] [traceId=' + freezeTraceId + ']   actualNutrition=' + JSON.stringify(dishData.actualNutrition));
      }
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] dishData=' + JSON.stringify(dishData).substring(0, 500));
      const frontendData = buildFrontendCompatDishResponse(dishData, dbDevice);
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] frontendData dishes=' + (frontendData.dishes ? frontendData.dishes.length : 0) + ', deviceConfig fields=' + Object.keys(frontendData.deviceConfig).length);
      console.log('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] ═══ get-main-device 响应结束 ═══');
      if (!res.headersSent) res.json({ code: 10000, msg: '成功', data: frontendData });
    } catch (err) {
      console.error('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] ★★★ get-main-device 异常! ' + err.message);
      console.error('[FREEZE-DEBUG] [traceId=' + freezeTraceId + '] 堆栈: ' + (err.stack || '无堆栈'));
      console.error('[BuffetExact] ★★★ 未捕获异常: ' + err.message + '\n' + (err.stack || ''));
      if (!res.headersSent) res.json({ code: 10000, msg: '成功', data: { dishes: [] } });
    }
  });

  // ═══ 新版 meal-current 路由（与 get-main-device 逻辑一致）═══
  app.get('/api/scale/meal-current', async (req, res) => {
    const traceId = 'mealcur_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    try {
      const sn = resolveDeviceSn(req, dbQuery);
      console.log('[MealCurrent] [traceId=' + traceId + '] 被调用 | sn=' + (sn || '(none)'));
      let dishes = await fetchTodayDishNutrition(supabaseUrl, supabaseAnonKey, dbQuery);
      // ★ 防止撑爆硬件：今日无菜品时不拉全量
      if (!dishes) dishes = [];
      const dishDataMc = dishes.length > 0 ? buildMainDeviceResponse(dishes[0], sn) : null;
      console.log('[MealCurrent] [traceId=' + traceId + '] 返回: dish=' + (dishDataMc ? dishDataMc.dishName : 'null') + ' | mealWeight=' + (dishDataMc ? dishDataMc.mealWeight : 0));
      const frontendDataMc = buildFrontendCompatDishResponse(dishDataMc, null);
      res.json({ code: 10000, msg: 'success', data: frontendDataMc });
    } catch (err) {
      console.error('[MealCurrent] [traceId=' + traceId + '] 异常: ' + err.message);
      res.json({ code: 10000, msg: 'success', data: {} });
    }
  });

  app.all('/tengyun-api/api/v4/device/common/person/info-list', (req, res) => { res.json({ code: 10000, msg: '成功', data: [] }); });
  app.all('/tengyun-api/api/v4/android/sync-balance', (req, res) => { res.json({ code: 10000, msg: '成功', data: [] }); });
  app.post('/tengyun-api/api/v4/device/common/nutrition/get-normal-ingest', (req, res) => { res.json({ code: 0, msg: 'success', data: { nutrients: [] } }); });
  app.all('/api/v4/device/common/base/config', (req, res) => { res.json({ systemCardInfo: { cardCountry: 0, cardProvin: 0, cardCity: 0, cardCounty: 0, cardIntegr: 0, cardCustomer: 0, cardAlgorithm: 0, cardSector1: 0, cardSector2: 0, cardSector3: 0, cardSector4: 0, cardSector5: 0, cardType: 0, checkSector: 0, time: 0 }, deviceInfoVO: { canteenId: 0, shopstallId: 0, deviceNum: resolveDeviceSn(req, dbQuery) || '', deviceName: resolveDeviceSn(req, dbQuery) || '', recipeId: 0, recipeList: [], time: 0 }, extraParams: {} }); });
  app.all('/api/v4/device/common/menu/recipe-detail', async (req, res) => {
    const products = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, 'all', '');
    const cm = getCurrentMealType();
    const typeMap = {};
    products.forEach(item => { const tn = (item.tags && item.tags[0]) || item.category || '默认'; if (!typeMap[tn]) typeMap[tn] = []; typeMap[tn].push(item); });
    const typeList = Object.entries(typeMap).map(([tn, items], ti) => ({ typeId: ti + 1, typeName: tn, typeDetail: items.map((item, idx) => ({ baseDishesId: Number(item.id) || (100000 + idx), mealType: 1, productName: item.name || item.dishName || '', imageUrl: item.imageUrl || item.imgUrl || '', calories: Number(item.calories) || 0, protein: Number(item.protein) || 0, fat: Number(item.fat) || 0, carbohydrate: Number(item.carbohydrate) || 0, dietaryFiber: Number(item.fiber) || 0, labelList: item.tags || [], tasteList: item.tasteList || [], dishesDetailList: [{ dishesId: Number(item.id) || (100000 + idx), dishesName: item.name || item.dishName || '', prefPrice: Math.round((Number(item.price) || 0) * 100), salePrice: Math.round((Number(item.price) || 0) * 100), originalPrice: Math.round((Number(item.price) || 0) * 100), salesMode: 2, weight: 0 }] })) }));
    res.json([{ detailId: 0, intervalId: cm, uptime: new Date().toISOString(), intervalName: getMealNameByType(cm) || '午餐', intervalType: 0, typeList }]);
  });
  app.all('/api/v4/device/common/menu/dishes/add/to-recipe', (req, res) => {
    const b = req.body || {}; const content = b.content || {};
    const intervalId = Number(content.intervalId || b.intervalId || 1);
    const applyDate = String(content.applyDate || b.applyDate || new Date().toISOString().slice(0, 10));
    const detailList = Array.isArray(content.detailList) ? content.detailList : [];
    if (dbQuery && detailList.length > 0) {
      try {
        for (const detail of detailList) {
          const dishesId = Number(detail.dishesId || 0); let dn = '';
          if (dishesId) { const pr = dbQuery('SELECT name FROM product_items WHERE id = ?', [dishesId]); if (pr && pr.length > 0) dn = pr[0].name; }
          if (!dn) continue;
          const mt = intervalId === 0 ? 0 : intervalId === 2 ? 2 : 1;
          const al = dbQuery('SELECT id FROM dish_nutrition WHERE dish_name = ? AND menu_date = ?', [dn, applyDate]);
          if (!al || al.length === 0) { dbQuery("INSERT INTO dish_nutrition (dish_name, menu_date, meal_type, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))", [dn, applyDate, mt]); }
        }
      } catch (e) { }
    }
    return res.json({ code: 10000, msg: '成功', data: null });
  });

  app.all('/tengyun-api/api/v4/device/common/menu/dishes/add', (req, res) => {
    const b = req.body || {}; const content = b.content || {};
    const dn = String(content.dishesName || b.dishesName || '').trim();
    if (!dn) return res.json({ code: 10000, msg: '菜品名称不能为空', data: null });
    let id = null;
    if (dbQuery) {
      try {
        const ex = dbQuery('SELECT id FROM product_items WHERE name = ?', [dn]);
        if (ex && ex.length > 0) { id = ex[0].id; dbQuery('UPDATE product_items SET price = ?, updated_at = ? WHERE id = ?', [(Number(content.price || 0)) / 100, new Date().toISOString(), id]); }
        else { dbQuery("INSERT INTO product_items (name, status, pricing_mode, currency, price, stock, media, created_at, updated_at) VALUES (?, 'active', 0, 'CNY', ?, 999, ?, datetime('now'), datetime('now'))", [dn, (Number(content.price || 0)) / 100, content.picUrl ? JSON.stringify([{ url: content.picUrl, type: 'image' }]) : '[]']); const nr = dbQuery('SELECT id FROM product_items WHERE name = ? ORDER BY id DESC LIMIT 1', [dn]); if (nr && nr.length > 0) id = nr[0].id; }
      } catch (e) { }
    }
    return res.json({ code: 10000, msg: '成功', data: id ? { dishesId: id, dishesName: dn } : null });
  });

  app.all('/tengyun-api/api/v4/device/common/menu/dishes/add/to-recipe', (req, res) => {
    const b = req.body || {}; const content = b.content || {};
    const intervalId = Number(content.intervalId || b.intervalId || 1);
    const applyDate = String(content.applyDate || b.applyDate || new Date().toISOString().slice(0, 10));
    const detailList = Array.isArray(content.detailList) ? content.detailList : [];
    if (dbQuery && detailList.length > 0) {
      try {
        for (const detail of detailList) {
          const dishesId = Number(detail.dishesId || 0); let dn = '';
          if (dishesId) { const pr = dbQuery('SELECT name FROM product_items WHERE id = ?', [dishesId]); if (pr && pr.length > 0) dn = pr[0].name; }
          if (!dn) continue;
          const mt = intervalId === 0 ? 0 : intervalId === 2 ? 2 : 1;
          const al = dbQuery('SELECT id FROM dish_nutrition WHERE dish_name = ? AND menu_date = ?', [dn, applyDate]);
          if (!al || al.length === 0) { dbQuery("INSERT INTO dish_nutrition (dish_name, menu_date, meal_type, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))", [dn, applyDate, mt]); }
        }
      } catch (e) { }
    }
    return res.json({ code: 10000, msg: '成功', data: null });
  });

  app.all('/tengyun-api/api/v4/device/menuai/dishes/picture/register/detail/page', async (req, res) => {
    const b = req.body || {}; const content = b.content || {};
    const c = Number(content.current || b.current || 1); const s = Number(content.size || b.size || 10);
    let products = await fetchTodayDishNutrition(supabaseUrl, supabaseAnonKey, dbQuery);
    if (!products) products = await fetchActiveProductItems(supabaseUrl, supabaseAnonKey, dbQuery, 'all', '');
    const total = products.length; const si = (c - 1) * s; const pi = products.slice(si, si + s);
    const picDishes = products.filter(item => !!(item.imageUrl || item.imgUrl || item.foodImage)).length;
    const records = pi.map((item, idx) => {
      const hasPic = !!(item.imageUrl || item.imgUrl || item.foodImage);
      return { dishesId: Number(item.id) || (100000 + si + idx), dishesNum: String(item.id || ''), dishesName: item.name || item.dishName || '', dishesPrice: Math.round((Number(item.price) || 0) * 100), pictureNum: hasPic ? 1 : 0, registerState: 1, pictureState: hasPic ? 1 : 0 };
    });
    res.json({ code: 10000, msg: '成功', data: { searchType: 2, registerStateData: { allDishesNum: total, nonRegisterDishesNum: 0, registerDishesNum: total, nonPictureDishesNum: total - picDishes, pictureDishesNum: picDishes }, dishesTypeList: [], dishesPage: { records, total, size: s, current: c } } });
  });

  // ═══ v4 config ═══
  app.all('/api/v4/device/common/base/updatemetadata', (req, res) => { res.json({ code: 10000, msg: '成功', data: null }); });
  app.all('/api/v4/device/common/base/addbyqr', (req, res) => {
    const b = req.body || {}; const content = b.content || {};
    const deviceSn = content.deviceSn || req.headers['machine-sn'] || '';
    if (deviceSn && dbQuery) {
      try {
        const ex = dbQuery('SELECT id FROM tray_display_devices WHERE sn = ?', [deviceSn]);
        if (!ex || ex.length === 0) { dbQuery('INSERT OR IGNORE INTO tray_display_devices (name, sn, hw_key, status, device_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [deviceSn, deviceSn, '', 'online', 'display_scale', new Date().toISOString(), new Date().toISOString()]); dbQuery('UPDATE tray_display_devices SET status = ?, updated_at = ? WHERE sn = ?', ['online', new Date().toISOString(), deviceSn]); }
        else { dbQuery('UPDATE tray_display_devices SET status = ?, updated_at = ? WHERE sn = ?', ['online', new Date().toISOString(), deviceSn]); }
      } catch (e) { }
    }
    res.json({ code: 10000, msg: '成功', data: null });
  });
  app.all('/api/v4/device/common/base/list-enable-qrcode-pay-type', (req, res) => { res.json([]); });
  app.all('/api/v4/device/common/base/self-interval-config', (req, res) => { res.json([]); });
  app.all('/api/v4/device/cpjgateway/getchildandrecipeBySn', async (req, res) => { res.json({ code: 10000, msg: '成功', data: { gatewaySn: '', children: [], childCount: 0 } }); });

  // ═══ 计量主机上传消费流水 ═══
  // POST /api/v4/device/buffet/upweightmenu
  // 自助餐计量主机取餐后上报消费记录（不记录价格）
  function handleUpweightMenu(req, res) {
    const body = req.body || {};
    const content = (typeof body.content === 'string' ? (() => { try { return JSON.parse(body.content); } catch { return {}; } })() : body.content) || {};
    const deviceSn = content.deviceSn || body.deviceSn || req.headers['machine-sn'] || '';
    const plateSerialNum = content.plateSerialNum || '';
    const menuId = Number(content.menuId || 0);
    const menuDetailId = Number(content.menuDetailId || 0);
    const menuName = content.menuName || '';
    const menuNo = Number(content.menuNo || 0);
    const weight = Number(content.weight || 0);
    const menuWeigh = Number(content.menuWeigh || 0);
    const quantity = Number(content.quantity || 1);
    const salseMode = Number(content.salseMode || 1);
    const custId = Number(content.custId || 0);
    const macNo = content.macNo || '';
    const macSerial = content.macSerial || '';
    const macTime = content.macTime || '';
    const macOrdId = content.macOrdId || '';
    const ifOnline = Number(content.ifOnline || 0);
    const bindType = Number(content.bindType || 1);

    const recordId = 'bf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = new Date().toISOString();
    // ★ 北京时间（UTC+8），用于 pickup_time 字段，避免凌晨0-8点日期跨天
    const nowBeijing = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('Z', '+08:00');

    console.log('[ScaleInbound-Upweight] ━━━ 入库消费流水上报 ━━━');
    console.log('[ScaleInbound-Upweight] recordId: ' + recordId);
    console.log('[ScaleInbound-Upweight] deviceSn: ' + deviceSn + ', plateSerialNum: ' + plateSerialNum);
    console.log('[ScaleInbound-Upweight] menuId: ' + menuId + ', menuDetailId: ' + menuDetailId + ', menuName: ' + menuName + ', menuNo: ' + menuNo);
    console.log('[ScaleInbound-Upweight] weight: ' + weight + ', menuWeigh: ' + menuWeigh + ', quantity: ' + quantity + ', salseMode: ' + salseMode);
    console.log('[ScaleInbound-Upweight] custId: ' + custId + ', macNo: ' + macNo + ', macSerial: ' + macSerial + ', macTime: ' + macTime);
    console.log('[ScaleInbound-Upweight] ifOnline: ' + ifOnline + ', bindType: ' + bindType);

    // ★★★ 缓存重量到全局缓存（供 VectorMaterial 等接口使用）
    if (weight > 0) {
      if (deviceSn) cacheDeviceWeight(deviceSn, weight, 'kg', 'http-upweight');
      if (macNo) cacheDeviceWeight(macNo, weight, 'kg', 'http-upweight');
      if (macSerial) cacheDeviceWeight(macSerial, weight, 'kg', 'http-upweight');
      const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
      if (clientIP) cacheDeviceWeight(clientIP, weight, 'kg', 'http-upweight');
    }

    // 写入 SQLite (buffet_consumption_records)
    if (dbQuery) {
      try {
        // 确保表存在
        dbQuery('CREATE TABLE IF NOT EXISTS buffet_consumption_records ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'record_id TEXT NOT NULL UNIQUE, '
          + 'device_sn TEXT, '
          + 'plate_serial_num TEXT, '
          + 'menu_id INTEGER, '
          + 'menu_detail_id INTEGER, '
          + 'menu_name TEXT, '
          + 'menu_no INTEGER, '
          + 'weight REAL, '
          + 'menu_weigh REAL, '
          + 'quantity INTEGER, '
          + 'salse_mode INTEGER, '
          + 'cust_id INTEGER, '
          + 'mac_no TEXT, '
          + 'mac_serial TEXT, '
          + 'mac_time TEXT, '
          + 'mac_ord_id TEXT, '
          + 'if_online INTEGER, '
          + 'bind_type INTEGER, '
          + 'created_at TEXT'
          + ')', []);

        dbQuery(
          'INSERT INTO buffet_consumption_records (record_id, device_sn, plate_serial_num, menu_id, menu_detail_id, menu_name, menu_no, weight, menu_weigh, quantity, salse_mode, cust_id, mac_no, mac_serial, mac_time, mac_ord_id, if_online, bind_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [recordId, deviceSn, plateSerialNum, menuId, menuDetailId, menuName, menuNo, weight, menuWeigh, quantity, salseMode, custId, macNo, macSerial, macTime, macOrdId, ifOnline, bindType, now]
        );

        console.log('[BuffetUpweight] ✓ SQLite buffet_consumption_records 写入成功: ' + recordId);
      } catch (e) {
        console.warn('[BuffetUpweight] SQLite buffet_consumption_records 写入失败: ' + e.message);
      }
    }

    // ── 同时写入 tray_pickup_logs，让「取餐明细记录」页面能显示 ──
    // ★★★ 智能解析菜名：payload.menuName → 设备站点 → menuId查菜品库 → 电子屏选菜 → 未知菜品
    const httpDishInfo = resolveDishNameSmart(dbQuery, { machineSn: deviceSn, deviceSn, menuId, menuName });
    console.log('[ScaleInbound-Upweight] ★ 菜名解析: dishName=' + httpDishInfo.dishName + ', category=' + httpDishInfo.category + ', stationId=' + httpDishInfo.stationId + ', stationCode=' + httpDishInfo.stationCode + ', resolved=' + httpDishInfo.resolved);
    cacheMenuIdDish(dbQuery, deviceSn, menuId, httpDishInfo.dishName, httpDishInfo.category);
    const stationCode = httpDishInfo.stationCode || deviceSn || macNo || 'AUTO-' + plateSerialNum || 'AUTO-' + recordId.slice(-6);
    const dishName = httpDishInfo.dishName || menuName || '未知菜品';
    const resolvedCategory = httpDishInfo.category || '荤菜';
    const resolvedStationId = httpDishInfo.stationId || null;
    const pickupWeight = Number(weight || menuWeigh || 0);
    const weightBefore = Number(menuWeigh || weight || 0);
    const weightAfter = Math.max(0, weightBefore - pickupWeight);
    const portions = Number(quantity || 1);
    // ★★★ person_id：custId 优先，其次其他身份字段
    const personId = (() => {
      if (Number(custId || 0) > 0) return String(custId);
      const candidates = [content.personId, content.personNo, content.cardNo, content.userId];
      for (const c of candidates) {
        if (c != null && String(c).trim() && String(c).trim() !== '0') return String(c).trim();
      }
      return '';
    })();
    // ★★★ 使用北京时间 UTC+8，而非 new Date().getHours() 本地时间
    const beijingHourUpweight = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
    const mealType = ['早餐', '午餐', '晚餐'][beijingHourUpweight < 10 ? 0 : beijingHourUpweight < 16 ? 1 : 2];
    console.log('[ScaleInbound-Upweight] 写入参数: stationCode=' + stationCode + ', dish=' + dishName + ', cat=' + resolvedCategory + ', meal=' + mealType + ', pickupWeight=' + pickupWeight + ', before=' + weightBefore + ', after=' + weightAfter + ', personId=' + (personId || '(空)') + ', time=' + pickupTime);
    // 用 macTime 或当前时间作为 pickup_time
    const pickupTime = macTime
      ? (macTime.includes('T') ? macTime : macTime.replace(' ', 'T') + '+08:00')
      : nowBeijing;

    // 异步写入 tray_pickup_logs（不阻塞响应）
    if (dbQuery) {
      try {
        // 先确认 tray_pickup_logs 表存在（SQLite）
        dbQuery('CREATE TABLE IF NOT EXISTS tray_pickup_logs ('
          + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
          + 'station_id INTEGER, '
          + 'station_code TEXT, '
          + 'dish_name TEXT, '
          + 'category TEXT, '
          + 'meal_type TEXT, '
          + 'pickup_time TEXT, '
          + 'weight_before REAL, '
          + 'weight_after REAL, '
          + 'pickup_weight REAL, '
          + 'pickup_portions INTEGER, '
          + 'person_id TEXT, '
          + 'notes TEXT, '
          + 'created_at TEXT, '
          + 'calories REAL, '
          + 'protein REAL, '
          + 'fat REAL, '
          + 'carbs REAL, '
          + 'source TEXT'
          + ')', []);

        dbQuery(
          'INSERT INTO tray_pickup_logs '
          + '(station_id, station_code, dish_name, category, meal_type, pickup_time, weight_before, weight_after, pickup_weight, pickup_portions, person_id, notes, created_at, calories, protein, fat, carbs, source) '
          + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            resolvedStationId,
            stationCode,
            dishName,
            resolvedCategory,
            mealType,
            pickupTime,
            weightBefore,
            weightAfter,
            pickupWeight,
            portions,
            personId,
            '计量主机: ' + (macSerial || macNo || deviceSn),
            now,
            0, 0, 0, 0,
            'scale'
          ]
        );
        console.log('[BuffetUpweight] ✓ SQLite tray_pickup_logs 写入成功: ' + recordId);
      } catch (e) {
        console.warn('[BuffetUpweight] SQLite tray_pickup_logs 写入失败: ' + e.message);
      }
    }

    // 同时异步写入云端 tray_pickup_logs（Supabase）
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
      if (supabaseUrl && supabaseKey) {
        const supa = createClient(supabaseUrl, supabaseKey);
        supa.from('tray_pickup_logs').insert({
          station_id: resolvedStationId,
          station_code: stationCode,
          dish_name: dishName,
          category: resolvedCategory,
          meal_type: mealType,
          pickup_time: pickupTime,
          weight_before: weightBefore,
          weight_after: weightAfter,
          pickup_weight: pickupWeight,
          pickup_portions: portions,
          person_id: personId,
          notes: '计量主机: ' + (macSerial || macNo || deviceSn),
          calories: 0,
          protein: 0,
          fat: 0,
          carbs: 0,
          source: 'scale',
        }).then(({ error }) => {
          if (error) {
            console.warn('[BuffetUpweight] Supabase tray_pickup_logs 写入失败:', error.message);
          } else {
            console.log('[BuffetUpweight] ✓ Supabase tray_pickup_logs 写入成功');
          }
        });
      }
    } catch (e) {
      console.warn('[BuffetUpweight] Supabase 写入异常:', e.message);
    }

    return res.json({ code: 0, msg: '', data: null });
  }

  app.post('/api/v4/device/buffet/upweightmenu', handleUpweightMenu);
  // ★ 乐牛设备可能发 yunshitang 前缀的路径，必须同样处理
  app.post('/yunshitang/api/v4/device/buffet/upweightmenu', handleUpweightMenu);
  // ★ 腾云前缀兜底
  app.post('/tengyun-api/api/v4/device/buffet/upweightmenu', handleUpweightMenu);

}