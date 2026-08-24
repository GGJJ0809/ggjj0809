import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import multer from 'multer';
import http from 'http';
import os from 'os';
import { mqttClients, mqttSensorLogs, mqttAllTopicLogs, mqttClientList, pushMqttSensorLog, getMqttSensorLogs, startMqttBroker, deviceWeightHistory, deviceWeightCache, deviceSessionWeights } from './mqtt-broker.js';
import { mountKeepUsersApi } from './keep-users-api.js';
import {
  loadMealPeriodConfig, loadKeepDeviceConfig, loadScaleOperators, loadPickupConfig,
  getKeepCredentials, keepDeviceCredentials, scaleOperators, saveScaleOperators,
  tokenMap, keepDeviceLogs, pushKeepLog, getKeepLogs, generateToken,
} from './config-store.js';
import { writeSensorReading } from './product-data.js';
import { fetchActiveProductItems, resolveStationProductId } from './product-data.js';
import { updateDeviceStatus, isOffline } from './utils.js';
import { mountApiRoutes } from './routes-api.js';
import { mountDeviceRoutes } from './routes-device.js';
import { createKeepRoutes } from './routes-keep.js';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ★ 诊断用：记录最近 200 条 HTTP 请求
export const recentHttpRequests = [];

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return ips;
}

export function startLocalServer(userDataPath, dbQuery, supabaseUrl, supabaseAnonKey, preferredHttpPort = 8081, preferredMqttPort = 1883, fixedHttpPort = true, trayWeightCallback = null) {
  return new Promise((resolve, reject) => {
    const state = { httpPort: 0, mqttPort: 0, mqttReady: false };
    const localIps = getLocalIpAddresses();
    console.log('[LocalServer] 本机局域网 IP:', localIps.join(', ') || '(无)');
    console.log('[LocalServer] 入库秤应配置为: http://' + (localIps[0] || '127.0.0.1') + ':8081/api/v2/oauth/device/token');

    function startMqttAfterHttp(httpResult) {
      startMqttBroker(preferredMqttPort, dbQuery, supabaseUrl, supabaseAnonKey, {
        writeSensorReading, fetchActiveProductItems, updateDeviceStatus,
        generateToken, resolveStationProductId, tokenMap, trayWeightCallback,
      }).then((mqttResult) => {
        state.mqttPort = mqttResult.port;
        state.mqttReady = true;
        resolve({
          server: httpResult.server, port: httpResult.port,
          mqttServer: mqttResult.server, mqttPort: mqttResult.port,
          deviceProxyServer: httpResult.deviceProxyServer, tokenMap, aedes: mqttResult.aedes,
        });
      }).catch((err) => {
        console.error('[LocalServer] MQTT Broker 启动失败:', err.message);
        state.mqttPort = preferredMqttPort;
        state.mqttReady = true;
        resolve({
          server: httpResult.server, port: httpResult.port,
          mqttServer: null, mqttPort: 0,
          deviceProxyServer: httpResult.deviceProxyServer, tokenMap, aedes: null,
        });
      });
    }

    function startDeviceProxy(mainPort) {
      const devicePort = 8082;
      if (mainPort === devicePort) return { server: null, port: devicePort, started: true, error: null };
      const proxyServer = http.createServer((req, res) => {
        const options = { hostname: '127.0.0.1', port: mainPort, path: req.url, method: req.method, headers: { ...req.headers } };
        const proxyReq = http.request(options, (proxyRes) => { res.writeHead(proxyRes.statusCode || 200, proxyRes.headers); proxyRes.pipe(res); });
        proxyReq.on('error', (err) => { if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 502, msg: '代理服务异常', data: null })); } });
        req.pipe(proxyReq);
      });
      proxyServer.listen(devicePort, '0.0.0.0', () => console.log(`[LocalServer] 设备代理: http://0.0.0.0:${devicePort} → 127.0.0.1:${mainPort}`));
      proxyServer.on('error', (err) => console.error('[LocalServer] 8082 代理启动失败:', err.message));
      return { server: proxyServer, port: devicePort, started: false, error: null };
    }

    function tryHttpPort(port, attempt = 0) {
      const MAX_ATTEMPTS = 10;
      getKeepCredentials(userDataPath);
      loadKeepDeviceConfig(userDataPath);
      loadMealPeriodConfig(userDataPath);
      loadScaleOperators(userDataPath);
      loadPickupConfig(userDataPath);

      const app = express();

      // ═══ Body 解析器 ═══
      app.use((req, res, next) => {
        if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') { req.body = {}; return next(); }
        const ct = req.headers['content-type'] || '';
        if (ct.includes('multipart/form-data')) return next();
        let raw = ''; let settled = false;
        function finish() {
          if (settled) return;
          settled = true; req.rawBody = raw;
          if (raw) {
            try { req.body = JSON.parse(raw); } catch {
              try { const p = new URLSearchParams(raw); const o = {}; for (const [k, v] of p) o[k] = v; req.body = Object.keys(o).length > 0 ? o : {}; } catch { req.body = {}; }
            }
          } else { req.body = {}; }
          next();
        }
        const bt = setTimeout(() => { if (!settled) finish(); }, 5000);
        req.setEncoding('utf8');
        req.on('data', (c) => { raw += c; });
        req.on('end', () => { clearTimeout(bt); finish(); });
        req.on('error', () => { clearTimeout(bt); req.body = {}; if (!settled) { settled = true; next(); } });
      });

      // ═══ URL-encoded JSON fix ═══
      app.use((req, res, next) => {
        if (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).length === 1) {
          const key = Object.keys(req.body)[0];
          if (req.body[key] === '' && key.length > 2 && key.startsWith('{') && key.endsWith('}')) {
            try { const parsed = JSON.parse(key); if (parsed && typeof parsed === 'object') { req.body = parsed; } } catch (e) { }
          }
        }
        next();
      });

      // ═══ 请求日志 + 诊断记录 ═══
      app.use((req, res, next) => {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const entry = {
          time: new Date().toISOString(),
          method: req.method,
          path: req.path,
          ip: String(clientIp).replace('::ffff:', ''),
          ct: (req.headers['content-type'] || '').slice(0, 80),
        };
        recentHttpRequests.unshift(entry);
        if (recentHttpRequests.length > 200) recentHttpRequests.length = 200;
        console.log(`[HTTP] ${req.method} ${req.path} ← ${entry.ip}`);
        next();
      });

      // ═══ 诊断端点：最近请求记录 ═══
      app.get('/api/debug/recent-requests', (req, res) => {
        const count = parseInt(req.query.n || '50', 10);
        const recent = recentHttpRequests.slice(0, Math.min(count, 200));
        const scaleRelated = recent.filter(r =>
          r.path.includes('scale') || r.path.includes('Scale') ||
          r.path.includes('login') || r.path.includes('Login') ||
          r.path.includes('auth') || r.path.includes('Auth') ||
          r.path.includes('oauth') || r.path.includes('OAuth') ||
          r.path.includes('token') || r.path.includes('Token')
        );
        const serverIps = getLocalIpAddresses();
        res.json({
          code: 0, msg: 'ok',
          data: {
            serverInfo: {
              httpPort: state.httpPort || port,
              proxyPort: 8082,
              localIps: serverIps,
              listenAddr: '0.0.0.0',
              scaleLoginUrl: 'http://' + (serverIps[0] || '127.0.0.1') + ':' + (state.httpPort || port) + '/api/v2/oauth/device/token',
            },
            totalRequests: recentHttpRequests.length,
            recentRequests: recent.slice(0, count),
            scaleRelatedRequests: scaleRelated.slice(0, count),
          }
        });
      });

      // ═══ CORS ═══
      app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
        if (req.method === 'OPTIONS') return res.status(204).end();
        next();
      });

      // ═══ 纯局域网环境，永远离线 ═══
      console.log('[LocalServer] 🌐 局域网环境 — 所有云端请求已禁用，仅使用本地 SQLite');

      // ═══ 诊断端点：MQTT 全量消息日志（最近 200 条）═══
      app.get('/api/debug/mqtt-all-topics', (req, res) => {
        const count = parseInt(req.query.n || '50', 10);
        const filter = (req.query.filter || '').toLowerCase();
        let logs = mqttAllTopicLogs.slice(0, Math.min(count, 200));
        if (filter) {
          logs = logs.filter(l =>
            l.topic.toLowerCase().includes(filter) ||
            l.payloadPreview.toLowerCase().includes(filter) ||
            (l.clientId || '').toLowerCase().includes(filter)
          );
        }
        res.json({ code: 0, msg: 'ok', data: { total: mqttAllTopicLogs.length, logs, filter: filter || null } });
      });

      // ═══ 诊断端点：MQTT 在线客户端列表 ═══
      app.get('/api/debug/mqtt-clients', (req, res) => {
        const clients = [];
        for (const [clientId, info] of mqttClientList) {
          clients.push({
            clientId, sn: info.sn, isGateway: info.isGateway,
            connectedAt: info.connectedAt, disconnectedAt: info.disconnectedAt || null,
            status: info.status, lastTopic: info.lastTopic,
            lastPayload: (info.lastPayload || '').slice(0, 200),
            msgCount: info.msgCount || 0, lastSeenAt: info.lastSeenAt || null,
          });
        }
        res.json({ code: 0, msg: 'ok', data: { count: clients.length, clients } });
      });

      // ═══ 诊断端点：MQTT 重量相关日志 ═══
      app.get('/api/debug/mqtt-weight-logs', (req, res) => {
        const count = parseInt(req.query.n || '50', 10);
        const weightTopics = mqttAllTopicLogs.filter(l =>
          l.topic.includes('weight') || l.topic.includes('Weight') ||
          l.payloadPreview.includes('menuWeigh') || l.payloadPreview.includes('weight') ||
          l.payloadPreview.includes('ifTakeFood')
        );
        res.json({ code: 0, msg: 'ok', data: { total: weightTopics.length, logs: weightTopics.slice(0, Math.min(count, 200)) } });
      });

      // ═══ 诊断端点：传感器日志 ═══
      app.get('/api/debug/mqtt-sensor-logs', (req, res) => {
        const count = parseInt(req.query.n || '50', 10);
        const logs = getMqttSensorLogs(0).slice(0, Math.min(count, 100));
        res.json({ code: 0, msg: 'ok', data: { total: mqttSensorLogs.length, logs } });
      });

      // ═══ 诊断端点：设备重量历史（用于排查取餐重量计算）═══
      app.get('/api/debug/weight-history', (req, res) => {
        const history = [];
        for (const [sn, entry] of deviceWeightHistory) {
          history.push({ deviceSn: sn, weight: entry.weight, timestamp: new Date(entry.timestamp).toISOString() });
        }
        res.json({ code: 0, msg: 'ok', data: { count: history.length, history: history.sort((a, b) => b.timestamp.localeCompare(a.timestamp)) } });
      });

      // ★★★ 诊断端点：查看当前内存中的设备会话重量（关键排查工具）★★★
      app.get('/api/debug/session-weights', (req, res) => {
        const sessions = [];
        for (const [sn, entry] of deviceSessionWeights) {
          sessions.push({
            deviceSn: sn,
            initialWeight: entry.initialWeight,
            currentWeight: entry.currentWeight,
            mealWeight: Math.round(Math.max(0, entry.initialWeight - entry.currentWeight) * 10) / 10,
            timestamp: new Date(entry.timestamp).toISOString(),
            ageSeconds: Math.round((Date.now() - entry.timestamp) / 1000),
          });
        }
        // Also show deviceWeightCache for cross-reference
        const cache = [];
        for (const [key, entry] of deviceWeightCache) {
          cache.push({
            identifier: key,
            weight: entry.weight,
            unit: entry.unit,
            source: entry.source,
            timestamp: new Date(entry.timestamp).toISOString(),
            ageSeconds: Math.round((Date.now() - entry.timestamp) / 1000),
          });
        }
        res.json({
          code: 0, msg: 'ok',
          data: {
            sessionCount: deviceSessionWeights.size,
            sessions: sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
            cacheCount: deviceWeightCache.size,
            cache: cache.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20),
          }
        });
      });

      // ═══ 挂载所有路由 ═══
      mountApiRoutes(app, dbQuery, state, port, userDataPath);
      mountDeviceRoutes(app, dbQuery, state, port, userDataPath, supabaseUrl, supabaseAnonKey, preferredMqttPort);

      // ═══ 留样柜路由（动态导入避免循环依赖）═══
      createKeepRoutes(app, dbQuery, state, port, userDataPath, supabaseUrl, supabaseAnonKey, preferredMqttPort);

      // ═══ 数据库表初始化 ═══
      if (dbQuery) {
        try {
          // ★ 彻底的表结构迁移：兼容各种旧版本
          dbQuery("CREATE TABLE IF NOT EXISTS scale_operators (id INTEGER PRIMARY KEY AUTOINCREMENT, work_no TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', role TEXT DEFAULT 'operator', is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')))", []);
          // 逐列迁移，不存在的列才加
          const cols = (dbQuery('PRAGMA table_info(scale_operators)', []) || []).map(c => c.name);
          if (!cols.includes('password_hash')) { dbQuery('ALTER TABLE scale_operators ADD COLUMN password_hash TEXT NOT NULL DEFAULT ?', ['2019']); console.log('[ScaleOps] 已添加 password_hash 列'); }
          if (!cols.includes('device_sn')) { dbQuery('ALTER TABLE scale_operators ADD COLUMN device_sn TEXT', []); console.log('[ScaleOps] 已添加 device_sn 列'); }
          if (!cols.includes('phone')) { dbQuery('ALTER TABLE scale_operators ADD COLUMN phone TEXT', []); console.log('[ScaleOps] 已添加 phone 列'); }
          if (!cols.includes('login_name')) { dbQuery('ALTER TABLE scale_operators ADD COLUMN login_name TEXT', []); console.log('[ScaleOps] 已添加 login_name 列'); }
          // ★ 确保默认用户 001 存在
          const ex = dbQuery('SELECT id, password_hash FROM scale_operators WHERE work_no = ?', ['001']);
          if (!ex || ex.length === 0) {
            // 新安装：创建 001，密码存 MD5+base64
            const defaultHash = createHash('md5').update('2019').digest('base64');
            dbQuery("INSERT INTO scale_operators (work_no, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)", ['001', '默认操作员', defaultHash, 'operator', 1]);
            console.log('[ScaleOps] 已创建默认操作员 001，密码已哈希');
          } else {
            console.log('[ScaleOps] 操作员 001 已存在');
          }
          // ★ 批量迁移：将所有明文/空密码统一转为 MD5+base64
          try {
            const allOps = dbQuery('SELECT work_no, password_hash FROM scale_operators', []);
            let migrated = 0;
            const defaultHash = createHash('md5').update('2019').digest('base64');
            (allOps || []).forEach(row => {
              const pw = row.password_hash || '';
              const looksLikeHash = pw.length === 24 && /^[A-Za-z0-9+/=]+$/.test(pw);
              if (!looksLikeHash) {
                // 空密码或明文密码 → 统一设为 '2019' 的 MD5+base64
                dbQuery('UPDATE scale_operators SET password_hash = ? WHERE work_no = ?', [defaultHash, row.work_no]);
                migrated++;
              }
            });
            if (migrated > 0) console.log('[ScaleOps] 已迁移 ' + migrated + ' 个密码为 MD5+base64（含空密码修复）');
          } catch (e) { console.warn('[ScaleOps] 密码迁移失败:', e.message); }
        } catch (e) { console.warn('[ScaleOps] 表初始化失败:', e.message); }
        // ★ v852 行为：从 SQLite 同步操作员到内存
        try {
          const dbOps = dbQuery('SELECT work_no, name, password_hash, role, is_active, device_sn, phone, login_name FROM scale_operators WHERE is_active = 1', []);
          if (dbOps && dbOps.length > 0) {
            const memWorkNos = new Set(scaleOperators.map(o => o.work_no));
            let synced = 0;
            dbOps.forEach(row => {
              // ★ 统一哈希处理：空密码或明文密码 → 默认 '2019' 的 MD5+base64
              let hashedPw = row.password_hash || '';
              const looksLikeHash = hashedPw.length === 24 && /^[A-Za-z0-9+/=]+$/.test(hashedPw);
              if (!looksLikeHash) {
                try { hashedPw = createHash('md5').update('2019').digest('base64'); } catch (e) { }
              }
              if (!memWorkNos.has(row.work_no)) {
                scaleOperators.push({ work_no: row.work_no, name: row.name || '', password_hash: hashedPw, role: row.role || 'operator', is_active: row.is_active !== 0, device_sn: row.device_sn || '', phone: row.phone || '', login_name: row.login_name || '', _token: null });
                synced++;
              } else {
                // ★ 已有操作员也更新密码哈希
                const existing = scaleOperators.find(o => o.work_no === row.work_no);
                if (existing && hashedPw !== existing.password_hash) {
                  existing.password_hash = hashedPw;
                }
              }
            });
            if (synced > 0) { console.log('[ScaleOps] 从 SQLite 同步 ' + synced + ' 个操作员到内存'); saveScaleOperators(); }
            console.log('[ScaleOps] 内存操作员总数: ' + scaleOperators.length + ', 工号: ' + scaleOperators.map(o => o.work_no).join(', '));
          }
        } catch (e) { console.warn('[ScaleOps] 同步失败:', e.message); }
        try { dbQuery("CREATE TABLE IF NOT EXISTS keep_users (id INTEGER PRIMARY KEY AUTOINCREMENT, login_name TEXT NOT NULL UNIQUE, password TEXT NOT NULL DEFAULT '123456', nick_name TEXT, is_admin INTEGER DEFAULT 0, image TEXT, position TEXT, num TEXT, face_token TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')))", []); const keepUserCols = (dbQuery('PRAGMA table_info(keep_users)', []) || []).map(c => c.name); if (!keepUserCols.includes('face_token')) { dbQuery('ALTER TABLE keep_users ADD COLUMN face_token TEXT', []); } const ea = dbQuery('SELECT id FROM keep_users WHERE login_name = ?', ['admin']); if (!ea || ea.length === 0) { dbQuery("INSERT INTO keep_users (login_name, password, nick_name, is_admin, position, num) VALUES (?, ?, ?, ?, ?, ?)", ['admin', 'admin123', '管理员', 1, '管理员', '001']); } } catch (e) { }
        try { dbQuery("CREATE TABLE IF NOT EXISTS device_dish_cache (device_sn TEXT PRIMARY KEY, station_id INTEGER, dish_id INTEGER NOT NULL, dish_name TEXT NOT NULL, category TEXT DEFAULT '', dish_data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))", []); } catch (e) { }
        try { dbQuery("CREATE TABLE IF NOT EXISTS gateway_sensor_bindings (id INTEGER PRIMARY KEY AUTOINCREMENT, gateway_sn TEXT NOT NULL, device_sn TEXT, device_type TEXT NOT NULL, device_type_name TEXT, device_name TEXT, device_no TEXT, zone TEXT, protocol TEXT DEFAULT 'modbus_tcp', mqtt_topic TEXT, slave_addr INTEGER, enabled INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')))", []); } catch (e) { }
        try { dbQuery("CREATE TABLE IF NOT EXISTS keep_temperature_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, device_sn TEXT, sensor_id TEXT, temperature REAL, humidity REAL, max_tem REAL, min_tem REAL, recorded_at TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))", []); const keepTempCols = (dbQuery('PRAGMA table_info(keep_temperature_readings)', []) || []).map(c => c.name); if (!keepTempCols.includes('max_tem')) { dbQuery('ALTER TABLE keep_temperature_readings ADD COLUMN max_tem REAL', []); } if (!keepTempCols.includes('min_tem')) { dbQuery('ALTER TABLE keep_temperature_readings ADD COLUMN min_tem REAL', []); } } catch (e) { }

        // ★★★ 从 Supabase 同步供应商和仓库数据到本地 SQLite ★★★
        // 解决电子秤设备查询返回空列表的问题（设备API读本地SQLite，而非Supabase）
        (async () => {
          try {
            if (!supabaseUrl || !supabaseAnonKey) {
              console.log('[LocalSync] Supabase 未配置，跳过同步');
              return;
            }
            const baseUrl = supabaseUrl.replace(/\/+$/, '');
            const headers = { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` };

            // ── 同步 suppliers ──
            try {
              const supRes = await fetch(`${baseUrl}/rest/v1/suppliers?is_active=eq.true&select=*`, { headers });
              if (supRes.ok) {
                const data = await supRes.json();
                if (data && data.length > 0) {
                  // 确保本地表存在
                  dbQuery('CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT, contact TEXT, phone TEXT, address TEXT, score REAL DEFAULT 5.0, is_active INTEGER DEFAULT 1, created_at TEXT)', []);
                  let synced = 0;
                  for (const row of data) {
                    const existing = dbQuery('SELECT id FROM suppliers WHERE id = ?', [row.id]);
                    if (existing && existing.length > 0) continue; // 已存在，跳过
                    dbQuery('INSERT OR IGNORE INTO suppliers (id, name, code, contact, phone, address, score, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                      [row.id, row.name, row.code || ('GYS' + String(row.id).padStart(3, '0')), row.contact || '', row.phone || '', row.address || '', row.score || 5.0, row.is_active ? 1 : 0, row.created_at || new Date().toISOString()]);
                    synced++;
                  }
                  if (synced > 0) console.log(`[LocalSync] ✓ 从 Supabase 同步 ${synced} 个供应商到本地 SQLite`);
                }
              }
            } catch (e) { console.warn('[LocalSync] 供应商同步失败:', e.message); }

            // ── 同步 warehouses ──
            try {
              const whRes = await fetch(`${baseUrl}/rest/v1/warehouses?is_active=eq.true&select=*`, { headers });
              if (whRes.ok) {
                const data = await whRes.json();
                if (data && data.length > 0) {
                  // 确保本地表存在
                  dbQuery('CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, address TEXT, is_active INTEGER DEFAULT 1, created_at TEXT)', []);
                  let synced = 0;
                  for (const row of data) {
                    const existing = dbQuery('SELECT id FROM warehouses WHERE id = ?', [row.id]);
                    if (existing && existing.length > 0) continue;
                    dbQuery('INSERT OR IGNORE INTO warehouses (id, code, name, address, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                      [row.id, row.code || ('CK' + String(row.id).padStart(3, '0')), row.name, row.address || '', row.is_active ? 1 : 0, row.created_at || new Date().toISOString()]);
                    synced++;
                  }
                  if (synced > 0) console.log(`[LocalSync] ✓ 从 Supabase 同步 ${synced} 个仓库到本地 SQLite`);
                }
              }
            } catch (e) { console.warn('[LocalSync] 仓库同步失败:', e.message); }
          } catch (e) { console.warn('[LocalSync] 同步异常:', e.message); }
        })();
      }

      // ═══ 留样柜人员管理 API ═══
      const keepUploadDir = path.join(userDataPath || '/tmp', 'keep-uploads');
      if (!fs.existsSync(keepUploadDir)) fs.mkdirSync(keepUploadDir, { recursive: true });
      mountKeepUsersApi(app, dbQuery, state, port, keepDeviceCredentials, 
        (picData) => {
          if (!picData || picData.length < 100) return picData || '';
          if (picData.startsWith('/keep-uploads/')) return picData;
          try {
            const d = path.join(userDataPath || '/tmp', 'keep-uploads');
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
            let ext = 'png'; let bd = picData;
            if (picData.startsWith('data:image/jpeg')) { ext = 'jpg'; bd = picData.replace(/^data:image\/jpeg;base64,/, ''); }
            else if (picData.startsWith('data:image/png')) { bd = picData.replace(/^data:image\/png;base64,/, ''); }
            const fn = 'keep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
            fs.writeFileSync(path.join(d, fn), bd, 'base64');
            return '/keep-uploads/' + fn;
          } catch (e) { return picData; }
        },
        pushKeepLog
      );
      app.use('/keep-uploads', express.static(keepUploadDir));

      // ═══ 电子秤货品图片上传静态服务 ═══
      const sysfileUploadDir = path.join(userDataPath || '/tmp', 'sysfile-uploads');
      if (!fs.existsSync(sysfileUploadDir)) fs.mkdirSync(sysfileUploadDir, { recursive: true });
      app.use('/sysfile-uploads', express.static(sysfileUploadDir));

      // ★★★ 全局 Express 错误捕获中间件：防止任何未捕获路由异常返回 HTML
      // 设备收到 HTML 时会展示"服务器错误"提示
      // eslint-disable-next-line no-unused-vars
      app.use(function globalErrorHandler(err, req, res, next) {
        console.error('[Express-GlobalError] ' + req.method + ' ' + req.path + ' => ' + (err && err.message ? err.message : String(err)));
        if (err && err.stack) console.error('[Express-GlobalError] stack: ' + err.stack);
        if (!res.headersSent) {
          res.status(200).json({ code: 1, msg: '\u670d\u52a1\u5668\u5185\u90e8\u9519\u8bef: ' + (err && err.message ? err.message : '\u672a\u77e5\u9519\u8bef'), data: null });
        }
      });

      // ═══ 静态文件 + SPA fallback ═══
      const outDir = [path.join(__dirname, '../../out'), path.join(__dirname, '../out'), path.join(process.resourcesPath || '', 'app', 'out')].find(d => fs.existsSync(d) && fs.existsSync(path.join(d, 'index.html')));
      if (outDir) {
        app.use(express.static(outDir));
        // SPA fallback: 只对非 API 路径生效，防止设备 API 请求被 HTML 覆盖
        app.get('*', (req, res) => {
          const p = req.path || '';
          if (
            p.startsWith('/api/') ||
            p.startsWith('/tengyun-api/') ||
            p.startsWith('/yunshitang/') ||
            p.startsWith('/admin/api/')
          ) {
            console.warn('[SPA-Fallback] 设备 API 路径被 SPA 拦截，返回 404 JSON: ' + p);
            return res.status(200).json({ code: 404, msg: 'API\u8def\u5f84\u672a\u6ce8\u518c: ' + p, data: null });
          }
          res.sendFile(path.join(outDir, 'index.html'));
        });
      }

      // ═══ 启动服务 ═══
      const server = app.listen(port, '0.0.0.0', () => {
        state.httpPort = port;
        console.log('[LocalServer] HTTP 服务已启动: http://0.0.0.0:' + port);
        const deviceProxyResult = startDeviceProxy(port);
        startMqttAfterHttp({ server, port, deviceProxyServer: deviceProxyResult.server });
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < MAX_ATTEMPTS) { tryHttpPort(port + 1, attempt + 1); }
        else { console.error('[LocalServer] HTTP 服务启动失败:', err.message); reject(err); }
      });
    }

    tryHttpPort(preferredHttpPort, 0);
  });
}