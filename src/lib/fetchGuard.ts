/**
 * 全局 fetch 安全守卫
 *
 * 在应用启动时最早期介入，拦截所有 fetch 请求，
 * 自动检测并剥离 URL 中嵌入的凭证（user:pass@host），
 * 转为 Authorization: Basic xxx 头发送。
 *
 * 解决 Chromium 安全策略 "Request cannot be constructed from
 * a URL that includes credentials" 的报错。
 */

type FetchArgs = Parameters<typeof fetch>;

const originalFetch = window.fetch.bind(window);
const CREDENTIAL_URL_REGEX = /^(https?:\/\/)([^:@/]+):([^@]+)@(.+)$/i;

function stripCredentialsFromUrl(url: string): { cleanUrl: string; authHeader: string | null } {
  const match = url.match(CREDENTIAL_URL_REGEX);
  if (!match) return { cleanUrl: url, authHeader: null };

  const [, protocol, username, password, rest] = match;
  const cleanUrl = `${protocol}${rest}`;
  const authHeader = 'Basic ' + btoa(`${username}:${password}`);

  console.warn(
    '[FetchGuard] 拦截到含凭证的URL，已自动剥离并转为Authorization头',
    '\n原始URL片段:', `${protocol}${username}:***@${rest}`,
  );

  return { cleanUrl, authHeader };
}

function guardedFetch(...args: FetchArgs): Promise<Response> {
  const [input, init] = args;

  // 安全兜底：如果 originalFetch 不可用，fallback 到原生 fetch
  const safeFetch = originalFetch || ((...a: FetchArgs) => {
    console.warn('[FetchGuard] originalFetch 为 undefined，使用原生 window.fetch 兜底');
    // 直接调用未绑定的 fetch（全局作用域）
    return (Function.prototype.call.call(window.fetch, window, ...a) as Promise<Response>);
  });

  // 处理 string URL
  if (typeof input === 'string') {
    const { cleanUrl, authHeader } = stripCredentialsFromUrl(input);
    if (authHeader) {
      const headers = new Headers(init?.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', authHeader);
      }
      return safeFetch(cleanUrl, { ...init, headers });
    }
  }

  // 处理 Request 对象
  if (input instanceof Request) {
    const { cleanUrl, authHeader } = stripCredentialsFromUrl(input.url);
    if (authHeader) {
      const headers = new Headers(input.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', authHeader);
      }
      return safeFetch(cleanUrl, { ...input, headers } as any);
    }
  }

  // URL 对象不会被构造出含凭证的URL，直接透传
  return safeFetch(...args);
}

/** 启用全局 fetch 守卫 */
export function installFetchGuard(): void {
  window.fetch = guardedFetch as typeof window.fetch;
  console.log('[FetchGuard] 全局fetch安全守卫已启用');
}

/** 清理 localStorage 中可能缓存了含凭证URL的旧数据 */
export function cleanLegacyCache(): void {
  try {
    const hikvisionRaw = localStorage.getItem('hikvision_config');
    if (hikvisionRaw) {
      const config = JSON.parse(hikvisionRaw);
      let modified = false;

      if (config.devices?.length) {
        for (const dev of config.devices) {
          // 确保没有缓存完整的URL
          delete dev.url;
          delete dev.snapshotUrl;
          delete dev.statusUrl;
        }
        modified = true;
      }

      if (modified) {
        localStorage.setItem('hikvision_config', JSON.stringify(config));
        console.log('[FetchGuard] 已清理localStorage中的旧缓存数据');
      }
    }
  } catch {
    // ignore
  }
}