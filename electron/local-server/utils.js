import { createHash } from 'crypto';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findSnByToken } from './config-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══ 全局离线模式：纯局域网环境，永不连接外网 ═══
// 启动时直接写死，不做任何 DNS 检测，零等待
const globalOfflineMode = true;

/** 查询当前是否处于全局离线模式 — 局域网环境始终返回 true */
export function isOffline() { return true; }

// ═══ 通过 MD5 sign 反推设备身份 ═══
export function findDeviceBySign(dbQuery, body) {
  const { nonceStr, timestamp, version, sign } = body || {};
  if (!nonceStr || !timestamp || !sign || !dbQuery) return null;
  try {
    const devices = dbQuery('SELECT sn, hw_key FROM tray_display_devices', []);
    if (!devices || devices.length === 0) return null;
    for (const device of devices) {
      const sn = device.sn || '';
      const key = device.hw_key || '';
      const v = version || '';
      const combinations = [
        `${sn}${key}${nonceStr}${timestamp}${v}`, `${key}${nonceStr}${timestamp}${v}`,
        `${sn}${key}${nonceStr}${timestamp}`, `${key}${nonceStr}${timestamp}`,
        `${sn}${key}${timestamp}${nonceStr}${v}`, `${key}${timestamp}${nonceStr}${v}`,
        `${sn}${key}${timestamp}${nonceStr}`, `${key}${timestamp}${nonceStr}`,
        `${key}${sn}${nonceStr}${timestamp}${v}`, `${key}${sn}${timestamp}${nonceStr}${v}`,
        `${key}${nonceStr}${timestamp}`, `${sn}${key}${nonceStr}${timestamp}`,
        `${sn}${key}${timestamp}${nonceStr}${v}`, `${sn}${key}${timestamp}${nonceStr}`,
      ];
      for (const str of combinations) {
        const es = createHash('md5').update(str).digest('hex').toUpperCase();
        if (es === String(sign).toUpperCase()) return device;
      }
    }
  } catch (e) { }
  return null;
}

// ═══ 从请求中识别设备 SN ═══
export function resolveDeviceSn(req, dbQuery) {
  const h = req.headers || {};
  const b = req.body || {};
  const q = req.query || {};
  const t = (h.authorization || '').replace(/^Bearer\s+/i, '').trim() || q.token || b.token || '';
  let sn = findSnByToken(t);
  if (!sn) {
    sn = h['machine-sn'] || h['machinesn'] || h['machine-num'] || h['machinenum'] || h['x-machine-sn'] || h['sn'] || h['device-sn'];
  }
  if (!sn) {
    sn = b.sn || b.SN || b.deviceSn || b.machineCode || q.sn || q.SN || q.deviceSn;
  }
  if (!sn) {
    const dbs = findDeviceBySign(dbQuery, b);
    if (dbs) sn = dbs.sn;
  }
  if (!sn && dbQuery) {
    try {
      let rows = dbQuery("SELECT sn FROM tray_display_devices WHERE status = 'online' LIMIT 2", []);
      if (!rows || rows.length === 0) rows = dbQuery("SELECT sn FROM tray_display_devices LIMIT 2", []);
      if (rows && rows.length === 1) sn = rows[0].sn;
    } catch (e) { }
  }
  // ★ 短SN归一化：设备传来的可能是 "3000004186"（纯数字），
  // 但数据库里存的是 "device@1000000001@3000004186"（带租户前缀）。
  // 此时用 LIKE 反查完整 SN，确保所有下游查询命中同一行。
  if (sn && !sn.includes('@') && dbQuery) {
    try {
      const fullRows = dbQuery('SELECT sn FROM tray_display_devices WHERE sn LIKE ? LIMIT 1', ['%@' + sn]);
      if (fullRows && fullRows.length > 0) {
        console.log('[resolveDeviceSn] ★ 短SN归一化: ' + sn + ' → ' + fullRows[0].sn);
        return fullRows[0].sn;
      }
    } catch (e) { /* fall through */ }
  }
  return sn || null;
}

// ═══ 可靠 HTTP 请求 ═══
export function nodeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const ro = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false,
    };
    const client = isHttps ? https : http;
    const req = client.request(ro, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: async () => data,
          json: async () => { try { return JSON.parse(data); } catch { return {}; } },
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export async function safeFetch(url, options = {}) {
  try {
    if (typeof fetch !== 'undefined') return await fetch(url, options);
  } catch (e) { }
  return nodeRequest(url, options);
}

// ═══ 自读取 .env 文件 ═══
export function loadEnvFromFileLocal() {
  const cand = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
    path.join(__dirname, '..', '..', '..', '.env'),
    path.join(process.resourcesPath || '', '.env'),
    path.join(process.resourcesPath || '', 'app', '.env'),
    path.join(process.resourcesPath || '', 'app', 'electron', '.env'),
  ];
  for (const ep of cand) {
    if (!ep) continue;
    try {
      if (fs.existsSync(ep)) {
        const content = fs.readFileSync(ep, 'utf-8');
        const env = {};
        content.split('\n').forEach(l => {
          const t = l.trim();
          if (!t || t.startsWith('#')) return;
          const eq = t.indexOf('=');
          if (eq === -1) return;
          let val = t.slice(eq + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
          env[t.slice(0, eq).trim()] = val;
        });
        return {
          supabaseUrl: (env.VITE_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, ''),
          supabaseAnonKey: env.VITE_PUBLIC_SUPABASE_ANON_KEY || '',
        };
      }
    } catch (e) { }
  }
  return null;
}

// ═══ 云端错误日志限流 ═══
let _cloudErrorCount = 0;
let _cloudErrorLastLog = 0;
const _CLOUD_ERROR_LOG_INTERVAL = 60000;

export function _logCloudError(msg) {
  const now = Date.now();
  _cloudErrorCount++;
  if (now - _cloudErrorLastLog > _CLOUD_ERROR_LOG_INTERVAL) {
    const skipped = _cloudErrorCount > 1 ? ` (已省略 ${_cloudErrorCount - 1} 条同类错误)` : '';
    console.warn(`[CloudSync] ${msg}${skipped}`);
    _cloudErrorLastLog = now;
    _cloudErrorCount = 0;
  }
}

// ═══ 更新设备状态（本地 SQLite + 云端）═══
export async function updateDeviceStatus(supabaseUrl, supabaseAnonKey, dbQuery, sn, token, status = 'online') {
  const now = new Date().toISOString();
  if (dbQuery) {
    try {
      dbQuery('UPDATE tray_display_devices SET status = ?, last_seen = ?, token = ? WHERE sn = ?', [status, now, token, sn]);
    } catch (err) { }
  }
  if (globalOfflineMode || !supabaseUrl || !supabaseAnonKey) return;
  // 云端同步仅在正常模式下进行（离线模式跳过，避免无谓的网络尝试）
  try {
    const baseUrl = supabaseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/rest/v1/tray_display_devices?sn=eq.${encodeURIComponent(sn)}`;
    const headers = { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    const res = await safeFetch(url, { method: 'PATCH', headers, body: JSON.stringify({ status, last_seen: now, token }) });
    if (!res.ok) _logCloudError(`云端状态更新失败: HTTP ${res.status}`);
  } catch (err) { _logCloudError(`云端状态更新失败: ${err.message}`); }
}

export async function updateDeviceLastPull(supabaseUrl, supabaseAnonKey, dbQuery, sn) {
  const now = new Date().toISOString();
  if (dbQuery) {
    try { dbQuery('UPDATE tray_display_devices SET last_pull_at = ? WHERE sn = ?', [now, sn]); } catch (err) { }
  }
  if (globalOfflineMode || !supabaseUrl || !supabaseAnonKey) return;
  try {
    const baseUrl = supabaseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/rest/v1/tray_display_devices?sn=eq.${encodeURIComponent(sn)}`;
    const headers = { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    const res = await safeFetch(url, { method: 'PATCH', headers, body: JSON.stringify({ last_pull_at: now }) });
    if (!res.ok) _logCloudError(`云端 last_pull_at 更新失败: HTTP ${res.status}`);
  } catch (err) { _logCloudError(`云端 last_pull_at 更新失败: ${err.message}`); }
}

// ═══ MQTT 地址解析 ═══
export function resolveMqttAddress(req, state, preferredMqttPort, label = '') {
  const hostHeader = req.headers.host || '';
  const rawLocalIp = req.socket.localAddress || '';

  function parseHost(host) {
    if (!host) return '';
    if (host.startsWith('[')) { const end = host.indexOf(']'); if (end !== -1) return host.slice(1, end); }
    const lc = host.lastIndexOf(':');
    if (lc > 0) return host.slice(0, lc);
    return host;
  }
  function cleanIp(ip) {
    if (!ip) return '';
    if (ip.startsWith('::ffff:')) return ip.slice(7);
    return ip;
  }
  function isValidLanIp(ip) {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '0.0.0.0') return false;
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    const nums = parts.map(Number);
    if (nums.some(n => isNaN(n) || n < 0 || n > 255)) return false;
    if (nums[0] === 169 && nums[1] === 254) return false;
    if (nums[0] >= 224) return false;
    return true;
  }
  function getBestLanIpFromInterfaces() {
    const interfaces = os.networkInterfaces();
    const allIps = [];
    for (const [ifaceName, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      const nl = ifaceName.toLowerCase();
      const isVirtual = nl.startsWith('docker') || nl.startsWith('veth') || nl.startsWith('br-') || nl.startsWith('vmnet') || nl.startsWith('vboxnet') || nl.includes('virtual') || nl === 'lo' || (nl.startsWith('v') && nl.includes('ethernet') && nl.includes('default'));
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal && isValidLanIp(addr.address)) {
          allIps.push({ ip: addr.address, iface: ifaceName, isVirtual });
        }
      }
    }
    const physical = allIps.find(a => !a.isVirtual);
    if (physical) return physical.ip;
    if (allIps.length > 0) return allIps[0].ip;
    return '';
  }

  const parsedHost = parseHost(hostHeader);
  const clIp = cleanIp(rawLocalIp);
  let mqttHost = '';
  if (isValidLanIp(parsedHost)) mqttHost = parsedHost;
  if (!mqttHost && isValidLanIp(clIp)) mqttHost = clIp;
  else if (!mqttHost && parsedHost && parsedHost !== 'localhost' && parsedHost !== '127.0.0.1') mqttHost = parsedHost;
  if (!mqttHost) mqttHost = getBestLanIpFromInterfaces();
  if (!mqttHost) mqttHost = '127.0.0.1';
  const mqttPort = state.mqttPort || preferredMqttPort;
  return { mqttHost, mqttPort, mqClientAddress: `${mqttHost}:${mqttPort}` };
}