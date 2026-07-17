# AGENTS.md - 項目約束與開發規範

> 本文件是 AI 編程代理和開發者的強制約束文件。所有代碼生成、修改、審查必須遵守以下規則。

---

## 項目概述

TypeScript + Hono + Cloudflare Workers CMS，基於 PbootCMS 3.2.12 數據庫結構，前後端完全分離的純 API 後端。

### 參考項目

| 項目 | 路徑 |
|------|------|
| PbootCMS 3.2.12 (PHP原版) | `F:\mysite\AI\idea\pbootcmstogo\PbootCMS-3.2.12` |
| pbootcms-go (自研Go版) | `F:\mysite\AI\idea\pbootcmstogo\pbootcms-go` |
| 本項目 | `F:\mysite\AI\idea\Cloudflarerustcms` |

### Cloudflare 資源

| 資源 | 標識 |
|------|------|
| Worker | `rust-cms`（內部 Service Binding，不暴露公網域名） |
| D1 | `rust-cms-db`（ID: `28a95ec3-7228-4c47-b9f6-e9cfcfcaf319`） |
| KV | `CONFIG_CACHE`、`TOKEN_BLACKLIST`、`API_CACHE`（邏輯分離） |
| Queues | `publish-queue`（定時發布）、`publish-dlq`（死信隊列） |
| Vectorize | `article-semantic-search`（768維 cosine，中文語義搜索） |
| Workers AI | 嵌入模型 `@cf/baai/bge-base-zh-v1.5` |
| Rate Limiting | `PUBLIC_API_LIMIT`(60/min)、`ADMIN_API_LIMIT`(300/min)、`LOGIN_LIMIT`(5/min)、`FORM_LIMIT`(1/10s) |
| 功能開關 | D1 存儲 + `FLAG_REGISTRY` 註冊表驅動，後台直接管理 |
| Pages | `cms-admin`（管理後台 SPA），域名 `rbootcms.cmer.eu.org` |
| Service Binding | Pages `cms-admin` → Worker `rust-cms`（零延遲內部通信） |
| GitHub | `https://github.com/vikim540/RustCMS.git` |
| 賬號 | `waicun_lee@outlook.com`（Account ID: `f5d4e94cb23f69f8ae69baedff94f2ba`） |

---

## 硬約束

### 1. 數據庫

- 表前綴 `ay_` 保持不變，可按需修改/新增表結構和字段
- SQL 始終使用 `.bind()` 參數化，禁止字符串拼接
- 新增表/字段使用冪等語法：`CREATE TABLE IF NOT EXISTS`、`ALTER TABLE ... ADD COLUMN`

### 2. 技術棧

- 後端：**TypeScript + Hono**，Cloudflare Workers 原生運行時
- 數據庫：**D1**（`db.prepare().bind().all()`）
- 緩存：**KV**（`config:all` 配置緩存 + JWT 黑名單 + API 響應緩存）
- 存儲：**R2**（S3 兼容，AWS SigV4 簽名）
- 佇列：**Queues**（定時文章發布，`delaySeconds` 上限 24 小時，Cron 每 15 分鐘掃描）
- 語義搜索：**Vectorize + Workers AI**（`@cf/baai/bge-base-zh-v1.5`，768 維）
- 速率限制：**Rate Limiting bindings**（零網絡開銷）
- 功能開關：**D1 存儲** + `FLAG_REGISTRY` 註冊表驅動（`src/services/flags.ts`）
- 郵件：**MailChannels / Resend** HTTP API
- 前端：**React 18 + Vite + Tailwind CSS**（Cloudflare Pages）
- 內部通信：**Service Bindings**（Pages ↔ Worker 零延遲）

### 3. 禁止依賴

| 禁止 | 替代 |
|------|------|
| `sqlx` / 數據庫驅動 | D1 binding API |
| `jsonwebtoken` | Web Crypto API 自實現 HS256 |
| `bcrypt` / `argon2` | 雙 MD5（`md5(md5(password))`） |
| `nodemailer` / SMTP 庫 | MailChannels / Resend HTTP API |
| `node-fetch` / `axios` | 全局 `fetch()` |
| `lucide-react` / 字體圖標 | emoji |

### 4. 密碼方案

雙 MD5：`md5(md5(password))`，與 PbootCMS/Go 版兼容，常量時間比較防時序攻擊。

### 5. 前後端分離

- Worker 只返回 JSON，禁止渲染 HTML
- 管理後台 SPA 部署在 Pages（`cms-admin`），禁止打包進 Worker
- 前端通過 Pages Functions 使用 **Service Binding** 內部代理 API，未配置時回退公網 `fetch`

---

## 代碼規範

- 命名：camelCase（函數/變量）、PascalCase（接口/類型）、UPPER_SNAKE_CASE（常量）
- 模塊：`index.ts`（路由薄）→ `services/*.ts`（業務厚）→ `utils/*.ts`（純函數）
- 錯誤處理：service 返回 `Response`，`try/catch` 包裹外部調用
- SQL：`.bind()` 參數化，禁止拼接
- 類型：嚴格 TS，禁止 `any`（用 `unknown` + 斷言）
- 圖標：全盤使用 emoji，禁止 SVG/字體圖標庫

### 統一響應格式

```jsonc
{ "code": 0, "msg": "成功", "data": {}, "meta": { "page": 1, "pagesize": 20, "total": 100 } }
```

### API 路由

- 前綴 `/api/v1/`，RESTful
- 公開：`/api/v1/{resource}`（無認證，60 req/min）
- 管理：`/api/v1/admin/{resource}`（JWT `requireAuth`，300 req/min）
- 語義搜索：`/api/v1/search?q=關鍵詞&topK=10&threshold=0.7`
- 功能開關：`/api/v1/admin/flags`（GET 查詢，PUT 切換）

---

## 業務邏輯約束

### 內容按模型分類（mcode 邏輯）

- 側邊欄動態生成模型子菜單（`type='2'` 列表型模型）
- 後端子查詢過濾：`scode IN (SELECT scode FROM ay_content_sort WHERE mcode = ?)`
- 內容管理僅管理有編輯器的文章，**媒體庫資源不混入**（`scode != ''` 過濾）
- 媒體庫通過 S3 ListObjects 直接列出，不寫入 `ay_content` 表

### 圖片上傳

支持：① 上傳 R2（`POST /admin/upload`）② 手動輸入外鏈 URL ③ 從媒體庫選擇（`MediaPickerModal` 組件）。

### CORS 動態域名校驗

中間件從 KV 讀取 `api_cors_origins`，配置白名單則僅允許列出的 Origin，未配置則允許 `*`。前端使用 TagInput 標籤式輸入，自動剝離 `http://`/`https://` 前綴。

### 通知服務（Webhook + 郵件 + 功能開關）

- **功能開關**：`mail_enabled` / `webhook_enabled` 控制總開關
  - 註冊表驅動：`src/services/flags.ts` 的 `FLAG_REGISTRY`（key/label/description/icon/defaultValue/protectedRoutes）
  - D1 存儲：後台直接切換，無需外部面板
  - 後端攔截：`autoRouteProtection()` 中間件自動攔截 `protectedRoutes`，關閉時返回 `code:1004`
  - 前端組件化：`FeatureFlagProvider` + `useFeatureFlags` + `<FeatureGate>`，關閉時隱藏配置區域
  - **新增大功能**：在 `FLAG_REGISTRY` 加一條即可，前端/後端/API 攔截全部自動生效
- **Webhook**（`src/services/notify.ts`）：自動檢測平台（釘釘/企業微信/通用 JSON），分項開關
- **郵件**：MailChannels / Resend HTTP API，HTML 模板含漸層 header / 字段表格 / footer
- 通知日誌復用 `ay_syslog`，使用 `ctx.waitUntil()` 確保異步生命週期

### 定時文章發布（Queues + Cron）

- 文章 `date` 字段作為發布時間，`status='0'` 為草稿
- Cron 每 15 分鐘掃描 24 小時內待發布文章，投遞延遲消息到 Queue
- 已過期草稿直接在 Cron 中發布（兜底機制）

### 語義搜索（Vectorize + Workers AI）

- 文章創建/更新時自動索引（標題+正文剝離 HTML，截斷 2000 字）
- 搜索流程：搜索詞 → Workers AI 嵌入 → Vectorize 查詢 → 相似度閾值過濾 → D1 取完整文章
- 重建索引：`POST /api/v1/admin/vectorize/reindex`

### KV API 響應緩存

- 僅緩存公開 GET 請求，內容列表 TTL: 300s，配置數據 TTL: 3600s
- 內容 CRUD 後 `clearContentCache`，配置更新後 `clearConfigCache`

---

## PbootCMS 邏輯索引

| 功能 | 本項目實現 |
|------|--------|
| 欄目樹 | `src/services/sort.ts` `buildSortTree` |
| 內容按模型 | `src/services/content.ts` `handleAdminListContents` |
| 配置加載 | `src/services/config.ts` KV `config:all` |
| 密碼 | `src/utils/password.ts` 雙 MD5 |
| 權限 | `src/services/auth.ts` JWT + `requireAuth`（超級管理員跳過） |
| Webhook | `src/services/notify.ts` `sendWebhook` |
| 郵件 | `src/services/notify.ts` MailChannels / Resend |
| 語義搜索 | `src/services/vectorize.ts` Vectorize + Workers AI |
| 定時發布 | `src/services/scheduler.ts` Queues + Cron |
| 速率限制 | `src/services/ratelimit.ts` Rate Limiting bindings |
| 功能開關 | `src/services/flags.ts` D1 + FLAG_REGISTRY |
| API 緩存 | `src/services/cache.ts` KV |
| 時間工具 | `src/utils/datetime.ts` UTC+8 香港時區 |

---

## 環境與工具

- wrangler 4.96.0：`D:\AI\Cache\pnpm-home\wrangler.CMD`（全局 wrangler 3.1.0 禁用）
- pnpm：`D:\AI\Cache\pnpm-home`
- Node.js >= 18：系統 PATH
- Cloudflare API Token：環境變量 `CLOUDFLARE_API_TOKEN`
- JWT_SECRET：wrangler secret
- PowerShell 只用 pwsh.exe 7，禁止寫入 C 盤，所有工具/緩存存放在 `D:\AI`

---

## 常用命令

```powershell
# 後端開發
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' dev

# 前端開發
cd admin; npx vite dev

# 部署（先 Worker 後 Pages）
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' deploy
cd admin; npx vite build
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' pages deploy build --project-name=cms-admin

# 數據庫遷移
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' d1 migrations apply rust-cms-db --remote

# 執行 SQL
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' d1 execute rust-cms-db --remote --command "SELECT * FROM ay_config LIMIT 5"

# 生成類型（配置變更後必須運行）
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' types

# Git
git add -A; git commit -m '✨ feat: 描述'; git push origin main
```

---

## 開發檢查清單

1. 是否有 PbootCMS/Go 版對應實現？優先參考
2. SQL 是否參數化？
3. 響應格式是否統一 `{code,msg,data}`？
4. 配置修改後是否清除 KV 緩存？
5. 通知服務是否異步觸發（`ctx.waitUntil`）？
6. 功能開關是否檢查？
7. 媒體庫上傳是否避免了寫入 `ay_content`？
8. 圖標是否使用 emoji？
9. **是否同步更新了儀表盤的版本更新、API 開發手冊、系統信息？（強制）**
10. **版本更新完成後是否推送釘釘 webhook 通知？（強制）**

---

## 儀表盤同步更新規則（強制）

> **每次修改代碼後，必須同步更新 `admin/src/pages/Dashboard.tsx` 中的以下三個 Tab。**

### 版本更新 Tab

- 新增版本條目到 `VERSIONS` 數組頂部，設 `latest: true`，舊版本移除 `latest`
- 格式：`{ version: 'vX.Y.Z', date: 'YYYY-MM-DD HH:mm:ss', icon: 'emoji', latest: true, changes: '簡述' }`
- 版本號：主版本（架構變更）/ 次版本（功能新增）/ 修訂號（Bug 修復）

### API 開發手冊 Tab

- 新增/修改 API 端點時，同步更新 `API_ENDPOINTS` 數組
- 新增錯誤碼時，同步更新 `ERROR_CODES` 數組

### 系統信息 Tab

- Cloudflare 資源變更時更新資源表格
- 技術棧變更時更新項目信息卡片
