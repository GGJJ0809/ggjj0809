/**
 * 统一北京时间工具函数
 * 整个系统所有日期计算和显示统一使用北京时间（UTC+8）
 *
 * 核心原则：
 * - Date 对象的 getFullYear/getMonth/getDate 基于系统本地时区（北京时间）
 * - toISOString() 强制返回 UTC 时间，会导致早8点前日期偏移一天 → 禁止用于日期比较
 * - 数据库时间戳存储使用 UTC ISO 格式（标准做法），显示时用 toLocaleString 转换
 */

/** 获取今天的日期字符串（北京时间 YYYY-MM-DD） */
export function todayBeijing(): string {
  const d = new Date();
  // 强制转换为北京时间（Asia/Shanghai，UTC+8）
  const beijingStr = d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [month, day, year] = beijingStr.split('/');
  return `${year}-${month}-${day}`;
}

/** 将 Date 对象转为北京时间日期字符串（YYYY-MM-DD） */
export function dateToBeijing(d: Date): string {
  const beijingStr = d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [month, day, year] = beijingStr.split('/');
  return `${year}-${month}-${day}`;
}

/** 获取当前北京时间完整日期时间字符串（YYYY-MM-DD HH:mm:ss），用于数据库写入 */
export function nowBeijing(): string {
  const d = new Date();
  const beijingStr = d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  // beijingStr 格式: "07/23/2026, 12:15:30"
  const [datePart, timePart] = beijingStr.split(', ');
  const [month, day, year] = datePart.split('/');
  return `${year}-${month}-${day} ${timePart}`;
}

/** 将 ISO 字符串转为北京时间显示（YYYY-MM-DD HH:mm） */
export function formatBeijingTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}