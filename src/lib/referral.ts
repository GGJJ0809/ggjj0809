const REF_STORAGE_KEY = "readdy_ref_code";

/** 从当前 URL 捕获分享链接携带的推荐码（?ref=XXX），存入本地 */
export function captureRefFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && ref.trim()) {
      localStorage.setItem(REF_STORAGE_KEY, ref.trim());
    }
  } catch {
    // 忽略解析异常
  }
}

/** 读取本地保存的推荐码 */
export function getStoredRefCode(): string | null {
  try {
    return localStorage.getItem(REF_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 清除本地推荐码 */
export function clearStoredRefCode(): void {
  try {
    localStorage.removeItem(REF_STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/** 生成唯一推荐码（8 位，去除易混淆字符） */
export function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}