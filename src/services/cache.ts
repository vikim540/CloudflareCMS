/**
 * KV 緩存清除工具
 *
 * 設計變更（v1.7.0）：
 *   原 apiCache() 中間件（KV 響應緩存）已被 Workers Cache（聲明式邊緣緩存）取代。
 *   Workers Cache 通過 Cache-Control 頭 + Vary: X-Site-Id 實現邊緣緩存，
 *   無需 KV 讀寫，零延遲、自動繞過 Authorization 請求。
 *
 *   本文件保留 clearContentCache / clearApiCacheRemnants 用於清除 KV 中殘留的
 *   API 響應緩存條目（api:GET:* 前綴）。
 *   config.ts 的 clearConfigCache 負責清除 config:all 配置緩存鍵。
 *   內容/配置 CRUD 後仍調用這些函數確保 KV 緩存即時失效。
 */
import type { KVNamespace } from '@cloudflare/workers-types';

/**
 * 按前綴清除緩存
 * 注意: KV 的 list 操作有最終一致性，可能有少量殘留
 */
export async function clearCacheByPrefix(kv: KVNamespace, prefix: string): Promise<void> {
  try {
    const list = await kv.list({ prefix });
    const keys = list.keys.map((k) => k.name);
    if (keys.length > 0) {
      await Promise.all(keys.map((k) => kv.delete(k)));
    }
  } catch {
    // 清除失敗不影響主流程
  }
}

/**
 * 清除內容相關緩存
 * 在文章創建/更新/刪除時調用
 */
export async function clearContentCache(kv: KVNamespace): Promise<void> {
  await clearCacheByPrefix(kv, 'api:GET:/api/v1/contents');
  await clearCacheByPrefix(kv, 'api:GET:/api/v1/sorts');
}

/**
 * 清除公開 API 響應緩存殘留
 * 在系統配置/站點信息/標籤更新時調用（清除 api:GET:* 前綴的 KV 殘留）
 */
export async function clearApiCacheRemnants(kv: KVNamespace): Promise<void> {
  await clearCacheByPrefix(kv, 'api:GET:/api/v1/site');
  await clearCacheByPrefix(kv, 'api:GET:/api/v1/nav');
  await clearCacheByPrefix(kv, 'api:GET:/api/v1/singles');
  await clearCacheByPrefix(kv, 'api:GET:/api/v1/links');
  await clearCacheByPrefix(kv, 'api:GET:/api/v1/slides');
  await clearCacheByPrefix(kv, 'api:GET:/api/v1/tags');
  await clearCacheByPrefix(kv, 'api:GET:/api/v1/labels');
}
