/**
 * 多站點數據庫路由工具
 *
 * 設計：
 * - 主庫 (DB binding = endoscopy-cms)：存儲全局用戶/角色/菜單/站點註冊表
 * - 站點庫 (DB_SMILE/DB_VISION/動態)：存儲各站點內容/配置等獨立數據
 * - 中間件解析 X-Site-Id header → 解析對應 binding → 存入 c.var.siteDb
 * - 數據路由用 siteDB(c)，認證/系統路由用 primaryDB(c)（= c.env.DB）
 *
 * 動態站點（REST API 模式）：
 * - 通過 Cloudflare REST API 創建的新站點，binding 為空
 * - 使用 D1RestClient 訪問（延遲較高但無需重新部署）
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { Context } from 'hono';

/** 站點註冊條目 */
export interface SiteEntry {
  binding: string;
  name: string;
  domain: string;
  isPrimary?: boolean;
}

/** 從 SITE_REGISTRY vars 解析站點映射 */
export function parseSiteRegistry(registryStr: string): Record<string, SiteEntry> {
  try {
    return JSON.parse(registryStr) as Record<string, SiteEntry>;
  } catch {
    return {};
  }
}

/** App 環境類型（含站點變量，兼容 index.ts 的 AppEnv） */
export interface SiteAppEnv {
  Variables: {
    siteDb?: D1Database;
    siteId?: string;
    siteName?: string;
  };
  Bindings: {
    DB: D1Database;
    SITE_REGISTRY?: string;
  };
}

/**
 * 獲取當前請求的站點數據庫（數據路由用）
 * fallback 到主庫（未設置站點時）
 */
export function siteDB<T extends SiteAppEnv>(c: Context<T>): D1Database {
  return c.get('siteDb') ?? c.env.DB;
}

/**
 * 獲取主庫（認證/用戶/角色/菜單/站點註冊表用）
 * 始終返回 c.env.DB（= endoscopy-cms）
 */
export function primaryDB<T extends SiteAppEnv>(c: Context<T>): D1Database {
  return c.env.DB;
}

/** 獲取當前站點 ID */
export function currentSiteId<T extends SiteAppEnv>(c: Context<T>): string {
  return c.get('siteId') ?? 'endoscopy';
}

/** 獲取當前站點名稱 */
export function currentSiteName<T extends SiteAppEnv>(c: Context<T>): string {
  return c.get('siteName') ?? 'Endoscopy CMS';
}

/**
 * 根據 site_id 解析對應的 D1 binding
 * @returns D1Database | null（null 表示需用 REST API）
 */
export function resolveBinding<T extends SiteAppEnv>(
  c: Context<T>,
  siteId: string,
): D1Database | null {
  const registry = parseSiteRegistry(c.env.SITE_REGISTRY ?? '{}');
  const entry = registry[siteId];
  if (!entry || !entry.binding) return null;
  const envBindings = c.env as unknown as Record<string, D1Database>;
  const db = envBindings[entry.binding];
  return db ?? null;
}

/**
 * 獲取所有已註冊站點列表（從 SITE_REGISTRY vars）
 */
export function listRegisteredSites(registryStr: string): Array<SiteEntry & { siteId: string }> {
  const registry = parseSiteRegistry(registryStr);
  return Object.entries(registry).map(([siteId, entry]) => ({
    siteId,
    ...entry,
  }));
}

// ============================================================================
// D1 REST API Client（動態站點用，原生 binding 不可用時）
// ============================================================================

export interface D1RestResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta: Record<string, unknown>;
}

/**
 * D1 REST API 查詢客戶端
 * 用於動態創建的站點（未在 wrangler.jsonc 中綁定）
 *
 * 注意：每次查詢為 HTTP 往返（50-200ms），性能低於原生 binding（<5ms）
 * 僅在動態站點使用，預綁定站點始終用原生 binding
 */
export class D1RestClient {
  constructor(
    private accountId: string,
    private databaseId: string,
    private apiToken: string,
  ) {}

  private get baseUrl(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
  }

  /** 執行查詢（帶參數綁定） */
  async query(sql: string, params: unknown[] = []): Promise<D1RestResult[]> {
    const resp = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify({ sql, params }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`D1 REST API ${resp.status}: ${text}`);
    }
    const data = (await resp.json()) as {
      result?: D1RestResult[];
      errors?: Array<{ message: string }>;
    };
    if (data.errors?.length) {
      throw new Error(data.errors.map((e) => e.message).join('; '));
    }
    return data.result ?? [];
  }

  /** 執行單條查詢並返回第一行 */
  async first<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const results = await this.query(sql, params);
    if (!results.length || !results[0].results.length) return null;
    return results[0].results[0] as T;
  }

  /** 執行查詢並返回所有行 */
  async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const results = await this.query(sql, params);
    if (!results.length) return [];
    return results[0].results as T[];
  }

  /** 執行寫操作（INSERT/UPDATE/DELETE） */
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertId: number }> {
    const results = await this.query(sql, params);
    const meta = (results[0]?.meta ?? {}) as { changes?: number; last_row_id?: number };
    return { changes: meta.changes ?? 0, lastInsertId: meta.last_row_id ?? 0 };
  }

  /** 執行多條 SQL（無參數，用於 migration/schema 初始化） */
  async exec(sqlStatements: string): Promise<{ count: number }> {
    const execUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/exec`;
    const resp = await fetch(execUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify({ sql: sqlStatements }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`D1 REST exec ${resp.status}: ${text}`);
    }
    const data = (await resp.json()) as { result?: { count?: number }[] };
    return { count: data.result?.[0]?.count ?? 0 };
  }
}

/**
 * 創建新的 D1 數據庫（通過 Cloudflare REST API）
 * @returns 新數據庫的 UUID
 */
export async function createD1Database(
  accountId: string,
  apiToken: string,
  name: string,
  location = 'apac',
): Promise<{ uuid: string; name: string }> {
  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ name, location }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`創建 D1 失敗 ${resp.status}: ${text}`);
  }
  const data = (await resp.json()) as {
    result?: { uuid: string; name: string };
    errors?: Array<{ message: string }>;
  };
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join('; '));
  }
  if (!data.result?.uuid) {
    throw new Error('創建 D1 失敗：未返回 UUID');
  }
  return { uuid: data.result.uuid, name: data.result.name };
}
