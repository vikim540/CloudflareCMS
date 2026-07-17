# AGENTS.md - 項目約束與開發規範

> 本文件是 AI 編程代理和開發者的強制約束文件。所有代碼生成、修改、審查必須遵守以下規則。

---

## 項目概述

TypeScript + Hono + Cloudflare Workers CMS,基於 PbootCMS 3.2.12 數據庫結構,前後端完全分離的純 API 後端,部署在 Cloudflare Workers 上,專為廣告站、Google SEO 場景設計,配合獨立靜態生成層輸出全靜態頁面。

### 參考項目路徑

- PbootCMS 3.2.12 (PHP原版): `F:\mysite\AI\idea\pbootcmstogo\PbootCMS-3.2.12`
- pbootcms-go (自研Go版): `F:\mysite\AI\idea\pbootcmstogo\pbootcms-go`
- AnqiCMS v3.6.2 (二進制分發): `F:\mysite\AI\idea\pbootcmstogo\anqicms-linux-amd64-v3.6.2`
- 本項目: `F:\mysite\AI\idea\Cloudflarerustcms`

### Cloudflare 資源

| 資源 | 名稱/ID | 說明 |
|------|---------|------|
| Worker | `rust-cms` | 後端 API,自定義域名 `cms.vikim.eu.org` |
| D1 數據庫 | `rust-cms-db` (ID: `28a95ec3-7228-4c47-b9f6-e9cfcfcaf319`) | PbootCMS 兼容數據庫 |
| KV: CONFIG_CACHE | ID: `69737778474044ada68b6f34db79f8cb` | 配置緩存 + 留言速率限制 |
| KV: TOKEN_BLACKLIST | ID: `31e1d191d5664d2fa39a72dd9cae6906` | JWT 黑名單 |
| Pages 項目 | `cms-admin` | 管理後台 SPA |
| GitHub | `https://github.com/vikim540/RustCMS.git` | 遠程倉庫 |
| Cloudflare 賬號 | `waicun_lee@outlook.com` (Account ID: `f5d4e94cb23f69f8ae69baedff94f2ba`) | |

### 開發文檔

所有開發文檔位於 `docs/` 目錄:
- `00-需求審視與YAGNI分析.md` - 需求審視結果和技術選型修正
- `01-技術架構設計.md` - 整體架構和技術棧選型
- `02-數據庫設計.md` - 完整表結構和索引設計
- `03-API接口設計.md` - API接口規範和完整路由清單
- `04-核心模塊設計.md` - 各模塊詳細實現邏輯
- `05-靜態生成層對接.md` - SSG接口和靜態生成流程
- `06-開發計劃.md` - 分階段開發計劃和里程碑

---

## 硬約束（不可違反）

### 1. 數據庫零改動

- **禁止**修改 PbootCMS 原版任何表結構
- **禁止**刪除任何原版字段
- **禁止**重命名任何原版表或字段
- **允許**新增表（僅限 Go 版已驗證的: `ay_area`, `ay_role_area`, `ay_301_redirect`, `ay_media_mark`, `ay_content_ext`）
- **允許**冪等添加索引（`CREATE INDEX IF NOT EXISTS`）
- **允許**冪等插入新配置行到 `ay_config`（使用 `INSERT ... WHERE NOT EXISTS`）
- **允許**冪等插入新模型/欄目/文章數據（使用 `INSERT ... WHERE NOT EXISTS`）
- 表前綴 `ay_` 保持不變

### 2. 技術棧固定

- 後端語言: **TypeScript**（運行於 Cloudflare Workers 原生運行時）
- Web 框架: **Hono**（輕量級,Workers 原生兼容）
- 數據庫: **Cloudflare D1**（通過 binding API 訪問,`db.prepare().bind().all()`）
- 緩存: **Cloudflare KV**（配置緩存 `config:all` + JWT 黑名單 + 速率限制）
- 文件存儲: **Cloudflare R2**（S3 兼容,AWS SigV4 簽名）
- 前端: **React 18 + Vite + Tailwind CSS**（部署在 Cloudflare Pages）
- 序列化: **原生 JSON**（`Response.json()` / `JSON.parse/stringify`）

### 3. 禁止引入的依賴

| 禁止依賴 | 理由 | 替代方案 |
|---------|------|---------|
| `sqlx` / 數據庫驅動 | D1 是 binding 資源,非網絡數據庫 | `db.prepare().bind().all()` |
| `jsonwebtoken` | 增加包體積,Workers 原生可用 | Web Crypto API 自實現 HS256 |
| `bcrypt` / `argon2` | 與 PbootCMS 雙 MD5 密碼不兼容 | 雙 MD5（`md5` function via Web Crypto） |
| `nodemailer` / SMTP 庫 | Workers 無 TCP socket 支持 | MailChannels / Resend HTTP API |
| 圖片處理庫 | 增加 Worker 體積 | 水印交由靜態生成層處理 |
| 任何模板引擎 | 後端純 API,不渲染 HTML | 無 |
| `node-fetch` / `axios` | Workers 有原生 `fetch` | 全局 `fetch()` |

### 4. 密碼方案固定

- 使用雙 MD5: `md5(md5(password))`
- 與 PbootCMS 原版和 Go 版完全兼容
- 密碼比對使用常量時間比較（防時序攻擊）
- **禁止**使用 bcrypt / argon2 / scrypt

### 5. 前後端分離

- Worker **只返回 JSON**,禁止渲染 HTML
- 管理後台是獨立 SPA,部署在 Cloudflare Pages（項目名 `cms-admin`）,**禁止打包進 Worker**
- 前台頁面由獨立靜態生成服務生成,**Worker 不參與頁面渲染**
- 前端通過 Pages Functions（`admin/functions/api/v1/[[path]].ts`）同域代理 API,避免跨域和 DNS 污染

---

## 代碼規範

### TypeScript 代碼規範

1. **命名**: camelCase（函數/變量）, PascalCase（接口/類型）, UPPER_SNAKE_CASE（常量）
2. **模塊組織**: `index.ts`（路由,薄）→ `services/*.ts`（業務邏輯,厚）→ `utils/*.ts`（工具,純函數）
3. **錯誤處理**: service 層返回 `Response`,禁止拋出未捕獲異常;使用 `try/catch` 包裹外部調用
4. **SQL 語句**: 通過 D1 binding 的 `.bind()` 傳參,**禁止字符串拼接 SQL**
5. **異步**: 所有 D1/KV/R2/fetch 操作使用 `async/await`
6. **日誌**: 使用 `console.log/error`（Workers 原生支持,wrangler tail 可查看）
7. **註釋**: 公共函數必須有 JSDoc 註釋（`/** */`）,複雜邏輯必須有行內註釋（`//`）
8. **類型**: 嚴格 TypeScript,禁止 `any`（必要時用 `unknown` + 類型斷言）

### SQL 規範

```typescript
// 正確: 參數化查詢
const result = await db.prepare(
  'SELECT * FROM ay_content WHERE scode = ? AND status = ?'
).bind(scode, status).all<Content>();

// 錯誤: 字符串拼接(SQL 注入風險)
const sql = `SELECT * FROM ay_content WHERE scode = '${scode}' AND status = '${status}'`;
```

### 統一響應格式

```typescript
// 所有接口必須返回統一格式 (src/utils/response.ts)
{
    "code": 0,        // 0=成功, 非0=失敗
    "msg": "成功",
    "data": {},       // 數據載荷
    "meta": {         // 可選,列表接口必須
        "page": 1,
        "pagesize": 20,
        "total": 100
    }
}
```

### API 路由規範

- 統一前綴: `/api/v1/`
- RESTful 風格: GET 查詢, POST 新增, PUT/PATCH 修改, DELETE 刪除
- 公開接口: `/api/v1/{resource}`（無需認證）
- 管理接口: `/api/v1/admin/{resource}`（JWT 鑑權,`requireAuth` 中間件）
- 通知測試接口: `/api/v1/admin/notify/test-mail` / `/api/v1/admin/notify/test-webhook`

---

## 業務邏輯約束

### 內容管理按模型分類（參考 PbootCMS/Go 版 mcode 邏輯）

- 內容列表按模型 `mcode` 分類展示,側邊欄動態生成模型子菜單
- 後端查詢使用子查詢過濾: `scode IN (SELECT scode FROM ay_content_sort WHERE mcode = ?)`
- 欄目查詢支持 `?mcode=` 參數過濾
- 新建內容時根據 URL `mcode` 參數預選欄目
- 內容管理僅管理有編輯器的文章內容,**不混入媒體庫資源**

### 圖片上傳支持外鏈

- 縮略圖、Quill 編輯器圖片、擴展字段圖片均支持兩種方式:
  1. 上傳到 R2 存儲（`POST /admin/upload`）
  2. 手動輸入外鏈 CDN 圖片 URL
- 編輯器圖片 handler: 先 prompt 輸入 URL,留空則觸發文件選擇器

### CORS 動態域名校驗

- CORS 中間件從 KV 讀取 `api_cors_origins` 配置
- 配置了域名白名單: 僅允許列出的 Origin,返回 `Access-Control-Allow-Credentials: true` + `Vary: Origin`
- 未配置或含 `*`: 允許所有域名
- 後台「系統設置 > WebAPI > API CORS域名」配置（逗號分隔）

### 通知服務（Webhook + 郵件）

- **Webhook 推送**（`src/services/notify.ts`）:
  - 自動檢測目標平台: 釘釘 ActionCard / 企業微信 Markdown / 通用 JSON
  - 分項開關: `webhook_message` / `webhook_form` / `webhook_comment`
  - 配置項: `webhook_url`（推送地址）
- **郵件通知**（`src/services/notify.ts`）:
  - 使用 HTTP API 發信（MailChannels / Resend）,**不使用 SMTP 直連**（Workers 無 TCP socket）
  - 配置項: `mail_provider` / `mail_api_key` / `mail_from` / `mail_from_name`
  - SMTP 配置（`smtp_server` 等）僅供參考,實際不通過 SMTP 發信
  - 美觀 HTML 模板: 漸層 header / 字段表格 / 來源信息（IP/OS/瀏覽器/來源URL）/ 專業 footer
- 通知日誌復用 `ay_syslog` 表（level=`mail_success`/`mail_error`/`webhook_success`/`webhook_error`）
- 通知異步觸發,失敗不影響主流程

---

## 開發流程

### 新增功能時的檢查清單

1. [ ] 是否已有 PbootCMS 或 Go 版的對應實現? 優先參考其邏輯
2. [ ] 是否需要修改數據庫表結構? 如果是,**停止**,重新設計
3. [ ] 是否引入了禁止依賴? 如果是,尋找替代方案
4. [ ] Worker 體積是否增加過多? 用 `wrangler deploy --dry-run` 檢查
5. [ ] SQL 是否參數化? 確認沒有字符串拼接
6. [ ] 響應格式是否統一? 確認 `{code, msg, data}` 結構
7. [ ] 熱點數據是否考慮了 KV 緩存?
8. [ ] 配置修改後是否清除了 KV 緩存（`clearConfigCache`）?
9. [ ] 是否記錄了關鍵操作日誌?
10. [ ] 通知服務是否正確觸發（留言/表單/評論提交時）?

### 代碼審查要點

1. D1 查詢是否參數化（防 SQL 注入）
2. 密碼處理是否用雙 MD5 + 常量時間比較
3. JWT 簽發/驗證是否正確（Web Crypto API HS256）
4. KV 緩存是否在數據修改後正確失效
5. 遞歸 CTE 是否正確（子孫欄目查詢）
6. 分頁邏輯是否正確（page 從 1 開始）
7. 錯誤處理是否完善（try/catch,不拋出未捕獲異常）
8. 響應格式是否統一
9. CORS 是否根據配置動態校驗
10. 通知服務是否異步觸發且不阻塞主流程

---

## PbootCMS 邏輯參考要點

開發時必須參考 PbootCMS 原版對應位置的邏輯,以下是關鍵邏輯的文件位置索引:

### 欄目樹構建
- PHP版: `core/function/handle.php` 的 `get_tree()` 函數（pcode/scode 遞歸）
- Go版: `apps/admin/service/content/ContentSortService.go` 的 `buildAreaTree()`
- 本項目: `src/services/sort.ts` 內存遞歸構建（`buildSortTree`）

### 內容按模型分類查詢
- PHP版: `apps/admin/model/content/ContentModel.php` 的 `getList($mcode)`（JOIN ay_content_sort + ay_model）
- Go版: `apps/admin/service/content/ContentService.go` 的 `ListContents()`（子查詢 `scode IN (SELECT scode FROM ay_content_sort WHERE mcode = ?)`）
- 本項目: `src/services/content.ts` 的 `handleAdminListContents()`（子查詢,與 Go 版一致）

### URL 生成
- PHP版: `core/basic/Url.php` 的 `home()` 方法
- 注意: 本項目 Worker 不生成 URL,URL 生成邏輯由靜態生成層實現

### 配置加載
- PHP版: `core/basic/Config.php` 的 `loadConfig()` 多層合併
- Go版: `apps/admin/model/db.go` 的 `preloadConfigCache()` 內存緩存
- 本項目: `src/services/config.ts` KV 緩存 `config:all`,未命中時回退 D1 查詢

### 密碼驗證
- PHP版: `md5(md5(password))`
- Go版: `apps/common/security.go`,`crypto/subtle.ConstantTimeCompare`
- 本項目: `src/utils/password.ts` 雙 MD5 + 常量時間比較

### 權限校驗
- PHP版: `ay_role_level.level` 存儲權限 URL 路徑
- Go版: `apps/common/middleware/auth.go`,超級管理員 uid=1 跳過
- 本項目: `src/services/auth.ts` JWT payload 攜帶用戶信息,`requireAuth` 中間件校驗

### Webhook 推送
- Go版: `apps/common/webhook/webhook.go`（釘釘 ActionCard / 企業微信 Markdown / 通用 JSON）
- 本項目: `src/services/notify.ts` 的 `sendWebhook()`（平台自動檢測,與 Go 版一致）

### 郵件通知
- Go版: `apps/common/mail/mailer.go`（SMTP 直連,隱式 SSL / STARTTLS）
- 本項目: `src/services/notify.ts` 的 `sendNotifyMail()`（HTTP API 替代 SMTP,Workers 無 TCP socket）

---

## 性能預算

| 指標 | 限制 | 目標 |
|------|------|------|
| Worker 體積 | 3MB（壓縮後 1MB） | ≤ 500KB（gzip ≤ 100KB） |
| 單請求 CPU 時間 | 10ms（免費版）/ 50ms（付費版） | ≤ 5ms |
| 常駐內存 | 128MB | ≤ 40MB |
| D1 每日寫入 | 100,000 行（免費版） | 盡量用 KV 緩存減少寫入 |
| D1 每日讀取 | 5,000,000 行（免費版） | 熱點數據走 KV |
| KV 每日讀取 | 100,000 次（免費版） | 合理設置 TTL |
| R2 存储 | 10GB（免費版） | 壓縮圖片,定期清理 |

---

## 環境配置

### 開發環境要求

- Node.js >= 18（後端 + 前端 + wrangler）
- wrangler CLI v4.x+（位於 `D:\AI\Cache\pnpm-home\wrangler.CMD`）
- pnpm（前端包管理,位於 `D:\AI\Cache\pnpm-home`）
- Cloudflare API Token（環境變量 `CLOUDFLARE_API_TOKEN`）
- JWT_SECRET（wrangler secret,`wrangler secret put JWT_SECRET`）

### wrangler 路徑

項目使用的 wrangler 4.96.0 位於 pnpm 環境:
```
D:\AI\Cache\pnpm-home\wrangler.CMD
```

全局的 `wrangler`（3.1.0）版本過舊,不支持 `--remote` 等 D1 命令,**禁止使用**。

### 包管理規範

- 後端: 使用 `npm`（`package.json` 在項目根目錄）
- 前端: 使用 `pnpm`（`admin/package.json`）,緩存路徑 `D:\AI\Cache\pnpm`
- 所有臨時文件存放在 `D:\AI\Temp`

### 用戶環境規則

- PowerShell 只使用 pwsh.exe 7
- 禁止寫入 C 盤（系統盤）
- 所有工具/運行時/緩存/配置統一存放在 `D:\AI` 目錄
- `D:\AI` 目錄結構: Tools / Runtime / Cache / Data / IDE / Downloads / Temp

---

## 部署流程

### 後端 Worker 部署

```powershell
# 1. 應用 D1 數據庫遷移（如果有新遷移）
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' d1 migrations apply rust-cms-db --remote

# 2. 部署 Worker
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' deploy

# 3. 設置 Secret（首次或更新時）
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' secret put JWT_SECRET
```

### 前端 Pages 部署

```powershell
# 1. 安裝依賴（如果 node_modules 不存在）
cd admin
pnpm install

# 2. 構建
npx vite build

# 3. 部署到 Cloudflare Pages
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' pages deploy build --project-name=cms-admin
```

### 數據庫備份

```powershell
# 導出完整數據庫
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' d1 export rust-cms-db --remote --output backup.sql

# 僅導出結構
& 'D:\AI\Cache\pnpm-home\wrangler.CMD' d1 export rust-cms-db --remote --output schema.sql --no-data
```

---

## 常見問題

### Q: 為什麼後端用 TypeScript 而不是 Rust?
A: 項目最初規劃使用 Rust（workers-rs）,但實際開發中發現 Hono（TypeScript）在 Workers 上的生態更成熟、開發效率更高、包體積更小。最終選擇 TypeScript + Hono 作為後端技術棧。`src/lib.rs` 等 Rust 文件保留作為參考,但實際運行的是 `src/index.ts`。

### Q: 為什麼不用 SMTP 直連發郵件?
A: Cloudflare Workers 運行時不提供 TCP socket API,無法直接連接 SMTP 伺服器。替代方案是通過 HTTP API 發信（MailChannels / Resend）,配置中的 `smtp_server` 等字段僅供參考記錄。

### Q: 為什麼不用 bcrypt?
A: PbootCMS 原版使用雙 MD5 密碼,「原數據庫不做任何修改」的硬約束要求密碼方案必須兼容。如果改用 bcrypt,所有遷移的用戶數據密碼都會失效。雙 MD5 + 登錄限頻 + 常量時間比較在廣告站場景下已足夠。

### Q: 為什麼自行實現 JWT?
A: `jsonwebtoken` npm 包依賴 Node.js crypto 模块,Workers 兼容性不確定。JWT HS256 本質是 HMAC-SHA256 + Base64URL,用 Web Crypto API 即可實現,代碼量約 100 行,完全控制體積和安全。

### Q: acode 字段如何處理?
A: 保留字段（原數據庫不刪除）,固定使用默認值 `cn`。所有查詢帶 `WHERE acode = 'cn'`,不實現區域切換邏輯。

### Q: 會員系統怎麼處理?
A: `ay_member` 相關表保留在數據庫中,但 Worker 不實現會員相關 API。廣告站場景無前台會員需求。

### Q: 模板引擎怎麼處理?
A: 後端 Worker 不包含任何模板渲染邏輯。模板渲染由獨立的靜態生成層完成。Worker 只提供 JSON API。

### Q: 內容管理為什麼按模型分類?
A: 參考 PbootCMS 原版邏輯,後台內容管理按模型（mcode）分類展示子菜單（如文章列表、產品列表等）,使文案人員只看到自己負責的內容類型,避免媒體庫資源混入造成混淆。

### Q: 通知日誌存在哪裡?
A: 復用 `ay_syslog` 表,通過 `level` 字段區分類型（`mail_success`/`mail_error`/`webhook_success`/`webhook_error`）,不新建表,符合「數據庫零改動」約束。

---

## 文件修改記錄

修改本文件或開發文檔時,請在此記錄:

| 日期 | 修改內容 | 修改人 |
|------|---------|--------|
| 2026-07-16 | 初始創建 | AI Assistant |
| 2026-07-17 | 技術棧從 Rust 更正為 TypeScript + Hono; 補充通知服務/CORS/模型分類/圖片外鏈約束; 補充 wrangler 部署流程; 更新 Cloudflare 資源信息 | AI Assistant |
