import { getMqttSensorLogs, mqttSensorLogs } from './mqtt-broker.js';
import { keepDeviceConfig, saveKeepDeviceConfig, mealPeriodConfig, saveMealPeriodConfig, saveScaleOperators, scaleOperators, tokenMap, generateToken, pickupConfig, savePickupConfig } from './config-store.js';
import crypto from 'crypto';

// ★ 明文密码 → MD5+base64 哈希（与电子秤发送格式一致）
function hashPassword(plainPw) {
  if (!plainPw) return '';
  // MD5 base64 固定 24 字符，长度匹配且像 base64 的视为已哈希
  if (plainPw.length === 24 && /^[A-Za-z0-9+/=]+$/.test(plainPw)) return plainPw;
  return crypto.createHash('md5').update(plainPw).digest('base64');
}

export function mountApiRoutes(app, dbQuery, state, port, userDataPath) {
  // ─── 健康检查 ───
  app.get('/api/health', (req, res) => {
    res.json({ code: 0, msg: 'ok', httpPort: state.httpPort || port, mqttPort: state.mqttPort || 1883 });
  });

  // ★ 连通性诊断端点：不入库、不登录、不查数据库，纯验证网络可达
  app.get('/api/ping', (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    res.json({
      code: 0,
      msg: 'pong',
      data: {
        clientIp: String(clientIp).replace('::ffff:', ''),
        serverTime: new Date().toISOString(),
        httpPort: state.httpPort || port,
        message: '如果你能看到这条JSON，说明你的设备和本地服务器之间的网络是通的。入口秤请确认登录URL为 /api/auth/scale-operator/login',
      }
    });
  });

  // ─── 大屏配置同步 API ───
  app.get('/api/display-config', (req, res) => {
    const configKey = req.query.key || 'display_config';
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      const rows = dbQuery('SELECT config_data FROM display_configs WHERE config_key = ? ORDER BY id DESC LIMIT 1', [configKey]);
      if (rows && rows.length > 0) {
        let cd = rows[0].config_data;
        if (typeof cd === 'string') { try { cd = JSON.parse(cd); } catch { } }
        return res.json({ code: 0, msg: 'ok', data: { config_data: cd } });
      }
      return res.json({ code: 0, msg: 'ok', data: null });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.post('/api/display-config', (req, res) => {
    const { config_key, config_data } = req.body || {};
    if (!config_key || !config_data) return res.status(400).json({ code: 400, msg: '缺少 config_key 或 config_data', data: null });
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      const configJson = typeof config_data === 'string' ? config_data : JSON.stringify(config_data);
      const existing = dbQuery('SELECT id FROM display_configs WHERE config_key = ?', [config_key]);
      if (existing && existing.length > 0) {
        dbQuery('UPDATE display_configs SET config_data = ?, updated_at = ? WHERE config_key = ?', [configJson, new Date().toISOString(), config_key]);
      } else {
        dbQuery('INSERT INTO display_configs (config_key, config_data, updated_at) VALUES (?, ?, ?)', [config_key, configJson, new Date().toISOString()]);
      }
      return res.json({ code: 0, msg: 'ok', data: null });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  // ─── 诊断端点 ───
  app.get('/api/debug/today-dishes', (req, res) => {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    const ts = d.toISOString().slice(0, 10);
    if (!dbQuery) return res.json({ code: 0, msg: '数据库未就绪', data: { today: ts, localCount: 0, rows: [] } });
    try {
      const totalRes = dbQuery('SELECT COUNT(*) as cnt FROM dish_nutrition', []);
      const todayRes = dbQuery('SELECT COUNT(*) as cnt FROM dish_nutrition WHERE menu_date = ?', [ts]);
      const lr = dbQuery('SELECT menu_date FROM dish_nutrition ORDER BY menu_date DESC LIMIT 1', []);
      const rows = dbQuery('SELECT id, dish_name, menu_date, meal_type FROM dish_nutrition ORDER BY menu_date DESC LIMIT 20', []);
      res.json({ code: 0, msg: 'ok', data: { today: ts, totalCount: totalRes?.[0]?.cnt || 0, todayCount: todayRes?.[0]?.cnt || 0, latestDate: lr?.[0]?.menu_date || 'none', rows: rows || [] } });
    } catch (err) { res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.get('/api/debug/face-tokens', (req, res) => {
    if (!dbQuery) return res.json({ code: 0, msg: '数据库未就绪', data: { users: [], tableExists: false, faceTokenColumnExists: false } });
    try {
      let fce = false;
      try { fce = (dbQuery("PRAGMA table_info(keep_users)", []) || []).some(c => c.name === 'face_token'); } catch (e) { }
      const rows = dbQuery('SELECT id, login_name, nick_name, is_admin, face_token FROM keep_users ORDER BY id', []);
      const users = (rows || []).map(r => ({ id: r.id, login_name: r.login_name || '', nick_name: r.nick_name || '', is_admin: r.is_admin || 0, face_token: r.face_token || '', has_face: !!(r.face_token && r.face_token.trim()) }));
      const bc = users.filter(u => u.has_face).length;
      res.json({ code: 0, msg: 'ok', data: { users, total: users.length, boundCount: bc, unboundCount: users.length - bc, faceTokenColumnExists: fce } });
    } catch (err) { res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.get('/api/debug/products', (req, res) => {
    if (!dbQuery) return res.json({ code: 0, msg: '数据库未就绪', data: { total: 0, active: 0, items: [] } });
    try {
      const tr = dbQuery('SELECT COUNT(*) as cnt FROM product_items', []);
      const ar = dbQuery("SELECT COUNT(*) as cnt FROM product_items WHERE status = 'active'", []);
      const items = dbQuery('SELECT id, name, status, category_id, price FROM product_items ORDER BY id LIMIT 50', []);
      res.json({ code: 0, msg: 'ok', data: { total: tr?.[0]?.cnt || 0, active: ar?.[0]?.cnt || 0, items: items || [] } });
    } catch (err) { res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.get('/api/debug/device-dishes', (req, res) => {
    const sn = req.query.sn || '';
    if (!dbQuery) return res.json({ code: 0, msg: '数据库未就绪', data: null });
    try {
      const devices = sn ? dbQuery('SELECT id, name, sn, bind_mode, bind_value, station_id, status FROM tray_display_devices WHERE sn = ?', [sn]) : dbQuery('SELECT id, name, sn, bind_mode, bind_value, station_id, status FROM tray_display_devices LIMIT 20', []);
      const result = (devices || []).map(d => {
        let rbm = d.bind_mode || 'all'; let rbv = d.bind_value || ''; let si = null; let md = [];
        if (d.bind_mode === 'station' && d.station_id) {
          const sr = dbQuery('SELECT id, name, product_item_id, dish_name FROM tray_stations WHERE id = ?', [d.station_id]);
          if (sr && sr.length > 0) { si = sr[0]; const pid = sr[0].product_item_id; if (pid) { let pr = dbQuery('SELECT id, name FROM product_items WHERE id = ?', [pid]); if ((!pr || pr.length === 0) && sr[0].dish_name) pr = dbQuery('SELECT id, name FROM product_items WHERE name = ?', [sr[0].dish_name]); if (pr && pr.length > 0) { md = pr; rbm = 'single'; rbv = String(pr[0].id); } } }
        }
        return { ...d, resolved_bind_mode: rbm, resolved_bind_value: rbv, station: si, matched_dishes: md };
      });
      res.json({ code: 0, msg: 'ok', data: { devices: result } });
    } catch (err) { res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.get('/api/debug/sensor-match', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      let devices = [];
      try { devices = dbQuery("SELECT id, device_name, device_sn, gateway_ip, gateway_sn, communication_address FROM devices", []); } catch (e) { devices = dbQuery("SELECT id, device_name, device_sn, gateway_sn, communication_address FROM devices", []); }
      const readings = dbQuery("SELECT DISTINCT sensor_id, MAX(temp) as temp, MAX(humidity) as humidity, MAX(recorded_at) as recorded_at, MAX(source) as source FROM environment_readings GROUP BY sensor_id ORDER BY MAX(recorded_at) DESC LIMIT 30", []);
      let bindings = [];
      try { bindings = dbQuery("SELECT gateway_sn, device_sn, device_name, zone FROM gateway_sensor_bindings", []); } catch (e) { }
      const dss = new Set((devices || []).map(d => d.device_sn));
      const rss = new Set((readings || []).map(r => r.sensor_id));
      const matched = [...dss].filter(s => rss.has(s));
      res.json({ code: 0, msg: 'ok', data: { totalDevices: (devices || []).length, totalReadings: (readings || []).length, totalBindings: (bindings || []).length, matchedCount: matched.length, matched, unmatchedDevices: [...dss].filter(s => !rss.has(s)), unmatchedReadings: [...rss].filter(s => !dss.has(s)), devices: (devices || []).slice(0, 20), readings: (readings || []).slice(0, 20), bindings: (bindings || []).slice(0, 20) } });
    } catch (e) { res.status(500).json({ code: 500, msg: e.message, data: null }); }
  });

  app.get('/api/sensor/mqtt-logs', (req, res) => {
    const since = parseInt(req.query.since || '0', 10);
    const logs = getMqttSensorLogs(since);
    res.json({ code: 0, msg: 'ok', data: { logs, total: mqttSensorLogs.length } });
  });

  // ─── 留样柜设备规则配置 ───
  app.all('/rule_config/get_key', (req, res) => {
    const key = (req.query || {}).key || (req.body || {}).key || '';
    const value = keepDeviceConfig[key];
    return res.json({ code: 1, msg: 'success', result: value !== undefined ? value : '0' });
  });

  app.all('/rule_config/get', (req, res) => {
    const km = Number(keepDeviceConfig.keepTimeout) || 48 * 3600 * 1000;
    return res.json({ code: 1, msg: 'success', result: { maxTemp: Number(keepDeviceConfig.maxTemp) || 8, minTemp: Number(keepDeviceConfig.minTemp) || 0, keepTime: Math.round(km / 3600 / 1000), keepWeight: Number(keepDeviceConfig.keepWeight) || 125, warningTemp: Number(keepDeviceConfig.warningTemp) || 10, deviceUITemplate: Number(keepDeviceConfig.deviceUITemplate) || 1, keepTimeout: km } });
  });

  app.all('/rule_config/save', (req, res) => {
    const b = req.body || {};
    if (b.maxTemp !== undefined) keepDeviceConfig.maxTemp = String(b.maxTemp);
    if (b.minTemp !== undefined) keepDeviceConfig.minTemp = String(b.minTemp);
    if (b.keepTime !== undefined) keepDeviceConfig.keepTimeout = String(Number(b.keepTime) * 3600 * 1000);
    if (b.keepTimeout !== undefined) keepDeviceConfig.keepTimeout = String(b.keepTimeout);
    if (b.keepWeight !== undefined) keepDeviceConfig.keepWeight = String(b.keepWeight);
    if (b.warningTemp !== undefined) keepDeviceConfig.warningTemp = String(b.warningTemp);
    if (b.deviceUITemplate !== undefined) keepDeviceConfig.deviceUITemplate = String(b.deviceUITemplate);
    saveKeepDeviceConfig(userDataPath);
    return res.json({ code: 1, msg: 'success', result: null });
  });

  app.get('/api/keep/config', (req, res) => {
    const km = Number(keepDeviceConfig.keepTimeout) || 48 * 3600 * 1000;
    return res.json({ code: 0, msg: 'ok', data: { maxTemp: Number(keepDeviceConfig.maxTemp) || 8, minTemp: Number(keepDeviceConfig.minTemp) || 0, keepTime: Math.round(km / 3600 / 1000), keepWeight: Number(keepDeviceConfig.keepWeight) || 125, warningTemp: Number(keepDeviceConfig.warningTemp) || 10 } });
  });

  app.post('/api/keep/config', (req, res) => {
    const b = req.body || {};
    if (b.maxTemp !== undefined) keepDeviceConfig.maxTemp = String(b.maxTemp);
    if (b.minTemp !== undefined) keepDeviceConfig.minTemp = String(b.minTemp);
    if (b.keepTime !== undefined) keepDeviceConfig.keepTimeout = String(Number(b.keepTime) * 3600 * 1000);
    if (b.keepWeight !== undefined) keepDeviceConfig.keepWeight = String(b.keepWeight);
    if (b.warningTemp !== undefined) keepDeviceConfig.warningTemp = String(b.warningTemp);
    saveKeepDeviceConfig(userDataPath);
    return res.json({ code: 0, msg: 'ok', data: null });
  });

  // ─── 餐段时间配置 ───
  app.get('/api/meal-period-config', (req, res) => {
    return res.json({ code: 0, msg: 'ok', data: mealPeriodConfig });
  });

  app.post('/api/meal-period-config', (req, res) => {
    const b = req.body || {};
    if (Array.isArray(b) && b.length > 0) { mealPeriodConfig.splice(0, mealPeriodConfig.length, ...b); }
    else if (b.periods && Array.isArray(b.periods)) { mealPeriodConfig.splice(0, mealPeriodConfig.length, ...b.periods); }
    else { return res.status(400).json({ code: 400, msg: '请提供餐段时间配置数组', data: null }); }
    saveMealPeriodConfig(userDataPath);
    return res.json({ code: 0, msg: 'ok', data: mealPeriodConfig });
  });

  // ─── 取餐判定参数配置 ───
  app.get('/api/pickup-config', (req, res) => {
    return res.json({ code: 0, msg: 'ok', data: {
      stableSeconds: Number(pickupConfig.stableSeconds) || 3,
      minDropGrams: Number(pickupConfig.minDropGrams) || 50,
    } });
  });

  app.post('/api/pickup-config', (req, res) => {
    const b = req.body || {};
    if (b.stableSeconds !== undefined) {
      const s = Number(b.stableSeconds);
      if (!isNaN(s) && s > 0 && s <= 300) pickupConfig.stableSeconds = s;
    }
    if (b.minDropGrams !== undefined) {
      const m = Number(b.minDropGrams);
      if (!isNaN(m) && m > 0 && m <= 5000) pickupConfig.minDropGrams = m;
    }
    savePickupConfig(userDataPath);
    return res.json({ code: 0, msg: 'ok', data: {
      stableSeconds: Number(pickupConfig.stableSeconds) || 3,
      minDropGrams: Number(pickupConfig.minDropGrams) || 50,
    } });
  });

  // ─── 公开菜品 API（含自定义字段）───
  app.get('/api/public/product-items-full', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      // 获取活跃商品
      let items = dbQuery("SELECT * FROM product_items WHERE status = 'active' ORDER BY id", []) || [];
      if (items.length === 0) items = dbQuery('SELECT * FROM product_items ORDER BY id', []) || [];
      // 获取分类映射
      const cats = dbQuery('SELECT id, name FROM product_categories', []) || [];
      const catMap = {};
      cats.forEach(c => { catMap[c.id] = c.name; });
      // 获取自定义字段映射
      const fields = dbQuery('SELECT id, name FROM product_custom_fields', []) || [];
      const fieldMap = {};
      const fieldIdMap = {};
      fields.forEach(f => { fieldMap[f.id] = f.name; fieldIdMap[f.name] = f.id; });
      // 获取所有自定义值
      const allCvs = dbQuery('SELECT product_id, field_id, value FROM product_custom_values', []) || [];
      const cvMap = {};
      allCvs.forEach(cv => {
        const fn = fieldMap[cv.field_id];
        if (!fn) return;
        if (!cvMap[cv.product_id]) cvMap[cv.product_id] = {};
        cvMap[cv.product_id][fn] = cv.value;
      });
      // 获取点赞数据
      const likes = dbQuery('SELECT dish_id, like_count FROM dish_likes', []) || [];
      const likeMap = {};
      likes.forEach(l => { likeMap[l.dish_id] = l.like_count || 0; });
      // 拼装结果
      const result = items.map(item => {
        let m = []; try { m = JSON.parse(item.media || '[]'); } catch { m = []; }
        const cvs = cvMap[item.id] || {};
        return {
          id: item.id,
          name: item.name,
          category: catMap[item.category_id] || '',
          img: m[0]?.url || '',
          price: Number(item.price) || 0,
          status: item.status || 'active',
          calories: Number(cvs.calories) || 0,
          protein: Number(cvs.protein) || 0,
          fat: Number(cvs.fat) || 0,
          carbs: Number(cvs.carbs) || 0,
          fiber: Number(cvs.fiber) || 0,
          method: cvs.method || '',
          nutrition: cvs.nutrition || '',
          contraindications: cvs.contraindications || '',
          likeCount: likeMap[item.id] || 0,
        };
      });
      return res.json({ code: 0, msg: 'ok', data: result });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: [] }); }
  });

  app.get('/api/public/product-items-images', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: {} });
    try {
      const rows = dbQuery('SELECT name, media FROM product_items', []);
      const map = {};
      (rows || []).forEach(r => { if (!map[r.name]) { try { const m = JSON.parse(r.media || '[]'); if (m[0]?.url) map[r.name] = m[0].url; } catch { } } });
      return res.json({ code: 0, msg: 'ok', data: map });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: {} }); }
  });

  app.get('/api/public/product-items', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      let items = dbQuery("SELECT * FROM product_items WHERE status = 'active' ORDER BY id", []) || [];
      if (items.length === 0) items = dbQuery('SELECT * FROM product_items ORDER BY id', []) || [];
      const cats = dbQuery('SELECT id, name FROM product_categories', []) || [];
      const cm = {}; cats.forEach(c => { cm[c.id] = c.name; });
      const result = items.map(item => { let m = []; try { m = JSON.parse(item.media || '[]'); } catch { m = []; } return { id: item.id, name: item.name, category: cm[item.category_id] || '', img: m[0]?.url || '', price: Number(item.price) || 0, calories: 0, status: item.status || 'active' }; });
      return res.json({ code: 0, msg: 'ok', data: result });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: [] }); }
  });

  app.get('/api/public/dish-order-records', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try { return res.json({ code: 0, msg: 'ok', data: dbQuery('SELECT id, dish_id, dish_name, category, created_at FROM dish_order_records', []) || [] }); }
    catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: [] }); }
  });

  // ─── 取餐记录公开 API ───
  app.get('/api/public/tray-pickup-logs', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      // ★ 将 tray_pickup_logs 与 tray_stations 关联，动态返回托盘当前绑定的真实菜品名称
      // ★ station_code 对应托盘的菜品可能已经更新，不应该展示快照里的旧名称
      const JOIN_SQL = `
        SELECT
          l.id, l.station_id, l.station_code,
          COALESCE(
            NULLIF(s.dish_name, ''), NULLIF(s.dish_name, '未命名菜品'),
            NULLIF(l.dish_name, ''), l.dish_name
          ) AS dish_name,
          COALESCE(NULLIF(s.category,''), l.category) AS category,
          l.meal_type, l.pickup_time,
          l.weight_before, l.weight_after, l.pickup_weight, l.pickup_portions,
          l.person_id, l.notes, l.source
        FROM tray_pickup_logs l
        LEFT JOIN tray_stations s ON l.station_id = s.id
      `;
      const date = req.query.date;
      if (date && date !== 'all') {
        const rows = dbQuery(JOIN_SQL + ' WHERE date(l.pickup_time) = ? ORDER BY l.pickup_time DESC', [date]);
        return res.json({ code: 0, msg: 'ok', data: rows || [] });
      }
      const rows = dbQuery(JOIN_SQL + ' ORDER BY l.pickup_time DESC', []);
      return res.json({ code: 0, msg: 'ok', data: rows || [] });
    }
    catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: [] }); }
  });

  // ─── 托盘设备公开 API（供 Electron 前端本地直连）───
  app.get('/api/public/tray-devices', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      const rows = dbQuery(
        `SELECT d.id as device_id, d.name as device_name, d.sn, d.hw_key, d.device_type, d.station_id,
                s.id as station_id, s.name as station_name, s.station_code, s.dish_name, s.category, s.tare_weight, s.hw_last_weight, s.hw_last_seen
         FROM tray_display_devices d
         LEFT JOIN tray_stations s ON d.station_id = s.id
         WHERE d.station_id IS NOT NULL`,
        []
      );
      return res.json({ code: 0, msg: 'ok', data: rows || [] });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: [] }); }
  });

  app.get('/api/public/dish-nutrition', (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      if (date === 'all') {
        return res.json({ code: 0, msg: 'ok', data: dbQuery('SELECT * FROM dish_nutrition ORDER BY id DESC', []) || [] });
      }
      return res.json({ code: 0, msg: 'ok', data: dbQuery('SELECT * FROM dish_nutrition WHERE menu_date = ? ORDER BY id', [date]) || [] });
    }
    catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: [] }); }
  });

  app.get('/api/public/dish-likes', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try { return res.json({ code: 0, msg: 'ok', data: dbQuery('SELECT * FROM dish_likes ORDER BY dish_id', []) || [] }); }
    catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: [] }); }
  });

  app.get('/api/public/dish-ratings', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      dbQuery("CREATE TABLE IF NOT EXISTS dish_ratings (id INTEGER PRIMARY KEY AUTOINCREMENT, dish_id BIGINT NOT NULL, rating_type TEXT NOT NULL CHECK (rating_type IN ('good','average','bad')), count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), UNIQUE(dish_id, rating_type))", []);
      return res.json({ code: 0, msg: 'ok', data: dbQuery('SELECT dish_id, rating_type, count FROM dish_ratings ORDER BY dish_id', []) || [] });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: [] }); }
  });

  app.post('/api/public/dish-rating', (req, res) => {
    const { dish_id, dish_name, rating_type } = req.body || {};
    if (!dish_id || !rating_type || !['good', 'average', 'bad'].includes(rating_type)) return res.status(400).json({ code: 400, msg: '参数错误', data: null });
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      dbQuery("CREATE TABLE IF NOT EXISTS dish_ratings (id INTEGER PRIMARY KEY AUTOINCREMENT, dish_id BIGINT NOT NULL, rating_type TEXT NOT NULL CHECK (rating_type IN ('good','average','bad')), count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), UNIQUE(dish_id, rating_type))", []);
      const ex = dbQuery('SELECT count FROM dish_ratings WHERE dish_id = ? AND rating_type = ?', [dish_id, rating_type]);
      const nc = (ex?.[0]?.count || 0) + 1;
      if (ex && ex.length > 0) dbQuery("UPDATE dish_ratings SET count = ?, updated_at = datetime('now','localtime') WHERE dish_id = ? AND rating_type = ?", [nc, dish_id, rating_type]);
      else dbQuery("INSERT INTO dish_ratings (dish_id, rating_type, count, updated_at) VALUES (?, ?, 1, datetime('now','localtime'))", [dish_id, rating_type]);
      return res.json({ code: 0, msg: 'ok', data: { dish_id, rating_type, count: nc } });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.post('/api/public/dish-like', (req, res) => {
    const { dish_id, dish_name, category, device_info } = req.body || {};
    if (!dish_id) return res.status(400).json({ code: 400, msg: '缺少 dish_id', data: null });
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      const ex = dbQuery('SELECT like_count FROM dish_likes WHERE dish_id = ?', [dish_id]);
      const nc = (ex?.[0]?.like_count || 0) + 1;
      if (ex && ex.length > 0) dbQuery("UPDATE dish_likes SET like_count = ?, updated_at = datetime('now') WHERE dish_id = ?", [nc, dish_id]);
      else dbQuery("INSERT INTO dish_likes (dish_id, dish_name, like_count, updated_at) VALUES (?, ?, 1, datetime('now'))", [dish_id, dish_name || '']);
      dbQuery("INSERT INTO dish_order_records (dish_id, dish_name, category, device_info) VALUES (?, ?, ?, ?)", [dish_id, dish_name || '', category || '', device_info || '']);
      return res.json({ code: 0, msg: 'ok', data: { like_count: nc } });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.post('/api/public/suggestion', (req, res) => {
    const { suggestion } = req.body || {};
    if (!suggestion || !suggestion.trim()) return res.status(400).json({ code: 400, msg: '建议内容不能为空', data: null });
    if (suggestion.trim().length > 500) return res.status(400).json({ code: 400, msg: '建议内容不能超过500字', data: null });
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      dbQuery("CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))", []);
      dbQuery("INSERT INTO suggestions (content, created_at) VALUES (?, datetime('now','localtime'))", [suggestion.trim()]);
      return res.json({ code: 0, msg: 'ok', data: null });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.get('/api/public/suggestions', (req, res) => {
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      dbQuery("CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))", []);
      return res.json({ code: 0, msg: 'ok', data: dbQuery('SELECT id, content, created_at FROM suggestions ORDER BY created_at DESC', []) || [] });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: [] }); }
  });

  app.get('/api/public/display-config', (req, res) => {
    const key = req.query.key || 'display_config';
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    try {
      const rows = dbQuery('SELECT config_data FROM display_configs WHERE config_key = ? ORDER BY id DESC LIMIT 1', [key]);
      if (rows && rows.length > 0) {
        let cd = rows[0].config_data;
        if (typeof cd === 'string') { try { cd = JSON.parse(cd); } catch { } }
        return res.json({ code: 0, msg: 'ok', data: { config_data: cd } });
      }
      return res.json({ code: 0, msg: 'ok', data: null });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  app.get('/api/public/display-dishes-with-weight', (req, res) => {
    const date = req.query.date || new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: [] });
    try {
      const nutRows = dbQuery('SELECT id, dish_name, category, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, img, meal_type FROM dish_nutrition WHERE menu_date = ? ORDER BY meal_type, id', [date]);
      if (!nutRows || nutRows.length === 0) return res.json({ code: 0, msg: 'ok', data: { date, meals: { breakfast: [], lunch: [], dinner: [] }, total_count: 0 } });
      const stationRows = dbQuery("SELECT id, dish_name, hw_last_weight, tare_weight, hw_last_seen, hw_enabled FROM tray_stations WHERE dish_name IS NOT NULL AND dish_name != ''", []);
      const wm = {};
      (stationRows || []).forEach(st => { const k = (st.dish_name || '').trim(); if (k) wm[k] = { station_id: st.id, current_weight: Number(st.hw_last_weight) || 0, tare_weight: Number(st.tare_weight) || 0, net_weight: Math.max(0, (Number(st.hw_last_weight) || 0) - (Number(st.tare_weight) || 0)), last_seen: st.hw_last_seen || null, hw_enabled: st.hw_enabled === 1 }; });
      const meals = { breakfast: [], lunch: [], dinner: [] };
      const mn = { 0: 'breakfast', 1: 'lunch', 2: 'dinner' };
      for (const r of nutRows) {
        const dn = (r.dish_name || '').trim();
        const wi = wm[dn] || { current_weight: 0, tare_weight: 0, net_weight: 0 };
        const nw = wi.net_weight;
        const ratio = nw / 100;
        const item = {
          id: r.id, dish_name: dn, category: r.category || '', meal_type: r.meal_type || 1, meal_name: mn[r.meal_type || 1] || 'lunch', image_url: r.img || '',
          nutrition_per_100g: { calories: Number(r.calories_per_100g) || 0, protein: Number(r.protein_per_100g) || 0, fat: Number(r.fat_per_100g) || 0, carbs: Number(r.carbs_per_100g) || 0 },
          weight: { current: wi.current_weight, tare: wi.tare_weight, net: nw, last_seen: wi.last_seen, hw_enabled: wi.hw_enabled },
          calculated_nutrition: { calories: Math.round(ratio * (Number(r.calories_per_100g) || 0) * 10) / 10, protein: Math.round(ratio * (Number(r.protein_per_100g) || 0) * 10) / 10, fat: Math.round(ratio * (Number(r.fat_per_100g) || 0) * 10) / 10, carbs: Math.round(ratio * (Number(r.carbs_per_100g) || 0) * 10) / 10 },
        };
        meals[mn[r.meal_type || 1] || 'lunch'].push(item);
      }
      return res.json({ code: 0, msg: 'ok', data: { date, total_count: nutRows.length, with_weight_count: nutRows.filter(r => wm[(r.dish_name || '').trim()]).length, meals } });
    } catch (err) { return res.status(500).json({ code: 500, msg: err.message, data: null }); }
  });

  // ─── 电子秤操作员 API ───
  app.post('/api/scale-operators/sync', (req, res) => {
    const { operators } = req.body || {};
    if (!Array.isArray(operators)) return res.status(400).json({ code: 400, msg: 'operators 必须是数组', data: null });
    scaleOperators.splice(0, scaleOperators.length, ...operators.map(o => ({ id: o.id, work_no: o.work_no, login_name: o.login_name || '', name: o.name, password_hash: hashPassword(o.password_hash || ''), role: o.role || 'operator', is_active: o.is_active !== false, device_sn: o.device_sn || '', phone: o.phone || '', _token: o._token || null })));
    saveScaleOperators();
    // ★ 同步写入 SQLite，确保设备端登录（Route A & B）都能查到
    if (dbQuery) {
      try {
        let syncedCount = 0;
        for (const o of operators) {
          if (!o.work_no) continue;
          // ★ 哈希密码：明文 → MD5+base64，与电子秤发送格式一致
          const hashedPw = hashPassword(o.password_hash || '');
          const ex = dbQuery('SELECT id FROM scale_operators WHERE work_no = ?', [o.work_no]);
          if (ex && ex.length > 0) {
            dbQuery('UPDATE scale_operators SET name = ?, login_name = ?, password_hash = ?, role = ?, is_active = ?, device_sn = ?, phone = ?, updated_at = ? WHERE work_no = ?', [o.name || '', o.login_name || '', hashedPw, o.role || 'operator', o.is_active !== false ? 1 : 0, o.device_sn || '', o.phone || '', new Date().toISOString(), o.work_no]);
          } else {
            dbQuery('INSERT OR IGNORE INTO scale_operators (work_no, login_name, name, password_hash, role, is_active, device_sn, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [o.work_no, o.login_name || '', o.name || '', hashedPw, o.role || 'operator', o.is_active !== false ? 1 : 0, o.device_sn || '', o.phone || '', new Date().toISOString(), new Date().toISOString()]);
          }
          syncedCount++;
        }
        console.log('[ScaleOps] 同步 ' + syncedCount + ' 个操作员到 SQLite 和内存');
      } catch (e) { console.warn('[ScaleOps] SQLite 同步失败: ' + e.message); }
    }
    return res.json({ code: 0, msg: 'ok', data: { synced: scaleOperators.length } });
  });

  // ★ 入库电子秤登录 — 从内存和 SQLite 双重查找 + content 解析 + 详细诊断日志
  app.all('/api/auth/scale-operator/login', (req, res) => {
    console.log('[ScaleLogin-A] ' + req.method + ' ' + req.url + ' contentType=' + (req.headers['content-type'] || ''));
    let body = req.body || {};
    const query = req.query || {};
    // content 嵌套 JSON 解析（设备常把参数包在 content 字段里）
    let rawContent = query.content || '';
    if (!rawContent && body.content && typeof body.content === 'string') rawContent = body.content;
    if (rawContent) { try { const p = JSON.parse(rawContent); body = { ...body, ...p }; } catch (e) { } }
    // 多字段兼容：工号
    const wn = (body.work_no || body.workNo || body.username || body.loginName || body.login_name ||
      body.operatorId || body.operator_id || body.employeeId || body.employee_id || body.userId || body.user_id ||
      body.account || body.jobNo || body.job_no || body.staffNo || body.staff_no || body.code || body.no ||
      query.work_no || query.username || query.loginName || query.workNo || '').trim();
    // 多字段兼容：密码
    const pw = body.password || body.passwd || body.pwd || query.password || query.passwd || query.pwd || '';
    // 设备 SN（用于 SQLite 匹配）
    const deviceSn = (body.device_sn || body.deviceSn || query.device_sn || query.deviceSn ||
      req.headers['machine-sn'] || req.headers['machinesn'] || '').trim();
    console.log('[ScaleLogin-A] wn=' + (wn || '(empty)') + ' pw=' + (pw ? '***' : '(empty)') + ' deviceSn=' + (deviceSn || '(none)') + ' memOps=' + scaleOperators.length + ' dbQ=' + !!dbQuery);
    if (!wn || !pw) {
      console.log('[ScaleLogin-A] 缺少工号或密码');
      return res.json({ code: 1, msg: '工号和密码不能为空', data: null });
    }
    let operator = null;
    // 1) SQLite 查找
    if (dbQuery) {
      try {
        let rows = dbQuery('SELECT work_no, login_name, name, password_hash, role, is_active, device_sn, phone FROM scale_operators WHERE work_no = ? AND is_active = 1', [wn]);
        if (!rows || rows.length === 0) {
          rows = dbQuery('SELECT work_no, login_name, name, password_hash, role, is_active, device_sn, phone FROM scale_operators WHERE login_name = ? AND is_active = 1', [wn]);
        }
        console.log('[ScaleLogin-A] SQLite 结果: ' + (rows ? rows.length : 0) + ' 条');
        if (rows && rows.length > 0) { operator = rows[0]; console.log('[ScaleLogin-A] SQLite 命中: ' + rows[0].name); }
        else {
          const allSql = dbQuery('SELECT work_no, login_name, name FROM scale_operators', []);
          console.log('[ScaleLogin-A] SQLite 全部: ' + JSON.stringify(allSql || []));
        }
      } catch (e) { console.warn('[ScaleLogin-A] SQLite 异常: ' + e.message); }
    }
    // 2) 内存查找
    if (!operator) {
      const mo = scaleOperators.find(o => (o.work_no === wn || o.login_name === wn) && o.is_active);
      if (mo) { operator = { work_no: mo.work_no, login_name: mo.login_name, name: mo.name, password_hash: mo.password_hash || '', role: mo.role, is_active: mo.is_active, device_sn: mo.device_sn, phone: mo.phone }; console.log('[ScaleLogin-A] 内存命中: ' + mo.name); }
      else { console.log('[ScaleLogin-A] 内存未找到 wn=' + wn + ' 内存列表: ' + scaleOperators.map(o => o.work_no + ':' + o.name).join(', ')); }
    }
    // 3) 终极兜底：001 是系统内置免密账号，任何密码都必须放行（设备会加密密码，不能按明文"2019"判断）
    if (!operator && wn === '001') {
      console.log('[ScaleLogin-A] 兜底放行 001（内置免密账号）');
      const defaultHash = crypto.createHash('md5').update('2019').digest('base64');
      if (dbQuery) {
        try {
          const cols = (dbQuery('PRAGMA table_info(scale_operators)', []) || []).map(c => c.name);
          if (!cols.includes('password_hash')) { dbQuery('ALTER TABLE scale_operators ADD COLUMN password_hash TEXT NOT NULL DEFAULT ?', ['2019']); console.log('[ScaleLogin-A] 自动添加 password_hash 列'); }
          dbQuery('INSERT OR IGNORE INTO scale_operators (work_no, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)', ['001', '默认操作员', defaultHash, 'operator', 1]);
          // ★ 若 001 已存在但被禁用，重新启用
          dbQuery('UPDATE scale_operators SET is_active = 1 WHERE work_no = ?', ['001']);
        } catch (e) { }
      }
      operator = { work_no: '001', name: '默认操作员', password_hash: defaultHash, role: 'operator', is_active: true, device_sn: deviceSn, phone: '' };
      if (!scaleOperators.find(o => o.work_no === '001')) {
        scaleOperators.push({ work_no: '001', name: '默认操作员', password_hash: defaultHash, role: 'operator', is_active: true, device_sn: deviceSn, phone: '', _token: null });
        saveScaleOperators();
      }
    }
    // 4) 密码比对
    if (operator) {
      const storedHash = operator.password_hash || '';
      // ★ 直接比对：存储和传输都是 MD5+base64
      let pwOk = (pw === storedHash);
      // 兜底：如果存储的还没升级（短明文），临时计算 MD5+base64 比对
      const looksLikeHash = storedHash.length === 24 && /^[A-Za-z0-9+/=]+$/.test(storedHash);
      if (!pwOk && !looksLikeHash && storedHash.length > 0) {
        try {
          const computedHash = crypto.createHash('md5').update(storedHash).digest('base64');
          pwOk = (pw === computedHash);
          if (pwOk && dbQuery) {
            try { dbQuery('UPDATE scale_operators SET password_hash = ? WHERE work_no = ?', [computedHash, operator.work_no]); } catch (e) {}
          }
        } catch (e) { }
      }
      console.log('[ScaleLogin-A] 密码比对: pwOk=' + pwOk + ' storedHash=' + (storedHash || '(empty)').substring(0, 30));
      if (pwOk) {
        const token = generateToken();
        tokenMap.set('operator:' + wn, token);
        const mu = scaleOperators.find(o => o.work_no === wn);
        if (mu) { mu._token = token; saveScaleOperators(); }
        console.log('[ScaleLogin-A] 登录成功! wn=' + wn + ' name=' + operator.name);
        return res.json({ code: 0, msg: 'ok', data: { token, operator_name: operator.name, work_no: operator.work_no || wn, role: operator.role || 'operator', device_sn: operator.device_sn || '' } });
      }
      console.log('[ScaleLogin-A] 密码错误: wn=' + wn);
      return res.json({ code: 1, msg: '密码错误', data: null });
    }
    console.log('[ScaleLogin-A] 操作员不存在: wn=' + wn);
    return res.json({ code: 1, msg: '操作员不存在', data: null });
  });

  app.post('/api/auth/scale-operator/verify', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || b.token || q.token || b.accessToken || q.accessToken || '';
    if (!token) return res.json({ code: 1, msg: '缺少 token', data: null });
    const op = scaleOperators.find(o => o._token === token && o.is_active);
    if (!op) return res.json({ code: 1, msg: 'token 已失效', data: null });
    return res.json({ code: 0, msg: 'ok', data: { valid: true, operator_name: op.name, work_no: op.work_no, role: op.role, device_sn: op.device_sn } });
  });

  app.all('/api/auth/scale-operator/profile', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || b.token || q.token || '';
    if (!token) return res.json({ code: 1, msg: '缺少 token', data: null });
    const op = scaleOperators.find(o => o._token === token && o.is_active);
    if (!op) return res.json({ code: 1, msg: 'token 已失效', data: null });
    return res.json({ code: 0, msg: 'ok', data: { id: op.id, name: op.name, work_no: op.work_no, role: op.role, device_sn: op.device_sn, phone: op.phone || '', is_active: op.is_active } });
  });

  app.get('/api/auth/scale-operator/list', (req, res) => {
    const ds = req.query.device_sn || req.query.machine_sn || req.query.deviceSn || '';
    let ops = scaleOperators;
    if (ds) ops = ops.filter(o => o.device_sn === ds || !o.device_sn);
    if (req.query.active_only !== 'false') ops = ops.filter(o => o.is_active);
    return res.json({ code: 0, msg: 'ok', data: ops.map(o => ({ id: o.id, work_no: o.work_no, name: o.name, role: o.role, device_sn: o.device_sn, phone: o.phone || '' })) });
  });

  app.post('/api/auth/scale-operator/logout', (req, res) => {
    const b = req.body || {}; const q = req.query || {};
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || b.token || q.token || '';
    if (token) {
      const op = scaleOperators.find(o => o._token === token);
      if (op) { op._token = null; saveScaleOperators(); }
      for (const [k, v] of tokenMap.entries()) { if (v === token && k.startsWith('operator:')) tokenMap.delete(k); }
    }
    return res.json({ code: 0, msg: 'ok', data: null });
  });

  // ─── 传感器配置同步 ───
  app.post('/api/sensor/sync-bindings', (req, res) => {
    const { gatewaySn, gatewayKey, devices } = req.body || {};
    if (!gatewaySn || !Array.isArray(devices) || devices.length === 0) return res.status(400).json({ code: 400, msg: '参数错误', data: null });
    if (!dbQuery) return res.status(503).json({ code: 503, msg: '数据库未就绪', data: null });
    if (gatewayKey && gatewayKey.trim()) {
      try {
        const ex = dbQuery('SELECT id, hw_key FROM tray_display_devices WHERE sn = ?', [gatewaySn]);
        if (!ex || ex.length === 0) { dbQuery('INSERT OR IGNORE INTO tray_display_devices (name, sn, hw_key, status, device_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [gatewaySn, gatewaySn, gatewayKey.trim(), 'online', 'display_scale', new Date().toISOString(), new Date().toISOString()]); dbQuery('UPDATE tray_display_devices SET status = ?, hw_key = ?, updated_at = ? WHERE sn = ?', ['online', gatewayKey.trim(), new Date().toISOString(), gatewaySn]); }
        else { dbQuery('UPDATE tray_display_devices SET hw_key = ?, status = ?, updated_at = ? WHERE sn = ?', [gatewayKey.trim(), 'online', new Date().toISOString(), gatewaySn]); }
      } catch (e) { }
    }
    const tm = { temp_humidity: 'TEMPERATURE_HUMIDITY_SENSOR', smoke: 'SMOKE_SENSOR', air_quality: 'GAS_SENSOR' };
    const tnm = { temp_humidity: '温湿度传感器', smoke: '烟雾检测传感器', air_quality: '气体检测' };
    try {
      dbQuery('DELETE FROM gateway_sensor_bindings WHERE gateway_sn = ?', [gatewaySn]);
      let count = 0;
      for (const dev of devices) {
        const dt = tm[dev.sensorType] || 'TEMPERATURE_HUMIDITY_SENSOR';
        const dtn = tnm[dev.sensorType] || '温湿度传感器';
        dbQuery('INSERT INTO gateway_sensor_bindings (gateway_sn, device_sn, device_type, device_type_name, device_name, device_no, zone, protocol, mqtt_topic, slave_addr, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [gatewaySn, dev.sensorId || dev.id || '', dt, dtn, dev.name || '', dev.sensorId || '', dev.zone || '', dev.protocol || 'modbus_tcp', dev.mqttTopic || '', dev.modbusSlaveAddr ?? null, dev.enabled ? 1 : 0, new Date().toISOString(), new Date().toISOString()]);
        count++;
      }
      return res.json({ code: 0, msg: 'ok', data: { gatewaySn, synced: count } });
    } catch (e) { return res.status(500).json({ code: 500, msg: e.message, data: null }); }
  });
}