# 需求審視與 YAGNI 分析

> 本文件基於對 PbootCMS 3.2.12 (PHP)、pbootcms-go (自研Go版)、AnqiCMS v3.6.2 三個項目的深度調研,結合 Cloudflare Workers + Rust 的技術現實,對原始需求文檔進行逐項審視。

---

## 一、核心問題清單

原始需求文檔存在以下技術錯誤和設計不合理之處,按嚴重程度排序。

### 問題 1:sqlx 無法對接 D1（技術錯誤）

需求文檔寫道「sqlx 對接 D1,靜態 SQL 綁定,杜絕反射」。這在技術上是不可行的。

D1 不是傳統意義上的網絡數據庫,它是 Cloudflare Workers 的 binding 資源,通過 `env.db.prepare("SQL").bind(&[values]).all()` 這樣的 Workers Binding API 訪問,不存在 TCP 連接、連接池、驅動層。sqlx 依賴 async TCP 驅動連接數據庫,在 `wasm32-unknown-unknown` 目標下根本無法編譯。

正確方案是使用 `worker` crate 提供的 D1 binding 封裝,直接調用 `D1Database::prepare().bind().all()` / `.first()` / `.run()` 方法。這也是 Cloudflare 官方文檔記載的唯一方式。

附帶好處:D1 binding API 天然參數化,不存在 SQL 注入風險,也沒有 ORM 反射開銷。

### 問題 2:bcrypt 與原版數據庫不兼容（兼容性錯誤）

需求文檔要求「密碼加密存儲（bcrypt）」。但 PbootCMS 原版使用的是 `md5(md5(password))` 雙重 MD5,Go 版為了兼容原版用戶數據也保留了這個方案。如果改用 bcrypt,所有從 PbootCMS 遷移過來的 `ay_user` 和 `ay_member` 表中的密碼都將失效。

「原數據庫不做任何修改」這條硬約束與 bcrypt 互斥。

正確方案:保留雙 MD5 密碼比對邏輯以兼容原版數據,使用常量時間比較防止時序攻擊。新建管理員密碼同樣用雙 MD5 存儲,保證全鏈路一致。廣告站場景下密碼安全需求沒有金融級別那麼高,雙 MD5 + 登錄限頻已足夠。

### 問題 3:多站點管理模塊不需要（YAGNI）

用戶已明確表示不需要站群管理。PbootCMS 的多區域（acode）體系是為多語言站點設計的,Go 版在此基礎上擴展了 `ay_area` 表實現多站點隔離。對於單站點廣告站場景,這套機制是純粹的複雜度負擔。

處理方式:保留 `acode` 字段（因為原數據庫不刪除字段）,但固定使用默認值 `cn`,不實現區域切換邏輯。所有查詢天然帶 `WHERE acode = 'cn'`,為未來可能的擴展留有餘地,但當前不投入開發成本。

### 問題 4:模板引擎不應存在於後端（架構錯誤）

PbootCMS 和 Go 版都內嵌了模板引擎（PHP 版用 `{pboot:xxx}` 標籤,Go 版用自研 TagParser + pongo2）。需求文檔已正確指出「後端只做數據與業務邏輯,不承擔任何前台頁面渲染」,但未明確聲明摒棄模板引擎。

需要明確:後端 Worker 不包含任何模板渲染邏輯。模板渲染由獨立的靜態生成層（部署在香港伺服器）完成,Worker 只提供 JSON API。這大幅削減 Worker 體積和 CPU 消耗。

### 問題 5:會員系統過重（YAGNI）

PbootCMS 有完整的會員系統（`ay_member`、`ay_member_group`、`ay_member_field`、`ay_member_comment` 四張表 + 登錄/註冊/評論/積分等流程）。對於廣告站/站群場景,前台會員功能幾乎不會用到。

處理方式:
- `ay_member` 相關表保留在數據庫中（不刪除）,但 Worker 不實現會員註冊、登錄、評論等前台 API
- 僅保留後台管理員賬號體系（`ay_user` + `ay_role` + `ay_role_level`）
- 內容/欄目的 `gtype`/`gid`/`gnote` 權限字段保留但固定為公開（gtype=4）,不實現前台權限校驗

### 問題 6:水印功能在 Workers 中不可行（技術約束）

PbootCMS 和 Go 版都支持圖片水印,依賴 GD 庫或 Go 的 image 包。在 `wasm32-unknown-unknown` 目標下,圖片處理庫（如 `image` crate）會大幅增加 WASM 體積,且 CPU 消耗可能超過免費版 10ms 限制。

處理方式:水印功能由靜態生成層或前端處理。Worker 只負責將原始圖片上傳到 R2,不做圖片處理。如果需要縮略圖,可使用 Cloudflare Image Resizing 服務。

### 問題 7:jsonwebtoken 的 wasm 兼容性風險（技術風險）

`jsonwebtoken` crate 依賴加密庫（ring 或 openssl）,這些 C 庫在 wasm 環境下可能無法編譯。雖然可以啟用純 Rust 的 crypto 後端,但會增加 WASM 體積。

更輕量的方案:JWT 的 HS256 算法本質上就是 HMAC-SHA256 + Base64URL 編碼。`sha2` 和 `hmac` crate 都是純 Rust 實現,wasm 兼容性好,體積小。可以自行實現 JWT 簽發和驗證,代碼量不超過 100 行,完全控制體積。

### 問題 8:操作日誌的 D1 寫入壓力（性能考量）

PbootCMS 的 `ay_syslog` 表記錄所有後台操作。在 Workers 環境下,D1 的寫入有次數限制（免費版每天 100,000 行寫入）。如果每次後台操作都寫日誌,可能快速消耗配額。

處理方式:僅記錄關鍵操作（登錄、內容發布/刪除、配置修改）,普通瀏覽操作不記錄。日誌寫入使用 D1 batch 或 `waitUntil` 異步寫入,不阻塞響應。

---

## 二、逐模塊 YAGNI 審視

對照例行詢問清單（Does this need to exist? Already in this codebase? Stdlib does it? Native platform feature? Installed dependency? One line?），逐個模塊審視:

| 模塊 | 是否需要 | 理由 | 處理方式 |
|------|---------|------|---------|
| 系統配置 | 需要 | 核心功能,PbootCMS 有 `ay_config` | 保留,KV 緩存配置 |
| 欄目分類 | 需要 | 核心功能,無限級欄目 | 保留,遞歸 CTE 查詢子孫欄目 |
| 內容管理 | 需要 | 核心功能,文章 CRUD | 保留,批量操作 |
| 單頁管理 | 需要 | 關於我們、聯繫我們等 | 保留,對應 `ay_single` 表 |
| 附件管理 | 需要 | R2 存儲對接 | 保留,簡化圖片處理 |
| 管理員登錄 | 需要 | 後台準入 | 保留,JWT + 雙MD5 |
| 角色權限 | 簡化保留 | PbootCMS 有完整 RBAC | 保留表結構,簡化權限校驗 |
| 多站點管理 | **不需要** | 用戶明確表示不需要 | 刪除,acode 固定為 cn |
| 留言表單 | 需要 | 廣告站聯繫表單 | 保留,對應 `ay_message` |
| 會員系統 | **不需要** | 廣告站無前台會員需求 | 表保留,不開發 API |
| 評論系統 | **不需要** | 廣告站無評論需求 | 表保留,不開發 API |
| 水印功能 | **不需要** | Workers 環境不適合 | 移至靜態生成層 |
| 驗證碼 | 替代方案 | 傳統驗證碼在 wasm 中實現成本高 | 用 Cloudflare Turnstile |
| 全文搜索 | 降級方案 | D1 支持 FTS5 但配置複雜 | 用 SQL LIKE 降級,未來可加 FTS5 |
| 操作日誌 | 輕量保留 | 安全審計需要 | 僅記錄關鍵操作 |
| 301重定向 | 需要 | SEO 需要,Workers 原生支持 | 保留,對應 `ay_301_redirect` |
| 友情連結 | 需要 | SEO 常見需求 | 保留,對應 `ay_link` |
| 幻燈片 | 需要 | 廣告站常見 | 保留,對應 `ay_slide` |
| 標籤/內鏈 | 需要 | SEO 內鏈建設 | 保留,對應 `ay_tags` |
| 自定義標籤 | 需要 | 靈活配置 | 保留,對應 `ay_label` |

---

## 三、技術選型修正

| 項目 | 原始需求 | 修正方案 | 修正理由 |
|------|---------|---------|---------|
| 數據庫訪問 | sqlx | `worker` crate D1 binding API | D1 是 binding 資源,非網絡數據庫 |
| 密碼加密 | bcrypt | 雙 MD5（兼容原版） | 原數據庫不修改,需兼容遷移數據 |
| JWT 庫 | jsonwebtoken | 自行實現 HS256（sha2 + hmac） | 控制體積,避免 C 依賴 |
| Web 框架 | 未明確 | `worker` crate Router | 官方支持,功能足夠 |
| 序列化 | serde + serde_json | 保持不變 | 正確選擇 |
| 模板引擎 | 未提及（暗含不需要） | 不需要 | 後端純 API |
| 緩存 | KV | 保持不變 | 正確選擇 |
| 文件存儲 | R2 | 保持不變 | 正確選擇 |
| 驗證碼 | 未提及 | Cloudflare Turnstile | 原生支持,無需 wasm 實現 |
| 編譯目標 | wasm32-unknown-unknown | 保持不變 | 正確選擇 |

---

## 四、原始需求文檔中的合理設計（保留）

以下設計決策經審視後確認合理,予以保留:

1. **前後端完全分離**:後端純 API,管理後台獨立 SPA,靜態生成層獨立部署。這是正確的架構方向,與 PbootCMS/Go 版的內嵌模板模式相比是質的飛躍。

2. **四層解耦架構**:API 層（Workers）、數據層（D1）、緩存層（KV）、存儲層（R2）各司其職,符合 Cloudflare 最佳實踐。

3. **靜態生成專用接口**:為 SSG 設計全量導出、增量更新、分頁拉取等專用接口,是廣告站場景的核心需求。

4. **管理後台獨立部署到 Pages**:不佔用 Worker 資源,符合成本控制原則。

5. **統一響應格式** `{code, msg, data}`:與 Go版一致,前端處理統一。

6. **RESTful 風格 + `/api/v1/` 前綴**:與 Go版一致,版本化便於演進。

---

## 五、修正後的功能範圍

### 保留並實現的模塊

1. 系統配置管理（`ay_config` + `ay_site` + `ay_company`）
2. 欄目分類管理（`ay_content_sort` + `ay_model`）
3. 內容管理（`ay_content` + `ay_content_ext` + `ay_extfield`）
4. 單頁管理（`ay_single`）
5. 附件管理（R2 對接）
6. 管理員與權限（`ay_user` + `ay_role` + `ay_role_level` + `ay_menu` + `ay_menu_action`）
7. 留言表單（`ay_message` + `ay_form` + `ay_form_field`）
8. 友情連結（`ay_link`）
9. 幻燈片（`ay_slide`）
10. 標籤/內鏈（`ay_tags`）
11. 自定義標籤（`ay_label`）
12. 301重定向（`ay_301_redirect`）
13. 系統日誌（`ay_syslog`）
14. 靜態生成專用接口

### 保留表結構但不開發 API 的模塊

1. 會員系統（`ay_member` + `ay_member_group` + `ay_member_field` + `ay_member_comment`）
2. 區域管理（`ay_area` + `ay_role_area`）
3. 數據庫備份（`ay_database`）
4. 類型字典（`ay_type`）

### 完全摒棄的功能

1. 多站點/站群管理
2. 模板引擎和前台頁面渲染
3. 圖片水印處理
4. SMTP 郵件發送（Workers 環境下用 Cloudflare Email Service 替代,但廣告站場景暫不需要）
5. 微信/支付寶集成
6. 百度推送（可由靜態生成層完成）
