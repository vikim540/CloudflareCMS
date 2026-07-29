/**
 * AWS Signature V4 簽名工具
 * 用於 S3 兼容存儲 (Cloudflare R2 / AWS S3 / MinIO 等)
 *
 * 基於 Web Crypto API 實現，無外部依賴
 */

const encoder = new TextEncoder();

/** HMAC-SHA256 */
async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

/** SHA-256 哈希 */
async function sha256(data: string | ArrayBuffer): Promise<string> {
  const buf = typeof data === 'string' ? encoder.encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return bufToHex(hash);
}

/** ArrayBuffer 轉十六進制字符串 */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Uint8Array 轉 Base64 */
function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** URI 編碼 (RFC 3986) */
function uriEncode(str: string, encodeSlash = true): string {
  let result = encodeURIComponent(str);
  if (!encodeSlash) {
    result = result.replace(/%2F/g, '/');
  }
  return result;
}

/** S3 存儲配置 */
export interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  publicUrl: string;
}

/** 生成 SigV4 簽名的 Authorization 頭 */
export async function signS3Request(
  method: string,
  url: string,
  config: S3Config,
  body: ArrayBuffer | null,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ headers: Record<string, string>; signedUrl: string }> {
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname;
  const path = parsedUrl.pathname || '/';
  const query = parsedUrl.search.replace(/^\?/, '');

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256(body || '');

  const headers: Record<string, string> = {
    Host: host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    ...extraHeaders,
  };

  // 僅在提供非空 contentType 時才添加（GET 請求不需要）
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  // 構建 CanonicalHeaders
  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k.toLowerCase()}:${headers[k].trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.map((k) => k.toLowerCase()).join(';');

  // 構建 CanonicalRequest
  const canonicalRequest = [
    method.toUpperCase(),
    uriEncode(path, false),
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // 構建 StringToSign
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256(canonicalRequest),
  ].join('\n');

  // 計算簽名
  const kDate = await hmac(encoder.encode(`AWS4${config.secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, config.region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = bufToHex(await hmac(kSigning, stringToSign));

  // 構建 Authorization 頭
  const authHeader = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  headers['Authorization'] = authHeader;

  return { headers, signedUrl: url };
}

/** 上傳文件到 S3 */
export async function s3PutObject(
  config: S3Config,
  key: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const endpoint = config.endpoint.replace(/\/$/, '');
  const url = `${endpoint}/${config.bucket}/${uriEncode(key, false)}`;

  const { headers } = await signS3Request('PUT', url, config, data, contentType);

  const resp = await fetch(url, {
    method: 'PUT',
    headers,
    body: data,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`S3 上傳失敗: ${resp.status} ${text}`);
  }

  // 返回公共訪問 URL
  if (config.publicUrl) {
    return `${config.publicUrl.replace(/\/$/, '')}/${uriEncode(key, false)}`;
  }
  return url;
}

/** 從 S3 下載文件 */
export async function s3GetObject(
  config: S3Config,
  key: string,
): Promise<{ data: ArrayBuffer; contentType: string }> {
  const endpoint = config.endpoint.replace(/\/$/, '');
  const url = `${endpoint}/${config.bucket}/${uriEncode(key, false)}`;

  const { headers } = await signS3Request('GET', url, config, null, 'application/octet-stream');

  const resp = await fetch(url, { method: 'GET', headers });

  if (!resp.ok) {
    throw new Error(`S3 下載失敗: ${resp.status}`);
  }

  const data = await resp.arrayBuffer();
  const contentType = resp.headers.get('Content-Type') || 'application/octet-stream';
  return { data, contentType };
}

/** 從 S3 刪除文件 */
export async function s3DeleteObject(config: S3Config, key: string): Promise<void> {
  const endpoint = config.endpoint.replace(/\/$/, '');
  const url = `${endpoint}/${config.bucket}/${uriEncode(key, false)}`;

  const { headers } = await signS3Request('DELETE', url, config, null, 'application/octet-stream');

  const resp = await fetch(url, { method: 'DELETE', headers });

  if (!resp.ok && resp.status !== 204) {
    throw new Error(`S3 刪除失敗: ${resp.status}`);
  }
}

/** 生成預簽名 URL (GET) */
export async function s3PresignedUrl(
  config: S3Config,
  key: string,
  expires = 3600,
): Promise<string> {
  const endpoint = config.endpoint.replace(/\/$/, '');
  const url = new URL(`${endpoint}/${config.bucket}/${uriEncode(key, false)}`);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;

  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  });

  const canonicalQuery = params
    .toString()
    .split('&')
    .map((p) => p.replace(/=/, '='))
    .sort()
    .join('&');

  const canonicalRequest = [
    'GET',
    uriEncode(url.pathname, false),
    canonicalQuery,
    `host:${url.hostname}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const kDate = await hmac(encoder.encode(`AWS4${config.secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, config.region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = bufToHex(await hmac(kSigning, [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256(canonicalRequest),
  ].join('\n')));

  return `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** S3 文件信息 */
export interface S3Object {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
}

/** S3 列表結果 */
export interface S3ListResult {
  files: S3Object[];
  isTruncated: boolean;
  nextCursor: string;
}

/** 列出 S3 存儲桶中的文件 (ListObjectsV2) */
export async function s3ListObjects(
  config: S3Config,
  prefix: string,
  maxKeys: number,
  cursor: string,
): Promise<S3ListResult> {
  const endpoint = config.endpoint.replace(/\/$/, '');
  const url = new URL(`${endpoint}/${config.bucket}`);

  // ListObjectsV2 參數
  url.searchParams.set('list-type', '2');
  url.searchParams.set('max-keys', String(maxKeys));
  if (prefix) url.searchParams.set('prefix', prefix);
  if (cursor) url.searchParams.set('continuation-token', cursor);

  // 簽名請求 (GET, 不需要 Content-Type)
  const { headers } = await signS3Request(
    'GET',
    url.toString(),
    config,
    null,
    '', // 空字串 = 不簽名 Content-Type
  );

  const resp = await fetch(url.toString(), { method: 'GET', headers });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`S3 ListObjects 失敗: ${resp.status} ${text}`);
  }

  const xml = await resp.text();

  // 解析 XML 響應 (簡易解析,不依賴外部 XML 庫)
  const files: S3Object[] = [];
  const isTruncated = xml.includes('<IsTruncated>true</IsTruncated>');

  // 提取 nextContinuationToken
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/);
  const nextCursor = tokenMatch ? tokenMatch[1] : '';

  // 提取文件條目
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match;
  while ((match = contentsRegex.exec(xml)) !== null) {
    const block = match[1];
    const keyMatch = block.match(/<Key>([^<]*)<\/Key>/);
    const sizeMatch = block.match(/<Size>([^<]*)<\/Size>/);
    const dateMatch = block.match(/<LastModified>([^<]*)<\/LastModified>/);
    const etagMatch = block.match(/<ETag>([^<]*)<\/ETag>/);

    if (keyMatch) {
      files.push({
        key: keyMatch[1],
        size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
        lastModified: dateMatch ? dateMatch[1] : '',
        etag: etagMatch ? etagMatch[1].replace(/&quot;/g, '').replace(/"/g, '') : '',
      });
    }
  }

  return { files, isTruncated, nextCursor };
}
