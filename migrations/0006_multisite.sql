-- Migration 0006: 多站點管理表（僅主庫 endoscopy-cms）
-- ay_site_registry: 站點註冊表（全局，記錄所有站點信息）
-- ay_user_site: 用戶-站點映射（非超管用戶可訪問的站點列表）

-- 站點註冊表
CREATE TABLE IF NOT EXISTS ay_site_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL UNIQUE,          -- 站點唯一標識 (endoscopy/smile/vision/opd...)
  name TEXT NOT NULL,                     -- 站點顯示名稱 (Endoscopy CMS)
  binding TEXT DEFAULT '',                -- 原生 binding 名 (DB/DB_SMILE/DB_VISION)，空表示 REST API
  database_id TEXT DEFAULT '',            -- D1 database UUID（REST API 模式使用）
  database_name TEXT DEFAULT '',          -- D1 database 名稱
  domain TEXT DEFAULT '',                 -- 站點域名
  region TEXT DEFAULT 'apac',             -- 數據庫地區
  access_type TEXT DEFAULT 'binding',     -- 'binding' (原生綁定) 或 'rest_api' (REST API 動態)
  status TEXT DEFAULT '1',                -- '1' 啟用 / '0' 禁用
  is_primary INTEGER DEFAULT 0,           -- 1 = 主庫（認證/用戶/角色存儲於此）
  sorting INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- 用戶-站點映射（非超管用戶可訪問的站點）
CREATE TABLE IF NOT EXISTS ay_user_site (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  site_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  UNIQUE(user_id, site_id)
);

-- 種子數據：3 個預創建站點
INSERT OR IGNORE INTO ay_site_registry (site_id, name, binding, database_id, database_name, domain, region, access_type, status, is_primary, sorting) VALUES
  ('endoscopy', 'Endoscopy CMS', 'DB', 'c824a999-6a14-4878-bc43-2f3de023cbde', 'endoscopy-cms', 'cms.cmermedical.com.hk', 'apac', 'binding', '1', 1, 1),
  ('smile', 'Smile CMS', 'DB_SMILE', 'f59320b5-b1f2-47cf-8b32-e341e1c5da48', 'smile-cms', 'smile.cmermedical.com.hk', 'apac', 'binding', '1', 0, 2),
  ('vision', 'Vision CMS', 'DB_VISION', 'a49903a9-098e-43cd-934c-9bad2466d8ae', 'vision-cms', 'vision.cmermedical.com.hk', 'apac', 'binding', '1', 0, 3);

-- 為現有用戶（admin 超管）分配所有站點（超管其實不需要，但保持數據完整性）
INSERT OR IGNORE INTO ay_user_site (user_id, site_id)
  SELECT u.id, s.site_id FROM ay_user u CROSS JOIN ay_site_registry s
  WHERE u.status = '1';
