/**
 * JWT HS256 自行實現
 * 使用 Web Crypto API 的 HMAC-SHA256,無外部依賴
 */

export interface JwtClaims {
  /** 管理員 ID */
  sub: string;
  /** 用戶名 */
  username: string;
  /** 用戶代碼 (如 "10001") */
  ucode: string;
  /** 真實姓名 */
  realname: string;
  /** 角色代碼 (逗號分隔, 如 "R101,R102") */
  rcodes: string;
  /** 是否超級管理員 (ucode="10001" 跳過所有權限檢查) */
  isSuper: boolean;
  /** 權限列表 (resource:action 格式, 如 ["content:index", "content:add"]) */
  permissions: string[];
  /** 簽發時間 (Unix 時間戳, 秒) */
  iat: number;
  /** 過期時間 (Unix 時間戳, 秒) */
  exp: number;
  /** 唯一標識 (用於黑名單) */
  jti: string;
}

/** Base64URL 編碼 (無填充) */
function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64URL 解碼 */
function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 使用 Web Crypto API 計算 HMAC-SHA256 簽名 */
async function hmacSha256(message: string, secret: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

/** 簽發 JWT Token */
export async function signJwt(claims: JwtClaims, secret: string): Promise<string> {
  const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
  const payload = JSON.stringify(claims);
  const headerB64 = base64UrlEncode(header);
  const payloadB64 = base64UrlEncode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = await hmacSha256(signingInput, secret);
  const sigB64 = base64UrlEncode(signature);
  return `${signingInput}.${sigB64}`;
}

/** 驗證 JWT Token,返回 Claims */
export async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const signingInput = `${parts[0]}.${parts[1]}`;
  const expectedSig = base64UrlDecode(parts[2]);
  const actualSig = new Uint8Array(await hmacSha256(signingInput, secret));

  // 常量時間比較簽名
  if (expectedSig.length !== actualSig.length) return null;
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= expectedSig[i] ^ actualSig[i];
  }
  if (diff !== 0) return null;

  // 解析 payload
  const claimsBytes = base64UrlDecode(parts[1]);
  const claimsJson = new TextDecoder().decode(claimsBytes);
  const claims: JwtClaims = JSON.parse(claimsJson);

  // 檢查過期時間
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) return null;

  return claims;
}

/** 從 Authorization 頭提取 JWT Token */
export function extractToken(authorization: string | null | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice(7);
}

/** 生成唯一標識 (用於 jti) */
export function genUuid(): string {
  const now = Date.now();
  const rand = Math.random().toString(16).slice(2, 10);
  return `${now.toString(16)}${rand}`.padStart(32, '0');
}
