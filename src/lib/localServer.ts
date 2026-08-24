/**
 * 统一的本地服务器地址工具
 * 所有需要访问本地服务（localhost:xxxx）的地方都从这里获取端口，
 * 避免硬编码 8081，让用户在系统设置里改端口后所有地方都自动跟着变。
 */

const DEFAULT_HTTP_PORT = 8081;
export const DEFAULT_HTTP_PORT_8081 = DEFAULT_HTTP_PORT;

/**
 * 获取本地 HTTP 服务端口。
 * - Electron 环境：通过 IPC 拿到真实端口（系统设置里配置的）
 * - 浏览器环境：直接返回默认 8081
 *
 * 注意：这是一个同步缓存读取，缓存在 _cachedPort。
 * 应用启动时会调用 initLocalServerPort() 异步预热缓存。
 */
let _cachedPort: number = 0;
let _cachedLanIp: string = '';
let _initialized = false;
let _serverConfirmedRunning = false;

/** 预热：应用启动时调用一次，后续 getLocalServerPort() 直接返回缓存值 */
export async function initLocalServerPort(): Promise<number> {
  try {
    const api = (window as any).electronAPI;
    if (api?.localServer?.getPort) {
      const info = await api.localServer.getPort();
      const port = info?.httpPort || info?.port || 0;
      _cachedPort = port;
      _serverConfirmedRunning = port > 0;
      _initialized = true;
      console.log('[LocalServer] 端口已初始化:', _cachedPort, '服务运行中:', _serverConfirmedRunning);

      // ★ 同时获取局域网 IP
      if (api?.localServer?.getLanIp) {
        try {
          const ip = await api.localServer.getLanIp();
          _cachedLanIp = ip || '';
          console.log('[LocalServer] 局域网IP:', _cachedLanIp || '(未获取到)');
        } catch {
          _cachedLanIp = '';
        }
      }

      return _cachedPort;
    }
  } catch (e) {
    console.warn('[LocalServer] 获取端口失败，服务未运行:', e);
  }

  // ★ 非 Electron 环境（浏览器）：直接使用默认端口，不阻塞轮询
  _cachedPort = DEFAULT_HTTP_PORT;
  _serverConfirmedRunning = false;
  _initialized = true;
  console.log('[LocalServer] 非 Electron 环境，使用默认端口:', _cachedPort);
  return _cachedPort;
}

/** 同步获取本地服务端口（使用缓存值，0 表示服务未运行）*/
export function getLocalServerPort(): number {
  return _cachedPort;
}

/** 服务是否确认在运行中（而非乐观默认值）*/
export function isLocalServerRunning(): boolean {
  return _serverConfirmedRunning;
}

/** 获取局域网 IP 缓存 */
export function getLocalLanIp(): string {
  return _cachedLanIp;
}

/** 获取本地服务基础地址，如 http://192.168.2.33:8081 */
export function getLocalServerBase(): string {
  const port = _cachedPort > 0 ? _cachedPort : DEFAULT_HTTP_PORT;
  // ★ 浏览器环境（非 Electron）：使用当前页面 hostname，
  //    解决跨机器访问时 localhost 指向错误机器的问题
  if (typeof window !== 'undefined' && !(window as any).electronAPI) {
    try {
      return `http://${window.location.hostname}:${port}`;
    } catch {
      // window.location 不可用时回退 localhost
    }
  }
  return `http://localhost:${port}`;
}

/** 构建本地服务 URL，如 getLocalServerUrl('/api/keep/dashboard') */
export function getLocalServerUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = getLocalServerBase();
  if (!base) return '';
  return `${base}${p}`;
}

/**
 * 如果还没初始化，立即触发一次异步初始化（不阻塞调用方）。
 * 在组件 mount 时调用，确保端口尽快刷新。
 */
export function ensureLocalServerPortInit(): void {
  if (!_initialized) {
    initLocalServerPort().catch(() => {});
  }
}