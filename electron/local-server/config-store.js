import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

// ═══ 内存 token 存储: sn -> token ═══
export const tokenMap = new Map();

// ═══ 留样柜设备用户 Token 存储 ═══
export const keepUserTokens = new Map();
export const keepDeviceIdTokens = new Map();
export const keepTokenExpiry = new Map();
export const keepDeviceTokenExpiry = new Map();

// ═══ 留样柜设备默认管理账号配置 ═══
export let keepDeviceCredentials = { admin: 'admin123', operator: '123456' };

// ═══ 电子秤操作员存储 ═══
export let scaleOperators = [];

// ═══ 留样柜设备系统参数配置 ═══
export let keepDeviceConfig = {
  keepTimeout: String(48 * 3600 * 1000),
  keepWeight: '125',
  minTemp: '0',
  maxTemp: '8',
  warningTemp: '10',
  deviceUITemplate: '1',
};

// ═══ 取餐判定参数配置（后台「系统设置」可改）═══
export let pickupConfig = {
  stableSeconds: 3,   // 重量停止下降多少秒视为"一次取餐结束"
  minDropGrams: 50,   // 最小取餐量（g），低于此不记录
};

// ═══ 餐段时间配置 ═══
export let mealPeriodConfig = [
  { meal_type: 0, meal_name: '早餐', start_time: '05:00', end_time: '10:00', enabled: true },
  { meal_type: 1, meal_name: '午餐', start_time: '10:00', end_time: '16:00', enabled: true },
  { meal_type: 2, meal_name: '晚餐', start_time: '16:00', end_time: '22:00', enabled: true },
];

// ═══ 留样柜设备操作日志 ═══
export const keepDeviceLogs = [];

export function pushKeepLog(deviceSn, action, detail, status = 'ok') {
  const entry = {
    id: `keep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    deviceSn: deviceSn || 'unknown',
    action,
    detail,
    status,
    time: new Date().toLocaleString('zh-CN'),
    timestamp: Date.now(),
  };
  keepDeviceLogs.unshift(entry);
  if (keepDeviceLogs.length > 500) keepDeviceLogs.pop();
}

export function getKeepLogs(since = 0) {
  return keepDeviceLogs.filter((l) => l.timestamp >= since);
}

// ═══ Token 工具 ═══
export function generateToken() {
  return createHash('sha256').update(Math.random().toString() + Date.now()).digest('hex').slice(0, 32);
}

export function findSnByToken(token) {
  for (const [sn, t] of tokenMap.entries()) { if (t === token) return sn; }
  return null;
}

export function findScaleOperatorByToken(token) {
  if (!token) return null;
  return scaleOperators.find(o => o._token === token && o.is_active) || null;
}

// ═══ 餐段时间辅助函数 ═══
export function getEffectiveMealPeriods() {
  if (!mealPeriodConfig || !Array.isArray(mealPeriodConfig) || mealPeriodConfig.length === 0) {
    return [
      { mealType: 0, mealName: '早餐', startHour: 5, startMinute: 0, endHour: 10, endMinute: 0, startTimeStr: '05:00:00', endTimeStr: '10:00:00' },
      { mealType: 1, mealName: '午餐', startHour: 10, startMinute: 0, endHour: 16, endMinute: 0, startTimeStr: '10:00:00', endTimeStr: '16:00:00' },
      { mealType: 2, mealName: '晚餐', startHour: 16, startMinute: 0, endHour: 22, endMinute: 0, startTimeStr: '16:00:00', endTimeStr: '22:00:00' },
    ];
  }
  return mealPeriodConfig
    .filter(p => p.enabled !== false)
    .sort((a, b) => a.meal_type - b.meal_type)
    .map(p => {
      const [sh = 5, sm = 0] = String(p.start_time || '05:00').split(':').map(Number);
      const [eh = 10, em = 0] = String(p.end_time || '10:00').split(':').map(Number);
      return {
        mealType: p.meal_type,
        mealName: p.meal_name || '午餐',
        startHour: sh, startMinute: sm,
        endHour: eh, endMinute: em,
        startTimeStr: `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`,
        endTimeStr: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`,
      };
    });
}

export function getCurrentMealType() {
  const periods = getEffectiveMealPeriods();
  // ★★★ 使用北京时间 UTC+8，而非 new Date() 本地时间
  // 服务器若不在 UTC+8 时区，new Date().getHours() 会得到错误的小时数，导致餐段判断偏移
  const nowBeijing = new Date(Date.now() + 8 * 3600 * 1000);
  const cm = nowBeijing.getUTCHours() * 60 + nowBeijing.getUTCMinutes();
  for (const p of periods) {
    if (cm >= p.startHour * 60 + p.startMinute && cm < p.endHour * 60 + p.endMinute) return p.mealType;
  }
  return 1;
}

export function getMealNameByType(mealType) {
  const periods = getEffectiveMealPeriods();
  const found = periods.find(p => p.mealType === mealType);
  return found ? found.mealName : (mealType === 0 ? '早餐' : mealType === 2 ? '晚餐' : '午餐');
}

export function getKeepTimeoutMs() {
  return Number(keepDeviceConfig.keepTimeout) || 48 * 3600 * 1000;
}

// ═══ 配置持久化 ═══
export function loadMealPeriodConfig(udPath) {
  try {
    const p = path.join(udPath, 'meal-period-config.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) mealPeriodConfig = data;
    }
  } catch (e) { console.warn('[MealPeriod] 读取失败:', e.message); }
}

export function saveMealPeriodConfig(udPath) {
  try { fs.writeFileSync(path.join(udPath, 'meal-period-config.json'), JSON.stringify(mealPeriodConfig, null, 2)); } catch (e) { }
}

export function loadKeepDeviceConfig(udPath) {
  try {
    const p = path.join(udPath, 'keep-device-config.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (data && typeof data === 'object') keepDeviceConfig = { ...keepDeviceConfig, ...data };
    }
  } catch (e) { console.warn('[KeepConfig] 读取失败:', e.message); }
}

export function saveKeepDeviceConfig(udPath) {
  try { fs.writeFileSync(path.join(udPath, 'keep-device-config.json'), JSON.stringify(keepDeviceConfig, null, 2)); } catch (e) { }
}

export function loadPickupConfig(udPath) {
  try {
    const p = path.join(udPath, 'pickup-config.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (data && typeof data === 'object') pickupConfig = { ...pickupConfig, ...data };
    }
  } catch (e) { console.warn('[PickupConfig] 读取失败:', e.message); }
}

export function savePickupConfig(udPath) {
  try { fs.writeFileSync(path.join(udPath, 'pickup-config.json'), JSON.stringify(pickupConfig, null, 2)); } catch (e) { }
}

let keepTokensUserDataPath = '';

export function loadKeepTokens(udPath) {
  keepTokensUserDataPath = udPath;
  try {
    const p = path.join(udPath, 'keep-tokens.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const now = Date.now();
      if (data.userTokens) {
        for (const [ln, t] of Object.entries(data.userTokens)) {
          if (t.expiresAt > now) { keepUserTokens.set(ln, t.token); keepTokenExpiry.set(ln, t.expiresAt); }
        }
      }
      if (data.deviceIdTokens) {
        for (const [di, t] of Object.entries(data.deviceIdTokens)) {
          if (t.expiresAt > now) { keepDeviceIdTokens.set(String(di), t.token); keepDeviceTokenExpiry.set(String(di), t.expiresAt); }
        }
      }
    }
  } catch (e) { console.warn('[KeepTokens] 加载失败:', e.message); }
}

export function saveKeepTokens() {
  if (!keepTokensUserDataPath) return;
  try {
    const data = { userTokens: {}, deviceIdTokens: {} };
    for (const [ln, t] of keepUserTokens.entries()) {
      data.userTokens[ln] = { token: t, expiresAt: keepTokenExpiry.get(ln) || (Date.now() + 8 * 3600 * 1000) };
    }
    for (const [di, t] of keepDeviceIdTokens.entries()) {
      data.deviceIdTokens[di] = { token: t, expiresAt: keepDeviceTokenExpiry.get(di) || (Date.now() + 8 * 3600 * 1000) };
    }
    fs.writeFileSync(path.join(keepTokensUserDataPath, 'keep-tokens.json'), JSON.stringify(data, null, 2));
  } catch (e) { }
}

export function findKeepUserByToken(token, deviceId) {
  const now = Date.now();
  for (const [ln, exp] of keepTokenExpiry.entries()) { if (exp < now) { keepUserTokens.delete(ln); keepTokenExpiry.delete(ln); } }
  for (const [di, exp] of keepDeviceTokenExpiry.entries()) { if (exp < now) { keepDeviceIdTokens.delete(di); keepDeviceTokenExpiry.delete(di); } }
  saveKeepTokens();
  if (token) {
    for (const [ln, t] of keepUserTokens.entries()) {
      if (t === token) { keepTokenExpiry.set(ln, Date.now() + 8 * 3600 * 1000); return ln; }
    }
  }
  if (deviceId) {
    const mt = keepDeviceIdTokens.get(String(deviceId));
    if (mt) {
      for (const [ln, t] of keepUserTokens.entries()) {
        if (t === mt) { keepTokenExpiry.set(ln, Date.now() + 8 * 3600 * 1000); return ln; }
      }
    }
  }
  return null;
}

export function getKeepCredentials(udPath) {
  try {
    const p = path.join(udPath, 'keep-credentials.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (data) keepDeviceCredentials = { ...keepDeviceCredentials, ...data };
    }
  } catch (e) { }
  return keepDeviceCredentials;
}

export function saveKeepCredentials(udPath, creds) {
  try {
    fs.writeFileSync(path.join(udPath, 'keep-credentials.json'), JSON.stringify(creds, null, 2));
    keepDeviceCredentials = { ...keepDeviceCredentials, ...creds };
  } catch (e) { }
}

let scaleOpsUserDataPath = '';

export function loadScaleOperators(udPath) {
  scaleOpsUserDataPath = udPath;
  try {
    const p = path.join(udPath, 'scale-operators.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (Array.isArray(data)) {
        // ★ 启动时统一哈希处理：明文密码转 MD5+base64（24字符才是合法哈希）
        scaleOperators = data.map(o => {
          const pw = o.password_hash || '';
          const looksLikeHash = pw.length === 24 && /^[A-Za-z0-9+/=]+$/.test(pw);
          return {
            ...o,
            password_hash: (pw && !looksLikeHash)
              ? createHash('md5').update(pw).digest('base64')
              : pw
          };
        });
      }
    }
  } catch (e) { }
}

export function saveScaleOperators() {
  if (!scaleOpsUserDataPath) return;
  try {
    fs.writeFileSync(path.join(scaleOpsUserDataPath, 'scale-operators.json'), JSON.stringify(scaleOperators, null, 2));
  } catch (e) { }
}