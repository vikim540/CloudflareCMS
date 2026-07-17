/**
 * 日期時間工具 — 統一使用香港時區 (UTC+8)
 * 所有存入 D1 的時間字符串均為香港時間，格式 YYYY-MM-DD HH:mm:ss
 */

/** 當前香港時間字符串 (YYYY-MM-DD HH:mm:ss) */
export function nowStr(): string {
  const now = new Date();
  const hk = new Date(now.getTime() + 8 * 3600 * 1000);
  return hk.toISOString().replace('T', ' ').slice(0, 19);
}

/** 當前香港日期字符串 (YYYY-MM-DD) */
export function todayStr(): string {
  const now = new Date();
  const hk = new Date(now.getTime() + 8 * 3600 * 1000);
  return hk.toISOString().slice(0, 10);
}
