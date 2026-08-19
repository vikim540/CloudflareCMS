# AGENTS.md — 項目約束與開發規範

> **強制約束文件**。所有代碼生成、修改、審查必須遵守。當前版本：**v1.9.68**（2026-08-19）

## 語言選擇優先級

> **Rust 優先原則**：旨在效率和性能的提升，Rust 語言為首選實現語言。
> 但當 TypeScript 在以下方面更優時，可次之使用：
> - Cloudflare 生態環境匹配度（Workers 原生支持、綁定兼容性）
> - 插件/庫生態成熟度（Hono、D1 binding、Vectorize 等）
> - 代碼合理性與可維護性（類型安全、開發效率）
> - 社區支持與文檔完整性

| 場景 | 推薦語言 | 原因 |
|------|----------|------|
| Worker 後端業務邏輯 | TypeScript | Cloudflare Workers 原生支持，Hono 框架 + D1/KV/Queue binding 無縫集成 |
| 高性能計算/數據處理 | Rust | 編譯為 WASM，零成本抽象，內存安全 |
| 前端 SPA | TypeScript | React + Vite 生態，TSX 類型安全 |
| 密碼學/簽名算法 | Rust → WASM | 性能敏感場景優先 Rust，編譯為 WASM 在 Workers 中調用 |

---

## 環境與工具

| 工具 | 版本/路徑 | 備註 |
|------|-----------|------|
| wrangler | ^4.115.0（package.json） | ⚠️ 必須使用 `npx wrangler` 調用（直接 `wrangler` 命中 Yarn 全局 3.1.0，路徑 `D:\Program Files\nodejs\Yarn\bin\wrangler.cmd`，過時不可用）。本地 `node_modules/wrangler` 已升級至 4.115.0。⚠️ TRAE 沙箱中 pnpm 跨盤符號連結會觸發 EBUSY，需使用 `pnpm install --store-dir='F:\mysite\AI\idea\Cloudflarerustcms\.pnpm-store'` 同盤安裝 |
| pnpm | 11.5.1 | `D:\AI\Cache\pnpm-home`（全局緩存 `D:\AI\Cache\pnpm`）。⚠️ CI 環境配置：根目錄 + `admin/` 各有獨立 `pnpm-workspace.yaml`，同時保留 `package.json` 的 `pnpm` 字段（pnpm 10.x 向下兼容）。三層配置：`onlyBuiltDependencies`（pnpm 10.x）+ `allowBuilds`（pnpm 11.x）+ `dangerouslyAllowAllBuilds`（CI 核彈級開關） |
| Node.js | >= 18 | 系統 PATH |
| PowerShell | pwsh.exe 7 | 禁止寫入 C 盤，所有工具/緩存存放 `D:\AI` |
| Cloudflare API Token | 環境變量 `CLOUDFLARE_API_TOKEN` | — |
| JWT_SECRET | Secrets Store | Store ID: `aef7c32e26c84aedb4b2a5938128ca23`，異步綁定 `JWT_SECRET_STORE` |
| TZ | `Asia/Hong_Kong` | wrangler.jsonc vars，代碼中用 `toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' })` 獲取 HK 時間 |

---

## 目錄結構

```
Cloudflarerustcms/
├── src/                        # 後端 Worker（TypeScript + Hono）
│   ├── index.ts                # 路由薄層 + 中間件註冊
│   ├── services/               # 業務厚層（每個功能一個文件）
│   │   ├── auth.ts             # JWT + 權限（reloadUserPermissions 實時刷新）
│   │   ├── booking.ts          # 講座預約管理（日曆圖片 + 排期，僅 smile 站點）
│   │   ├── content.ts          # 內容 CRUD + 按模型過濾 + 內鏈替換
│   │   ├── config.ts           # KV 配置緩存（config:all 讀寫 + clearConfigCache）
│   │   ├── extra.ts            # 公司信息/輪播圖/友情鏈接/標籤/單頁（HK 本地化）
│   │   ├── flags.ts            # FLAG_REGISTRY 功能開關註冊表
│   │   ├── forms.ts            # 統一表單提交系統（POST /f/:token + 管理 CRUD）
│   │   ├── notify.ts           # Webhook + 郵件通知
│   │   ├── vectorize.ts        # 語義搜索（Vectorize + Workers AI）
│   │   ├── scheduler.ts        # Queues 定時發布 + Cron
│   │   ├── ratelimit.ts        # Rate Limiting bindings
│   │   ├── cache.ts            # KV 緩存清理（clearContentCache / clearApiCacheRemnants）
│   │   ├── site.ts             # 多站點管理（CRUD + 動態站點創建 + 用戶站點分配）
│   │   ├── storage.ts          # R2/S3 S3 兼容存儲 + 媒體庫引用
│   │   ├── sort.ts             # 欄目樹 buildSortTree
│   │   ├── model.ts            # 內容模型管理
│   │   └── system.ts           # 系統日誌/菜單/數據庫
│   └── utils/                  # 純函數
│       ├── jwt.ts              # Web Crypto HS256 自實現
│       ├── password.ts         # 雙 MD5
│       ├── response.ts         # okData/err/forbidden 統一響應
│       ├── datetime.ts         # UTC+8 香港時區
│       ├── pagination.ts       # 分頁工具
│       ├── sanitize.ts         # HTML 淨化（sanitizeHtml / stripHtmlTags，XSS 防禦）
│       ├── sitedb.ts           # 多站點數據庫路由（siteDB / currentSiteId / parseSiteRegistry）
│       ├── tagLink.ts          # 文章內鏈替換引擎（五步預佔位策略）
│       └── s3sig.ts            # AWS SigV4 簽名（純 Web Crypto）
├── admin/                      # 前端 SPA（React 18 + Vite + Tailwind）
│   ├── functions/api/v1/[[path]].ts  # Pages Functions Service Binding 代理（→ cfstack-cms）
│   ├── src/
│   │   ├── App.tsx             # 路由 + RequirePermission 守衛
│   │   ├── components/         # Layout / ImageCompressDialog / TagInput 等（14 組件）
│   │   ├── contexts/           # SiteContext（站點切換 + 過渡動畫）
│   │   ├── hooks/              # useFeatureFlags / useImageUpload / useBatchSorting
│   │   ├── lib/                # api.ts / imageCompress.ts / utils.ts / quill/（編輯器插件）
│   │   └── pages/              # 25 個頁面組件（v1.9.39 合併存儲設置至系統設置，v1.9.40 權限 toast 修復）
│   ├── vite.config.ts          # 輸出目錄 deploy（非 build！fixEmptyChunksPlugin）
│   ├── wrangler.jsonc          # Pages 部署配置 + Service Binding（binding: API → cfstack-cms）
│   └── package.json
├── migrations/                 # D1 遷移（冪等語法，0001_init.sql + 0002_booking.sql + 0003_indexes.sql + 0004_backup_config.sql）
├── pnpm-workspace.yaml         # pnpm 11.x 配置（onlyBuiltDependencies + allowBuilds + dangerouslyAllowAllBuilds）
└── wrangler.jsonc              # Worker 配置（bindings + cron + cache + placement）
```

> **注意**：早期 Rust 原型遺留（`src/model/`、`src/service/`、`src/util/`、`Cargo.toml`）已於 v1.7.0 清理刪除。當前使用 `src/services/` 和 `src/utils/`（`.ts`）。

---

## Cloudflare 資源

| 資源 | 標識 | 說明 |
|------|------|------|
| Worker | `cfstack-cms` | 內部 Service Binding，**公網 URL 已禁用**（`workers_dev: false`） |
| D1（主庫） | `endoscopy-cms` | ID: `c824a999-6a14-4878-bc43-2f3de023cbde`（認證/用戶/角色/菜單/站點註冊表） |
| D1（smile） | `smile-cms` | ID: `f59320b5-b1f2-47cf-8b32-e341e1c5da48` |
| D1（vision） | `vision-cms` | ID: `a49903a9-098e-43cd-934c-9bad2466d8ae` |
| KV | `CONFIG_CACHE` / `TOKEN_BLACKLIST` / `API_CACHE` | 邏輯分離（CONFIG_CACHE 與 API_CACHE 共用 namespace） |
| Queues | `publish-queue` → `publish-dlq` / `backup-queue` → `backup-dlq` | 定時發布（Cron 每 15 分鐘）/ 異步備份（v1.9.47+，max_concurrency=1，max_retries=3） |
| Vectorize | `article-semantic-search` | 768 維 cosine，多語言語義搜索 |
| Workers AI | `@cf/baai/bge-base-en-v1.5` | XLM-RoBERTa 嵌入模型，支持中文 |
| Rate Limiting | `PUBLIC_API_LIMIT`(60/min) / `ADMIN_API_LIMIT`(300/min) / `LOGIN_LIMIT`(5/min) / `FORM_LIMIT`(1/10s) | 零網絡開銷 |
| Flagship | `Flagship-service`（app: `Rustcms-service`） | 真混合模式：Flagship 優先（`getBooleanValue`），失敗回退 D1；Flagship 模式下開關只讀 |
| Secrets Store | `default_secrets_store`（ID: `aef7c32e26c84aedb4b2a5938128ca23`） | 異步綁定（`await env.X.get()`），存儲 JWT_SECRET + CF_API_TOKEN + TURNSTILE_SECRET_KEY + S3_ACCESS_KEY + S3_SECRET_KEY |
| Workers Cache | `cache.enabled: true` | 聲明式邊緣緩存，公開 GET 自動緩存（配置 3600s / 內容 300s），排除 /admin/* 及 /auth/*，Vary: X-Site-Id 多站點分區 |
| Smart Placement | `placement.mode: smart` | Worker 自動部署靠近 D1 的數據中心，降低數據庫延遲 |
| Pages | `cms-admin` | 管理後台 SPA，域名 `cms.cmermedical.com.hk` |
| Service Binding | Pages `cms-admin` → Worker `cfstack-cms` | 零延遲內部通信。配置：`admin/wrangler.jsonc`（services 字段，binding: `API`）。代理腳本：`admin/functions/api/v1/[[path]].ts` |
| GitHub | `https://github.com/vikim540/CloudflareCMS.git` | 賬號 `waicun_lee@outlook.com`（Account ID: `f5d4e94cb23f69f8ae69baedff94f2ba`） |

---

## 硬約束

### 數據庫

- 表前綴 `ay_` 不變，**可按需修改/新增表結構和字段**
- SQL 始終 `.bind()` 參數化，**禁止字符串拼接**
- 新增表/字段用冪等語法：`CREATE TABLE IF NOT EXISTS`、`ALTER TABLE ... ADD COLUMN`
- 遷移文件編號需唯一（v1.9.33 已合併 0001-0007 為單一 `0001_init.sql`。後續新增從 0002 開始）

### 禁止依賴

| 禁止 | 替代 |
|------|------|
| `sqlx` / 數據庫驅動 | D1 binding API |
| `jsonwebtoken` | Web Crypto API 自實現 HS256 |
| `bcrypt` / `argon2` | 雙 MD5（`md5(md5(password))`，與 PbootCMS/Go 版兼容） |
| `nodemailer` / SMTP 庫 | MailChannels / Resend HTTP API |
| `node-fetch` / `axios` | 全局 `fetch()` |
| `lucide-react` / 字體圖標 | emoji（`lucide-react` 已從 package.json 移除） |

### 前後端分離

- Worker **只返回 JSON**，禁止渲染 HTML
- 管理後台 SPA 部署在 Pages（`cms-admin`），**禁止打包進 Worker**
- 前端通過 Pages Functions **Service Binding** 內部代理 API（`admin/functions/api/v1/[[path]].ts`），未配置時返回 500 錯誤

---

## 代碼規範

- **命名**：camelCase（函數/變量）、PascalCase（接口/類型）、UPPER_SNAKE_CASE（常量）
- **模塊**：`index.ts`（路由薄）→ `services/*.ts`（業務厚）→ `utils/*.ts`（純函數）
- **錯誤處理**：service 返回 `Response`，`try/catch` 包裹外部調用
- **類型**：嚴格 TS，禁止 `any`（用 `unknown` + 斷言）
- **圖標**：全盤 emoji，禁止 SVG/字體圖標庫
- **代碼一致性（不留手尾）**：重構/遷移/重命名時，必須同步更新所有牽連引用（數據庫、前端、遷移文件、版本文本、文檔）。子菜單 `mcode` 應與父菜單 `pcode` 分組前綴對齊（如 M500 系統管理下的子菜單應為 M50x，而非保留舊分組的 M308）。禁止「改了一處、留一處」造成日後維護時的認知負擔與疑問遐想空間

### 統一響應格式

```jsonc
{ "code": 0, "msg": "成功", "data": {}, "meta": { "page": 1, "pagesize": 20, "total": 100 } }
```

### API 路由

- 前綴 `/api/v1/`，RESTful
- **公開**：`/api/v1/{resource}`（無認證，60 req/min）— 含 `/api/v1/company`（公開公司聯繫信息）、`/api/v1/search`（語義搜索）、`/api/v1/auth/turnstile-config`（Turnstile 配置）、`/api/v1/booking/calendars` + `/api/v1/booking/schedules`（講座預約，僅 GET）
- **管理**：`/api/v1/admin/{resource}`（JWT `requireAuth` + `requireMenuPermission`，300 req/min）
  - `database` / `storage` 路由僅超管可用 `requireSuperAdmin`
  - `flags` / `stats` / `upload` / `notify` / `vectorize` 路由僅需登錄（無菜單權限限制）
  - **存儲配置管理**（v1.9.39+）：S3 配置通過 `/admin/configs` API 管理（M503 權限），S3 憑證（s3_access_key / s3_secret_key）以 `***` 遮罩注入配置列表，寫入時路由至 Secrets Store。前端存儲配置 tab 僅超管可見（隱藏非超管的存儲配置 tab + 過濾 sorting 70-79 配置項）。`/admin/storage/*` 路由保留用於連接測試、上傳測試、媒體庫操作等

---

## 權限系統（RBAC）

> **v1.5.5 核心修復**：JWT 權限實時刷新，無需重新登錄即可生效。

### 機制

1. **登錄**：生成 JWT（含 `isSuper` + `permissions` 快照），有效期 7 天
2. **每次 admin 請求**：中間件為非超管用戶調用 `reloadUserPermissions()` 從 D1 重新加載權限，**覆蓋 JWT 中的過時權限**
3. **禁用用戶**：返回 401（code 2006），觸發前端登出
4. **前端刷新**：Layout 掛載時拉取 `/auth/profile` 更新 localStorage 權限，`Outlet key` 綁定權限變化確保 `RequirePermission` 即時生效

### HTTP 狀態碼語義

> **v1.8.4 修復**：`err()` 函數原邏輯 `code >= 2000 ? 401 : 400` 導致 2001（密碼錯誤）和 2007（Turnstile 失敗）也返回 401，前端誤判為「登錄已過期」。現改用 `AUTH_ERROR_CODES` 白名單，僅 2002/2003/2004/2006 返回 401。

| 狀態碼 | code | 含義 | 前端行為 |
|--------|------|------|----------|
| 401 | 2002/2003/2004/2006 | 未認證/Token 過期/已登出/用戶禁用 | 重定向 login |
| 403 | 2005 | 權限拒絕 | 彈出 toast 提示（**不重定向**） |
| 400 | 2001/2007 | 密碼錯誤/Turnstile 人機驗證失敗 | 登錄頁提示重試 |

### 回收站路由特殊處理

`/api/v1/admin/contents/trash`、`/contents/:id/restore`、`/contents/:id/permanent` 使用 **M208** 權限（非 M201 文章列表），在中間件中按路徑動態判斷。

### 公開讀取端點白名單（v1.9.40）

`PUBLIC_READ_PATHS` 集合定義側邊欄/下拉選單需要的輕量級引用數據端點，所有登錄用戶可 GET 訪問（跳過 `requireMenuPermission` 檢查）：
- `/api/v1/admin/models/all` — 側邊欄動態模型項目
- `/api/v1/admin/menus` — 權限選擇器菜單樹
- `/api/v1/admin/sorts/all` — 下拉選單欄目列表
- `/api/v1/admin/forms/active` — 側邊欄活躍表單列表（v1.9.40 新增，修復非 M204 用戶 toast 問題）

> **v1.9.42 重點修復**：前端頁面載入引用數據（欄目樹、模型列表）時，必須使用 `/all` 白名單端點，禁止使用需菜單權限的端點（如 `/admin/sorts` 需 M202、`/admin/models` 需模型管理權限）。否則非授權用戶進入頁面時，引用數據請求返回 403 觸發全局 toast，即使頁面主數據正常載入。受影響頁面：Trash（M208）、Singles（M203）、ExtFields（M206）、Categories（M202）

POST/PUT/DELETE 仍需對應菜單權限，防止非授權用戶創建/修改數據。

### silent403 機制（v1.9.40）

`api.ts` 的 `request()` 函數新增 `silent403` 參數，`api.get/post/put/del` 均支持。傳入 `true` 時，403 響應不觸發全局 `permissionDeniedCallback` toast（但仍 throw Error 由調用方 `.catch()` 處理）。用於頁面掛載時預期的 403 場景（如非超管用戶調用超管專用端點），避免誤導性權限提示。

### 關鍵文件

- 後端：`src/services/auth.ts`（`loadUserPermissions` / `reloadUserPermissions` / `hasMenuPermission`）、`src/index.ts`（admin 認證中間件 + `requireMenuPermission` 路由保護）
- 前端：`admin/src/App.tsx`（`RequirePermission` 路由守衛）、`admin/src/components/Layout.tsx`（側邊欄權限過濾 + profile 刷新）、`admin/src/lib/api.ts`（401/403 區分處理）

---

## 業務邏輯重點

### 內容按模型分類

- 側邊欄動態生成模型子菜單（`type='2'` 列表型模型）
- 後端子查詢過濾：`scode IN (SELECT scode FROM ay_content_sort WHERE mcode = ?)`
- **媒體庫資源不混入內容管理**（`scode != ''` 過濾），媒體庫通過 S3 ListObjects 直接列出

### 圖片上傳與壓縮

- **三層架構**：`lib/imageCompress.ts`（引擎層，browser-image-compression）→ `hooks/useImageUpload.ts`（Hook 層）→ `components/ImageCompressDialog.tsx`（UI 層）
- 所有上傳位置默認 JPG/PNG → WebP 壓縮，引擎可獨立替換
- 上傳方式：① R2 上傳 ② 外鏈 URL ③ 媒體庫選擇（`MediaPickerModal`）
- 進度展示：`UploadProgressOverlay` 屏幕居中覆蓋層
- **圖片懶加載**（v1.9.49）：所有 `<img>` 標籤全局添加 `loading="lazy"` + `decoding="async"`，減少首屏帶寬消耗，按需加載視口外圖片

### 內容草稿自動保存（v1.9.49）

- **觸發時機**：① 每 30 秒定時保存 ② 頁面卸載前（`beforeunload`）③ SPA 路由切換時（組件卸載）
- **存儲位置**：`localStorage`，key 格式 `content_draft:{scode}:{id|new}`，按欄目+文章 ID 隔離
- **恢復流程**：進入編輯頁時檢測草稿，彈出恢復提示（顯示標題 + 保存時間），用戶可選擇恢復或丟棄
- **清理時機**：文章成功保存/發布後自動清除對應草稿
- **錯誤處理**：`localStorage` 寫入失敗時 `console.warn` 記錄，不影響正常編輯流程

### 通知服務

- **功能開關**：`mail_enabled` / `webhook_enabled` 控制總開關，註冊表 `FLAG_REGISTRY`（`src/services/flags.ts`）驅動後端攔截 + 前端隱藏 + API 保護。**v1.9.49 緩存 TTL**：D1 配置緩存按站點隔離，TTL 60 秒自動過期，防止跨 isolate 數據不一致
- **新增大功能**：在 `FLAG_REGISTRY` 加一條即可，三層自動生效
- **Webhook**：自動檢測釘釘/企業微信/通用 JSON，分項開關
- **郵件**：MailChannels / Resend HTTP API，HTML 模板
- 通知日誌復用 `ay_syslog`，`ctx.waitUntil()` 確保異步生命週期
- **版本更新通知**（v1.5.9+）：Dashboard 掛載時 `useEffect` 自動 POST `/notify/version-check`，後端用 KV 去重（`notified_version:{version}`）確保每版本只推送一次，格式為釘釘 ActionCard markdown（帶 emoji + 換行，與 `changes` 字段一致）

### 定時發布

- 文章 `date` 字段作為發布時間，`status='0'` 為草稿
- Cron 每 15 分鐘掃描 24 小時內待發布文章，投遞延遲消息到 Queue
- 已過期草稿直接在 Cron 中發布（兜底）

### 語義搜索

- 文章創建/更新時自動索引（標題+正文剝離 HTML，截斷 2000 字）
- 流程：搜索詞 → Workers AI 嵌入 → Vectorize 查詢 → 閾值 0.5 過濾 → D1 取完整文章
- 重建索引：`POST /api/v1/admin/vectorize/reindex`

### 講座預約管理（v1.9.35，僅 smile 站點）

- **兩張表**：`ay_booking_calendar`（日曆圖片，WebP）+ `ay_booking_schedule`（預約排期）
- **日曆圖片**：無 location 字段（兩張圖全展示），無 AVIF（媒體庫僅 WebP），`title` 同時用作 `alt` 和 `title` 屬性
- **排期管理**：服務類型（Smile Pro旺角/Smile Pro中環/Smile中環），地點根據服務類型自動推導（type '1'→旺角, type '2'/'3'→中環），時段（上午/下午）
- **公開 API 僅 GET**（供 `https://smile.hkcmereye.com/` 拉取）：`/api/v1/booking/calendars` + `/api/v1/booking/schedules`
- **管理 API**（POST/PUT/DELETE 僅內部操作，需 JWT + M302 權限）：`/api/v1/admin/booking/calendars/*` + `/api/v1/admin/booking/schedules/*`
- **菜單**：M302 掛在 M300 多媒體下，僅 smile 站點可見（前端 `currentSiteId` 過濾，`NavItem.siteOnly` 字段）
- **批量操作**：排期支持批量新增（日期×時段組合）、批量刪除（`?ids=1,2,3`）

### 邊緣緩存（Workers Cache，v1.7.0）

- v1.7.0 起：用 Cloudflare Workers Cache（聲明式邊緣緩存）取代原 KV API 響應緩存中間件
- 公開 GET 請求自動邊緣緩存：配置類（`/company`、`/site`、`/nav`、`/sorts`）TTL 3600s，其他公開數據 TTL 300s，`stale-while-revalidate=60`
- 管理接口（`/api/v1/admin/*`）因 Authorization 頭自動被 Workers Cache 繞過
- **認證接口（`/api/v1/auth/*`）v1.7.6 新增排除**：`/auth/profile` 返回用戶專屬權限數據，嚴禁跨用戶快取。v1.7.6 前因 `Cache-Control: public` 導致邊緣快取以 URL+X-Site-Id 為 key（不含 Authorization），管理員 profile 被快取後普通用戶拿到管理員權限列表，側邊欄顯示全部菜單
- `/auth/profile` 響應顯式設置 `Cache-Control: no-store`（防禦性雙保險）
- 多站點通過 `Vary: X-Site-Id` 實現緩存分區，防止跨站污染
- 搜索結果（`/api/v1/search`）不緩存（實時性要求高）
- `clearContentCache` / `clearConfigCache` 保留用於清除 KV 中殘留的配置緩存條目（`config:all` 等）

### 香港本地化（v1.5.4）

- 公司信息：移除 QQ/郵編/ICP，新增 WhatsApp，標籤香港化（商業登記證號碼、董事/公司秘書）
- 站點信息：移除 ICP 備案號（與公司重複）、主題模板（headless 無模板）
- 系統設置：搜索引擎驗證從百度推送改為 Google/Bing 站點驗證
- 公開 API：`GET /api/v1/company` 過濾敏感字段僅返回聯繫信息

### Cloudflare Turnstile 人機驗證（v1.5.6，v1.8.6 重構）

- **配置**：DB `ay_config` 表 2 條記錄（sorting 35-36，安全配置分組）— `turnstile_enabled`（開關）/ `turnstile_site_key`（站點密鑰）。**密鑰存儲在 Secrets Store**（v1.8.6 遷移，原 D1 `turnstile_secret_key` 已被 0010 遷移清空）
- **後端**：`src/services/auth.ts` `verifyTurnstile()` 調用 Cloudflare siteverify API 驗證 token；`handleLogin` 接收 `turnstileSecret` 參數（從 `TURNSTILE_SECRET_STORE` 讀取），開關開啟時強制驗證。**v1.9.49 重試機制**：siteverify 網絡異常時重試 2 次（間隔 500ms），全部失敗後 fail-open 並記錄 `console.error`（避免 Cloudflare API 故障鎖死所有用戶）；secret key 未配置時直接放行（防配置丟失）
- **前端**：`Login.tsx` 動態載入 Turnstile 腳本（explicit 模式），掛載時拉取 `/auth/turnstile-config` 判斷是否啟用，登錄失敗自動 reset widget
- **公開端點**：`GET /api/v1/auth/turnstile-config` 返回 `{ enabled, siteKey }`（secret key 不返回）

### Secrets Store 密鑰管理（v1.7.0，v1.8.6/v1.8.7 擴展）

- **架構**：JWT_SECRET、CF_API_TOKEN、TURNSTILE_SECRET_KEY、S3_ACCESS_KEY、S3_SECRET_KEY 存儲在 Cloudflare Secrets Store（帳號級別，跨 Worker 共享）
- **綁定**：wrangler.jsonc `secrets_store_secrets` 配置，異步訪問（`await env.JWT_SECRET_STORE.get()`），與原同步 `env.JWT_SECRET` 不兼容
- **Store**：`default_secrets_store`（ID: `aef7c32e26c84aedb4b2a5938128ca23`），CLI 管理 `wrangler secrets-store secret create <store-id> --name <name> --value <value> --scopes workers --remote`
- **代碼變更**：`requireAuth`、`handleLogin`、`handleCreateSite` 均改為 `await c.env.JWT_SECRET_STORE.get()` / `await c.env.CF_API_TOKEN_STORE.get()` / `await c.env.TURNSTILE_SECRET_STORE.get()`；S3 憑證通過 `S3Secrets` 參數傳遞（`S3_ACCESS_KEY_STORE` / `S3_SECRET_KEY_STORE`），`config.ts` 注入虛擬配置項（`***` 遮罩），寫入路由至 Secrets Store（`put()`）
- **前端展示**（v1.9.39+）：S3 憑證字段在系統設置存儲配置 tab 顯示 ✅ 已配置 / ⚠️ 未配置 狀態徽章，Secret Key 使用密碼框，提示「存儲於 Secrets Store，輸入新值可更新」。CMS 可直接修改 Secrets Store 中的 S3 憑證（通過 config API `put()` 寫入）
- **SecretsStoreSecretWritable**：`@cloudflare/workers-types` v5 僅聲明 `get()`，運行時亦支持 `put()`，`storage.ts` 導出 `SecretsStoreSecretWritable` 接口補充類型聲明

### 全局錯誤追蹤（v1.7.0）

- **ErrorBoundary**：`admin/src/components/ErrorBoundary.tsx` 包裹所有路由，捕獲 React 渲染異常顯示 fallback UI
- **GlobalErrorToast**：`admin/src/components/GlobalErrorToast.tsx` 固定左下角紅色邊框彈框，手動關閉，用於測試階段非開發者用戶反饋 bug
- **集成**：`api.ts` 攔截非 401 錯誤調用 `showGlobalError(title, message, detail?)`，401 通過 `CustomEvent` 觸發導航至 login

### 安全加固（v1.8.3）

> **P0-P3 防禦縱深**，通用 HTTP 安全標準（非 Cloudflare 特有）。

- **P0 安全 HTTP 響應頭**：`src/index.ts` 中間件統一設置 6 個頭（X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy / HSTS / CSP）。API 的 CSP 為 `default-src 'none'`（最嚴格，只返回 JSON）。前端 SPA 通過 `admin/public/_headers` 設置獨立 CSP（允許 Turnstile 腳本+iframe+connect-src、允許 https 圖片源）。**v1.8.4 修復**：`connect-src` 必須包含 `https://challenges.cloudflare.com`，否則 Turnstile JS 無法發起 API 調用獲取 token。`src/utils/response.ts` 的 `err()` 函數僅對 `AUTH_ERROR_CODES`（2002/2003/2004/2006）返回 HTTP 401，其他錯誤（如 2001 密碼錯誤、2007 Turnstile 失敗）返回 400，避免前端誤判為「登錄已過期」
- **P1 HTML 淨化**：`src/utils/sanitize.ts` 提供 `sanitizeHtml()`（保留富文本標籤，移除 `<script>`/危險標籤/`on*` 事件/`javascript:` 協議）和 `stripHtmlTags()`（剝離所有標籤）。整合到 `handleCreateContent` + `handleUpdateContent`，content 字段用 sanitizeHtml，description/keywords 用 stripHtmlTags
- **P2 輸入長度校驗**：`FIELD_LENGTH_LIMITS` 常量定義 18 個字段最大長度（新聞網站場景，略寬），`validateFieldLengths()` 超長返回明確錯誤。請求體大小限制 2MB（排除 `multipart/form-data` 文件上傳）
- **P3 文件上傳 MIME 白名單**：`src/services/storage.ts` 的 `ALLOWED_MIME_TYPES` Set，僅允許圖片/視頻/音頻/PDF/文本/ZIP，非白名單返回 1001 錯誤

### 數據庫備份（v1.9.37，v1.9.43 多站點改進，v1.9.44 表存在性修復，v1.9.45 日誌管理，v1.9.46 gzip 壓縮 + 站點 Tab，v1.9.47 Queue 異步解耦）

- **Queue 異步架構**（v1.9.47 新增）：HTTP 請求只投遞 `queue.send()` 到 `backup-queue`（~1ms CPU），Consumer 在後台逐個執行備份。Worker 不再「硬等」備份完成，規避 10ms CPU 免費額度限制
- **Consumer 併發控制**：`max_batch_size=1` + `max_concurrency=1`，確保備份一個接一個完成，避免 D1/S3 資源爭用
- **自動重試**：`max_retries=3`，備份失敗時 Queue 自動重試，超過次數進入 `backup-dlq` 死信隊列
- **一鍵備份所有站點**（v1.9.47 新增）：`POST /api/v1/admin/database/backup-all`，一次請求投遞所有站點備份任務到 Queue，逐個在後台執行
- **任務狀態追蹤**（v1.9.47 新增）：KV 存儲任務狀態（`backup-task:{requestId}`，TTL 1 小時），狀態為 pending/running/completed/failed。前端輪詢 `GET /api/v1/admin/database/backup-status/:requestId` 獲取進度
- **降級機制**：Queue 不可用時（本地開發）自動降級為同步執行（`executeScheduledBackupSync`），確保功能不受影響
- **定時備份也改用 Queue**（v1.9.47 變更）：Cron 只判斷是否到期 + 投遞 Queue 消息，實際備份由 Consumer 執行
- **⚠️ Free plan 限制**：不支持 `limits.cpu_ms` 配置，Queue Consumer 使用預設 30s CPU 限制。備份操作需在此時間內完成（若超時需升級 Paid plan）
- **文件命名**：`{siteId}_backup_YYYYMMDDHHmmss.sql.gz`（v1.9.46 起 gzip 壓縮；v1.9.43 前為 `backup_YYYYMMDDHHmmss.sql`，無站點前綴）
- **gzip 壓縮**（v1.9.46 新增）：使用 Cloudflare Workers 原生 `CompressionStream('gzip')` 壓縮 SQL 內容，存儲為 `.sql.gz`，典型壓縮率 60-80%。下載時使用 `DecompressionStream('gzip')` 自動解壓返回原始 `.sql` 文件。舊格式 `.sql` 文件完全向後兼容
- **存儲路徑**：R2/S3 `backups/` 目錄下，所有站點備份混合存儲，通過文件名站點前綴區分
- **定時備份**：Cron 每 15 分鐘檢查，遍歷所有註冊站點數據庫（`listRegisteredSites`），各站獨立判斷是否到期
- **保留策略**（v1.9.43 修復）：`applyBackupRetention` 按站點前綴分組，**每站獨立保留 N 份**（原邏輯全局統一保留 N 份，3 站同時備份時 keep=7 實際每站僅保留約 2 份）
- **配置存儲**：`ay_config` 表，每站點獨立（enabled / frequency / time / weekday / keep / last_run / excludeLogs / logRetentionDays / lastLogCleanup）
- **向後兼容**：舊格式 `backup_*.sql` 文件仍可列出、下載、刪除，保留清理也按 keepCount 獨立管理
- **表存在性檢查**（v1.9.44 修復）：`dumpDatabaseTables` 遍歷 `BACKUP_TABLES` 時，先查 `sqlite_master` 確認表存在，不存在則 `continue` 跳過。修復 vision/endoscopy 站點備份失敗問題（`ay_booking_calendar` / `ay_booking_schedule` 僅 smile 站點有，其他站點 `SELECT * FROM "ay_booking_calendar"` 報 `no such table`）
- **備份排除日誌數據**（v1.9.45 新增）：`dumpDatabaseTables` 接受 `excludeLogData` 參數，為 `true` 時 `ay_syslog` 僅導出 `CREATE TABLE` 語句（表結構），不導出 `INSERT` 數據行。手動備份通過 query param `?excludeLogs=1` 觸發，定時備份通過 `backup_exclude_logs` 配置項控制。`BACKUP_EXCLUDABLE_DATA_TABLES` Set 定義可排除數據的表（目前僅 `ay_syslog`）
- **日誌清理機制**（v1.9.45 新增）：
  - **手動清理**：`POST /api/v1/admin/database/cleanup-logs?days=30` 刪除 N 天前的舊日誌，返回刪除數量
  - **日誌統計**：`GET /api/v1/admin/database/log-stats` 返回總數、級別分佈、最早/最新記錄時間
  - **自動清理**：`handleScheduledLogCleanup` 在每次定時備份後執行，每天最多一次，保留最近 N 天日誌（`log_retention_days` 配置，0=不自動清理）
  - **配置項**：`backup_exclude_logs`（備份排除日誌）、`log_retention_days`（日誌保留天數）、`log_last_cleanup`（上次清理時間）
  - **前端**：Database.tsx 頁面新增「日誌管理」卡片，展示統計數據 + 手動清理按鈕；定時備份配置區分為三個清晰區塊（備份排程 / 備份內容 / 日誌自動清理）；備份列表按站點 Tab 切換，顯示壓縮標記（🗜️ + gzip 徽章）；v1.9.47 新增「備份任務進度」面板（⏳⚙️✅❌ 四態 + 耗時 + 壓縮比）

---

## CI/CD 自動部署（v1.9.48+）

> **前後端均已通過 Cloudflare Git 集成自動部署**。push to main 即自動構建部署，無需手動 wrangler 命令。
> 手動部署流程、本地運維命令、緊急回退流程見 `DEPLOYMENT-LEGACY.md`。

### 自動部署架構

| 服務 | Cloudflare 資源 | Root Directory | Build Command | 觸發 |
|------|----------------|---------------|---------------|------|
| 後端 Worker | `cfstack-cms`（Workers Builds） | `/`（倉庫根目錄） | `pnpm run build` | push to main，監視路徑見下 |
| 前端 SPA | `cms-admin`（Pages） | `admin` | `pnpm run build` | push to main（Root Directory 已隔離） |

### Worker 構建監視路徑（Build Watch Paths）

> Cloudflare Dashboard → Workers & Pages → `cfstack-cms` → Settings → Builds 配置。

僅以下路徑變更才觸發 Worker 部署（避免前端改動誤觸發）：

```
src/**
migrations/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json
wrangler.jsonc
.npmrc
```

Pages 的 Root Directory 已設為 `admin`，天然隔離，無需額外配置監視路徑。

### 常規更新流程（5 步）

```powershell
# 前置：Git 路徑加入 PATH
$env:PATH = 'D:\AI\Tools\Git\cmd;' + $env:PATH

# 步驟 1: Git commit 代碼改動
git add -A; git commit -m '✨ feat: vX.Y.Z 描述...'

# 步驟 2: 獲取 commit 真實時間戳（Asia/Hong_Kong）
git log --all --pretty=format:'%h|%ci|%s' -n 1

# 步驟 3: 用該時間戳更新 Dashboard.tsx VERSIONS 數組（date 字段填入真實時間戳）

# 步驟 4: git commit --amend --no-edit 將 Dashboard 變更合入原 commit（一次 amend）

# 步驟 5: 推送 → 自動觸發前後端部署
git push origin main
```

### ⚠️ D1 遷移（不自動，必須手動先執行）

涉及數據庫結構變更時，**必須先執行遷移再 push 代碼**：

```powershell
npx wrangler d1 migrations apply endoscopy-cms --remote
npx wrangler d1 migrations apply smile-cms --remote
npx wrangler d1 migrations apply vision-cms --remote
```

### 本地開發

```powershell
# 後端開發服務器（端口 8787）
npx wrangler dev

# 前端開發服務器（端口 3000，代理 /api → 127.0.0.1:8787）
cd admin; npx vite dev
```

---

## 開發檢查清單

1. 是否有 PbootCMS/Go 版對應實現？優先參考
2. SQL 是否 `.bind()` 參數化？
3. 響應格式是否統一 `{code,msg,data}`？
4. 配置修改後是否清除 KV 緩存？
5. 通知服務是否異步觸發（`ctx.waitUntil`）？
6. 功能開關是否檢查？
7. 媒體庫上傳是否避免寫入 `ay_content`？
8. 圖標是否使用 emoji？
9. **Hono 路由順序**：`/:id` 路由必須在子路徑路由（如 `/batch-sorting`、`/trash`、`/all`）之後註冊，否則子路徑會被當作 `:id` 匹配
10. **是否同步更新了儀表盤的版本更新、API 開發手冊、系統信息？（強制）**
11. **版本更新後 Dashboard 自動推送釘釘 webhook 通知（KV 去重，無需手動）？**
12. **新增內容寫入接口是否整合 sanitizeHtml/stripHtmlTags 淨化？（XSS 防禦）**
13. **新增上傳端點是否检查 MIME 白名單？（文件上傳安全）**
14. **前端載入引用數據（欄目樹/模型列表）是否使用 `/all` 白名單端點？（避免非授權用戶 403 toast）**

---

## 儀表盤同步更新規則（強制）

> **常規更新流程中的 Dashboard 更新步驟（步驟 1-4），必須一次性完成，禁止反覆修改時間戳。**
> 部署由 `git push` 自動觸發（CI/CD），無需手動 wrangler 命令。

### 正確流程（一氣呵成，不反覆修改）

1. **Git commit** 代碼改動 → 拿到 commit message 內容和真實時間戳
2. **git log** 獲取該 commit 的 `%ci` 時間戳（Asia/Hong_Kong）
3. **一次性更新 Dashboard.tsx** 三個 Tab，`date` 字段直接填入真實時間戳（禁止用佔位時間再修正）
4. **git commit --amend --no-edit** 將 Dashboard 變更合入原 commit（僅一次 amend）

### 版本更新 Tab

- 新增版本條目到 `VERSIONS` 數組頂部，設 `latest: true`，舊版本移除 `latest`
- 格式：`{ version: 'vX.Y.Z', date: 'YYYY-MM-DD HH:mm:ss', icon: 'emoji', latest: true, changes: '簡述' }`
- 版本號：主版本（架構變更）/ 次版本（功能新增）/ 修訂號（Bug 修復）
- **時間戳規則（強制）**：`date` 字段必須使用 `git log` 中對應 commit 的真實時間戳（`git log --format='%ci'`），時區為 Asia/Hong_Kong（UTC+8）。禁止手動估算或編造時間。獲取方式：`git log --all --pretty=format:'%h|%ci|%s' | grep 'vX.Y.Z'`。無 git commit 記錄的歷史版本，時間需確保版本順序遞減（新版 > 舊版）

### API 開發手冊 Tab

- 新增/修改 API 端點時，同步更新 `API_ENDPOINTS` 數組
- 新增錯誤碼時，同步更新 `ERROR_CODES` 數組

### 系統信息 Tab

- Cloudflare 資源變更時更新資源表格
- 技術棧變更時更新項目信息卡片

---

## 參考項目

| 項目 | 路徑 | 用途 |
|------|------|------|
| PbootCMS 3.2.12（PHP 原版） | `F:\mysite\AI\idea\pbootcmstogo\PbootCMS-3.2.12` | 數據庫結構 + 業務邏輯參考 |
| pbootcms-go（自研 Go 版） | `F:\mysite\AI\idea\pbootcmstogo\pbootcms-go` | API 設計參考 |
| 本項目 | `F:\mysite\AI\idea\Cloudflarerustcms` | — |
