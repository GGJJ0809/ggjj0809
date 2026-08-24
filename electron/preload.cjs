const { contextBridge, ipcRenderer } = require('electron');

// 版本号由构建脚本写入 src/buildInfo.ts，这里给个兜底
const appVersion = '1.0.0';

// 检测是否是大屏模式窗口
const isDisplayMode = process.argv.includes('--display-mode');
// 检测是否是今日菜品竖屏窗口
const isDisplay3Mode = process.argv.includes('--display3-mode');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  arch: process.arch,
  appVersion: appVersion,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  // 大屏模式标记
  isDisplayMode: isDisplayMode,
  // 今日菜品竖屏模式标记
  isDisplay3Mode: isDisplay3Mode,

  // ── 大屏窗口控制 ──
  displayOpen: (screenId) => ipcRenderer.invoke('display:open', { screenId }),
  displayClose: () => ipcRenderer.invoke('display:close'),
  displayStatus: () => ipcRenderer.invoke('display:status'),

  // ── 数据库操作 ──
  dbQuery: (sql, params) =>
    ipcRenderer.invoke('db:query', sql, params ?? []),
  dbRun: (sql, params) =>
    ipcRenderer.invoke('db:run', sql, params ?? []),
  dbExec: (sql) =>
    ipcRenderer.invoke('db:exec', sql),
  dbBackup: () =>
    ipcRenderer.invoke('db:backup'),
  dbRestore: () =>
    ipcRenderer.invoke('db:restore'),
  dbInfo: () =>
    ipcRenderer.invoke('db:info'),

  // ── 乐牛菜牌本地服务器 ──
  localServer: {
    getPort: () => ipcRenderer.invoke('local-server:getPort'),
    getLanIp: () => ipcRenderer.invoke('local-server:getLanIp'),
    getStatus: () => ipcRenderer.invoke('local-server:status'),
  },

  // ── 端口配置 ──
  portConfig: {
    get: () => ipcRenderer.invoke('port-config:get'),
    set: (config) => ipcRenderer.invoke('port-config:set', config),
  },

  // ── MQTT 实时推送 ──
  mqttPushDeviceConfig: (sn, mealType) => ipcRenderer.invoke('mqtt:push-device-config', { sn, mealType }),
  mqttPushDishesUpdate: (mealType) => ipcRenderer.invoke('mqtt:push-dishes-update', { mealType }),

  // ── MQTT 重量实时推送（托盘取餐数据变更通知）──
  onTrayDataChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tray-data-changed', handler);
    return () => {
      ipcRenderer.removeListener('tray-data-changed', handler);
    };
  },

  // ── 海康威视 ISAPI ──
  hikvisionSnapshot: (ip, port, username, password, channelNo) =>
    ipcRenderer.invoke('hikvision:snapshot', { ip, port, username, password, channelNo }),
  hikvisionDeviceInfo: (ip, port, username, password) =>
    ipcRenderer.invoke('hikvision:deviceInfo', { ip, port, username, password }),

  // ── RTSP 流转发 ──
  rtspStart: (rtspUrl) =>
    ipcRenderer.invoke('rtsp:start', { rtspUrl }),
  rtspStop: (rtspUrl) =>
    ipcRenderer.invoke('rtsp:stop', { rtspUrl }),

  // ── 调试工具 ──
  debugLogPath: () => ipcRenderer.invoke('debug:logPath'),
  debugDevtools: () => ipcRenderer.invoke('debug:devtools'),
  debugEnv: () => ipcRenderer.invoke('debug:env'),
});