import { contextBridge, ipcRenderer } from 'electron';

// 版本号由构建脚本写入 src/buildInfo.ts，这里给个兜底
const appVersion = '1.0.0';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  arch: process.arch,
  appVersion: appVersion,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },

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

  // ── 乐牛菜牌本地服务器 ──
  localServer: {
    getPort: () => ipcRenderer.invoke('local-server:getPort'),
    getLanIp: () => ipcRenderer.invoke('local-server:getLanIp'),
  },
});