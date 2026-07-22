/**
 * 配置服務 - KV 緩存 + D1 回退
 * KV key: config:all (JSON map)
 */
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { okData, ok, err } from '../utils/response';
import type { S3Secrets } from './storage';

const CONFIG_CACHE_KEY = 'config:all';

/** 從 KV 緩存讀取配置,未命中時回退 D1 查詢後寫入 KV */
export async function getAllConfigs(
  db: D1Database,
  kv: KVNamespace,
): Promise<Record<string, string>> {
  // 先嘗試從 KV 讀取
  const cached = await kv.get(CONFIG_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch { /* KV 數據損壞,回退 D1 */ }
  }

  // KV 未命中,查詢 D1
  const result = await db.prepare('SELECT name, value FROM ay_config').all<{ name: string; value: string }>();
  const map: Record<string, string> = {};
  for (const row of result.results) {
    map[row.name] = row.value;
  }

  // 寫入 KV 緩存
  await kv.put(CONFIG_CACHE_KEY, JSON.stringify(map));

  return map;
}

/** 獲取單個配置項 */
export async function getConfig(
  db: D1Database,
  kv: KVNamespace,
  name: string,
  defaultValue = '',
): Promise<string> {
  const configs = await getAllConfigs(db, kv);
  return configs[name] ?? defaultValue;
}

/** 清除配置緩存 */
export async function clearConfigCache(kv: KVNamespace): Promise<void> {
  await kv.delete(CONFIG_CACHE_KEY);
}

/** 獲取站點信息 */
export async function getSiteInfo(db: D1Database): Promise<Record<string, unknown> | null> {
  const stmt = db.prepare('SELECT * FROM ay_site LIMIT 1');
  return await stmt.first();
}

/** 獲取所有配置 (API 響應)，v1.8.7: S3 憑證從 Secrets Store 注入虛擬條目 */
export async function handleListConfigs(
  db: D1Database,
  kv: KVNamespace,
  s3Secrets?: S3Secrets,
): Promise<Response> {
  await getAllConfigs(db, kv);
  const result = await db.prepare('SELECT * FROM ay_config ORDER BY sorting ASC').all();

  // v1.8.7: S3 憑證已遷移至 Secrets Store，注入虛擬條目到配置列表
  if (s3Secrets) {
    let accessKeyMasked = '';
    let secretKeyMasked = '';
    try { accessKeyMasked = (await s3Secrets.accessKeyStore.get()) ? '***' : ''; } catch { /* 未配置 */ }
    try { secretKeyMasked = (await s3Secrets.secretKeyStore.get()) ? '***' : ''; } catch { /* 未配置 */ }

    const configs = result.results as Array<{ id: number; name: string; value: string; type: string; sorting: number; description: string }>;
    configs.push(
      { id: 0, name: 's3_access_key', value: accessKeyMasked, type: '2', sorting: 72, description: 'S3 Access Key（Secrets Store）' },
      { id: 0, name: 's3_secret_key', value: secretKeyMasked, type: '2', sorting: 73, description: 'S3 Secret Key（Secrets Store）' },
    );
    configs.sort((a, b) => (a.sorting || 255) - (b.sorting || 255));
    return okData(configs, '成功');
  }

  return okData(result.results, '成功');
}

/** 修改配置，v1.8.7: S3 憑證寫入 Secrets Store 而非 D1 */
export async function handleUpdateConfig(
  db: D1Database,
  kv: KVNamespace,
  body: { configs?: Array<{ name?: string; value?: string }> },
  s3Secrets?: S3Secrets,
): Promise<Response> {
  const configs = body.configs;
  if (!Array.isArray(configs)) {
    return err('缺少 configs 參數');
  }

  // v1.8.7: S3 憑證由 Secrets Store 管理，不寫入 D1
  const S3_SECRET_FIELDS = new Set(['s3_access_key', 's3_secret_key']);

  for (const item of configs) {
    if (item.name !== undefined && item.value !== undefined) {
      if (S3_SECRET_FIELDS.has(item.name)) {
        if (item.value === '***') continue; // 未修改，跳過
        if (s3Secrets) {
          try {
            if (item.name === 's3_access_key') {
              await s3Secrets.accessKeyStore.put(item.value);
            } else {
              await s3Secrets.secretKeyStore.put(item.value);
            }
          } catch (e) {
            return err(`Secrets Store 寫入失敗: ${item.name}，請通過 wrangler CLI 手動更新`);
          }
          continue;
        }
      }
      await db.prepare('UPDATE ay_config SET value = ? WHERE name = ?')
        .bind(item.value, item.name)
        .run();
    }
  }

  await clearConfigCache(kv);
  return ok('配置更新成功');
}
