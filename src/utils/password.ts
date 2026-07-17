/**
 * 雙 MD5 密碼實現,兼容 PbootCMS 原版
 * PbootCMS 使用 md5(md5(password)) 存儲密碼
 * Web Crypto API 不支持 MD5,使用 js-md5 純 JS 實現
 */
import md5 from 'js-md5';

/** 對密碼進行雙 MD5 加密 */
export function hashPassword(password: string): string {
  const firstHash = md5(password);
  return md5(firstHash);
}

/** 常量時間比較密碼,防時序攻擊 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const inputHash = hashPassword(password);
  return constantTimeEq(inputHash, storedHash);
}

/** 常量時間字符串比較 */
function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
