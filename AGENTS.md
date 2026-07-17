# AGENTS.md - 項目約束與開發規範

> 本文件是 AI 編程代理和開發者的強制約束文件。所有代碼生成、修改、審查必須遵守以下規則。

---

## 項目概述

Rust + Cloudflare Workers CMS,基於 PbootCMS 3.2.12 數據庫結構,前後端完全分離的純 API 後端,部署在 Cloudflare Workers 上,專為廣告站、Google SEO 場景設計,配合獨立靜態生成層輸出全靜態頁面。

### 參考項目路徑

- PbootCMS 3.2.12 (PHP原版): `F:\mysite\AI\idea\pbootcmstogo\PbootCMS-3.2.12`
- pbootcms-go (自研Go版): `F:\mysite\AI\idea\pbootcmstogo\pbootcms-go`
- AnqiCMS v3.6.2 (二進制分發): `F:\mysite\AI\idea\pbootcmstogo\anqicms-linux-amd64-v3.6.2`
- 本項目: `F:\mysite\AI\idea\Cloudflarerustcms`

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
- 表前綴 `ay_` 保持不變

### 2. 技術棧固定

- 後端語言: **Rust**（編譯目標 `wasm32-unknown-unknown`）
- 運行時: **workers-rs**（`worker` crate >= 0.8.0）
- 數據庫: **Cloudflare D1**（通過 binding API 訪問,**禁止使用 sqlx**）
- 緩存: **Cloudflare KV**
- 文件存儲: **Cloudflare R2**
- 序列化: **serde + serde_json**

### 3. 禁止引入的依賴

| 禁止依賴 | 理由 | 替代方案 |
|---------|------|---------|
| `sqlx` | D1 是 binding 資源,非網絡數據庫 | `worker` crate 的 D1 binding API |
| `jsonwebtoken` | wasm 兼容性差,C 依賴 | 自行實現 HS256（`sha2` + `hmac`） |
| `bcrypt` | 與 PbootCMS 雙 MD5 密碼不兼容 | 雙 MD5（`md5` crate） |
| `image` / 圖片處理庫 | 增加 WASM 體積 | 水印交由靜態生成層處理 |
| `tokio` | Workers 有自己的異步運行時 | `worker` crate 的異步 |
| `reqwest` | Workers 原生 HTTP 客戶端 | `worker::Fetch` |
| 任何模板引擎 | 後端純 API,不渲染頁面 | 無 |

### 4. 密碼方案固定

- 使用雙 MD5: `md5(md5(password))`
- 與 PbootCMS 原版和 Go 版完全兼容
- 密碼比對使用常量時間比較（防時序攻擊）
- **禁止**使用 bcrypt / argon2 / scrypt

### 5. 前後端分離

- Worker **只返回 JSON**,禁止渲染 HTML
- 管理後台是獨立 SPA,部署在 Cloudflare Pages,**禁止打包進 Worker**
- 前台頁面由獨立靜態生成服務生成,**Worker 不參與頁面渲染**

---

## 代碼規範

### Rust 代碼規範

1. **命名**: snake_case（函數/變量）, PascalCase（結構體/Trait）, SCREAMING_SNAKE_CASE（常量）
2. **模塊組織**: handler（薄）→ service（厚）→ model（純數據）
3. **錯誤處理**: 使用 `Result<T, worker::Error>`,禁止 `unwrap()`/`expect()` 在生產代碼中
4. **SQL 語句**: 以字符串常量定義,通過 D1 binding 的 `.bind()` 傳參,**禁止字符串拼接 SQL**
5. **異步**: 所有 D1/KV/R2 操作使用 async/await
6. **日誌**: 使用 `console_log!` 宏,不使用 `println!`
7. **註釋**: 公共函數必須有文檔註釋(`///`),複雜邏輯必須有行內註釋(`//`)

### SQL 規範

```rust
// 正確: 參數化查詢
let stmt = env.db.prepare("SELECT * FROM ay_content WHERE scode = ? AND status = ?")
    .bind(&[scode, status])?;
let result = stmt.all().await?;

// 錯誤: 字符串拼接(SQL 注入風險)
let sql = format!("SELECT * FROM ay_content WHERE scode = '{}' AND status = '{}'", scode, status);
```

### 統一響應格式

```rust
// 所有接口必須返回統一格式
{
    "code": 0,        // 0=成功, 1=失敗
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
- 公開接口: `/api/v1/{resource}`
- 管理接口: `/api/v1/admin/{resource}` 或通過 JWT 鑑權區分
- SSG 接口: `/api/v1/ssg/{action}`（API Key 鑑權）

---

## 開發流程

### 新增功能時的檢查清單

1. [ ] 是否已有 PbootCMS 或 Go 版的對應實現? 優先參考其邏輯
2. [ ] 是否需要修改數據庫表結構? 如果是,**停止**,重新設計
3. [ ] 是否引入了禁止依賴? 如果是,尋找替代方案
4. [ ] WASM 體積是否增加過多? 用 `cargo build --release` 後檢查
5. [ ] SQL 是否參數化? 確認沒有字符串拼接
6. [ ] 響應格式是否統一? 確認 `{code, msg, data}` 結構
7. [ ] 熱點數據是否考慮了 KV 緩存?
8. [ ] 是否記錄了關鍵操作日誌?

### 代碼審查要點

1. D1 查詢是否參數化（防 SQL 注入）
2. 密碼處理是否用雙 MD5 + 常量時間比較
3. JWT 簽發/驗證是否正確
4. KV 緩存是否在數據修改後正確失效
5. 遞歸 CTE 是否正確（子孫欄目查詢）
6. 分頁邏輯是否正確（page 從 1 開始）
7. 錯誤處理是否完善（不 panic）
8. 響應格式是否統一

---

## PbootCMS 邏輯參考要點

開發時必須參考 PbootCMS 原版對應位置的邏輯,以下是關鍵邏輯的文件位置索引:

### 欄目樹構建
- PHP版: `core/function/handle.php` 的 `get_tree()` 函數（pcode/scode 遞歸）
- Go版: `apps/admin/service/content/ContentSortService.go` 的 `buildAreaTree()`
- Rust實現: 用遞歸 CTE 一次查詢,或在內存中遞歸構建

### URL 生成
- PHP版: `core/basic/Url.php` 的 `home()` 方法
- 三種模式: `url_rule_type` 配置項控制（1=普通, 2=偽靜態, 3=兼容）
- Go版: `apps/common/middleware/urlrewrite.go`
- 注意: 本項目 Worker 不生成 URL,URL 生成邏輯由靜態生成層實現

### 配置加載
- PHP版: `core/basic/Config.php` 的 `loadConfig()` 多層合併
- Go版: `apps/admin/model/db.go` 的 `preloadConfigCache()` 內存緩存
- Rust實現: KV 緩存 `config:all`,未命中時回退 D1 查詢

### 內容查詢
- PHP版: `apps/home/model/ParserModel.php`
- Go版: `apps/admin/service/content/ContentService.go`
- 關鍵: 批量預載入擴展字段（消除 N+1）,定時發布靠查詢過濾（`status=1 AND date <= now`）

### 密碼驗證
- PHP版: `md5(md5(password))`
- Go版: `apps/common/security.go`,`crypto/subtle.ConstantTimeCompare`
- Rust實現: `md5` crate + 常量時間比較

### 權限校驗
- PHP版: `ay_role_level.level` 存儲權限 URL 路徑
- Go版: `apps/common/middleware/auth.go`,超級管理員 uid=1 跳過
- Rust實現: JWT payload 攜帶用戶信息,中間件校驗

---

## 性能預算

| 指標 | 限制 | 目標 |
|------|------|------|
| WASM 體積 | 1MB（免費版）/ 10MB（付費版） | ≤ 800KB |
| 單請求 CPU 時間 | 10ms（免費版）/ 50ms（付費版） | ≤ 5ms |
| 常駐內存 | 128MB | ≤ 40MB |
| D1 每日寫入 | 100,000 行（免費版） | 盡量用 KV 緩存減少寫入 |
| D1 每日讀取 | 5,000,000 行（免費版） | 熱點數據走 KV |
| KV 每日讀取 | 100,000 次（免費版） | 合理設置 TTL |
| R2 存储 | 10GB（免費版） | 壓縮圖片,定期清理 |

---

## 環境配置

### 開發環境要求

- Rust 工具鏈（stable）
- `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
- `worker-build`: `cargo install worker-build`
- Node.js >= 18（管理後台 SPA + wrangler）
- wrangler CLI: `npm install -g wrangler`

### 包管理規範

- Rust: 使用 `cargo`,緩存路徑 `D:\AI\Cache\cargo`
- 前端: 使用 `pnpm`,緩存路徑 `D:\AI\Cache\pnpm`
- 所有臨時文件存放在 `D:\AI\Temp`

### 用戶環境規則

- PowerShell 只使用 pwsh.exe 7
- 禁止寫入 C 盤（系統盤）
- 所有工具/運行時/緩存/配置統一存放在 `D:\AI` 目錄
- `D:\AI` 目錄結構: Tools / Runtime / Cache / Data / IDE / Downloads / Temp

---

## 常見問題

### Q: 為什麼不用 sqlx?
A: D1 不是傳統網絡數據庫,它是 Cloudflare Workers 的 binding 資源。sqlx 依賴 TCP 驅動連接數據庫,在 `wasm32-unknown-unknown` 目標下無法編譯。正確方式是用 `worker` crate 的 D1 binding API: `env.db.prepare("SQL").bind(&[values]).all()`。

### Q: 為什麼不用 bcrypt?
A: PbootCMS 原版使用雙 MD5 密碼,「原數據庫不做任何修改」的硬約束要求密碼方案必須兼容。如果改用 bcrypt,所有遷移的用戶數據密碼都會失效。雙 MD5 + 登錄限頻 + 常量時間比較在廣告站場景下已足夠。

### Q: 為什麼自行實現 JWT?
A: `jsonwebtoken` crate 依賴 ring/openssl 等 C 庫,wasm 兼容性不確定。JWT HS256 本質是 HMAC-SHA256 + Base64URL,用純 Rust 的 `sha2` + `hmac` crate 即可實現,代碼量約 100 行,完全控制體積和安全。

### Q: acode 字段如何處理?
A: 保留字段（原數據庫不刪除）,固定使用默認值 `cn`。所有查詢帶 `WHERE acode = 'cn'`,不實現區域切換邏輯。這為未來可能的擴展留有餘地,但當前不投入開發成本。

### Q: 會員系統怎麼處理?
A: `ay_member` 相關表保留在數據庫中,但 Worker 不實現會員相關 API。廣告站場景無前台會員需求。

### Q: 模板引擎怎麼處理?
A: 後端 Worker 不包含任何模板渲染邏輯。模板渲染由獨立的靜態生成層完成。Worker 只提供 JSON API。

---

## 文件修改記錄

修改本文件或開發文檔時,請在此記錄:

| 日期 | 修改內容 | 修改人 |
|------|---------|--------|
| 2026-07-16 | 初始創建 | AI Assistant |
