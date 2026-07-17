# API 接口設計

> 本文件定義 Rust + Cloudflare Workers CMS 項目的全部 API 接口規範。後端為純 API 服務,不承擔任何前台頁面渲染。前台頁面由獨立的靜態生成層（部署於香港伺服器）通過調用 API 拉取數據後生成靜態 HTML。設計參考 pbootcms-go 的 API 風格,並針對 Cloudflare Workers 環境做了適配。

---

## 目錄

- [一、API 設計規範](#一api-設計規範)
  - [1.1 統一前綴](#11-統一前綴)
  - [1.2 統一響應格式](#12-統一響應格式)
  - [1.3 鑑權方式](#13-鑑權方式)
  - [1.4 分頁參數](#14-分頁參數)
  - [1.5 排序參數](#15-排序參數)
  - [1.6 請求規範](#16-請求規範)
  - [1.7 限頻策略](#17-限頻策略)
- [二、認證接口](#二認證接口)
- [三、前台公開數據接口](#三前台公開數據接口)
- [四、後台管理接口](#四後台管理接口)
  - [4.1 內容管理](#41-內容管理)
  - [4.2 欄目管理](#42-欄目管理)
  - [4.3 單頁管理](#43-單頁管理)
  - [4.4 系統配置](#44-系統配置)
  - [4.5 站點信息](#45-站點信息)
  - [4.6 公司信息](#46-公司信息)
  - [4.7 幻燈片管理](#47-幻燈片管理)
  - [4.8 友情連結管理](#48-友情連結管理)
  - [4.9 標籤/內鏈管理](#49-標籤內鏈管理)
  - [4.10 自定義標籤管理](#410-自定義標籤管理)
  - [4.11 留言管理](#411-留言管理)
  - [4.12 自定義表單](#412-自定義表單)
  - [4.13 附件管理](#413-附件管理)
  - [4.14 管理員管理](#414-管理員管理)
  - [4.15 角色管理](#415-角色管理)
  - [4.16 菜單管理](#416-菜單管理)
  - [4.17 系統日誌](#417-系統日誌)
  - [4.18 301 重定向](#418-301-重定向)
- [五、靜態生成專用接口](#五靜態生成專用接口)
- [六、請求/響應示例](#六請求響應示例)
- [七、錯誤碼定義](#七錯誤碼定義)

---

## 一、API 設計規範

### 1.1 統一前綴

所有接口統一使用 `/api/v1/` 前綴,採用 RESTful 風格設計。

```
https://{worker-domain}/api/v1/{資源路徑}
```

版本號 `v1` 內嵌於 URL 路徑中,便於未來版本演進時保持向後兼容。

### 1.2 統一響應格式

所有接口（無論成功或失敗）均返回統一的 JSON 結構:

```json
{
  "code": 0,
  "msg": "success",
  "data": {},
  "meta": {
    "page": 1,
    "pagesize": 20,
    "total": 100
  }
}
```

| 字段 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `code` | `number` | 是 | 狀態碼。`0` 表示成功,非 `0` 表示失敗（具體值見[錯誤碼定義](#七錯誤碼定義)） |
| `msg` | `string` | 是 | 描述信息。成功時為 `"success"`,失敗時為具體錯誤描述 |
| `data` | `any` | 是 | 響應數據。成功時為實際數據對象或數組,失敗時為 `null` |
| `meta` | `object` | 否 | 分頁元信息。僅分頁列表接口返回此字段 |

**分頁 `meta` 結構:**

| 字段 | 類型 | 說明 |
|------|------|------|
| `page` | `number` | 當前頁碼（從 1 開始） |
| `pagesize` | `number` | 每頁條數 |
| `total` | `number` | 總記錄數 |

**成功響應示例:**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": 1,
    "title": "關於我們"
  }
}
```

**失敗響應示例:**

```json
{
  "code": 1002,
  "msg": "未授權,請先登錄",
  "data": null
}
```

**分頁列表響應示例:**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    { "id": 1, "title": "文章一" },
    { "id": 2, "title": "文章二" }
  ],
  "meta": {
    "page": 1,
    "pagesize": 20,
    "total": 58
  }
}
```

### 1.3 鑑權方式

採用 JWT Bearer Token 鑑權。

**請求頭格式:**

```
Authorization: Bearer <jwt_token>
```

**鑑權規則:**

| 接口類型 | 鑑權要求 | 說明 |
|---------|---------|------|
| 公開接口 | 無需鑑權 | 前台數據接口、靜態生成接口,任何人可訪問 |
| 認證接口 | 部分需鑑權 | login 無需鑑權,refresh/profile/logout 需鑑權 |
| 管理接口 | 必須鑑權 | 後台所有 CRUD 接口均需攜帶有效 JWT |

**JWT 結構:**

JWT 採用 HS256 算法簽名（基於 `sha2` + `hmac` crate 自行實現,避免 C 依賴）。

```json
// Header
{
  "alg": "HS256",
  "typ": "JWT"
}

// Payload
{
  "sub": "1",              // 用戶 ID
  "username": "admin",     // 用戶名
  "role_id": 1,            // 角色 ID
  "iat": 1700000000,       // 簽發時間
  "exp": 1700086400        // 過期時間（默認 24 小時）
}
```

**Token 過期處理:**

- Access Token 默認有效期 24 小時
- 客戶端在 Token 過期前可調用 `/api/v1/auth/refresh` 刷新
- Token 過期後返回錯誤碼 `2002`,客戶端需重新登錄或使用 refresh token

### 1.4 分頁參數

所有列表接口支持分頁,通過 query 參數控制:

| 參數 | 類型 | 默認值 | 說明 |
|------|------|--------|------|
| `page` | `number` | `1` | 當前頁碼,從 1 開始 |
| `pagesize` | `number` | `20` | 每頁條數,最大不超過 100 |

**示例:**

```
GET /api/v1/contents?page=2&pagesize=10
```

### 1.5 排序參數

列表接口支持排序,通過 `order` 參數控制:

| 參數 | 類型 | 默認值 | 說明 |
|------|------|--------|------|
| `order` | `string` | 各接口默認排序 | 排序字段及方向,格式為 `field:asc` 或 `field:desc` |

**示例:**

```
GET /api/v1/contents?order=date:desc
GET /api/v1/contents?order=sorting:asc
```

多字段排序使用逗號分隔:

```
GET /api/v1/contents?order=istop:desc,date:desc
```

### 1.6 請求規範

| 項目 | 規範 |
|------|------|
| 請求方法 | 嚴格遵循 RESTful 語義:GET 查詢、POST 新增、PUT 修改、DELETE 刪除 |
| 請求體格式 | `application/json`（文件上傳除外,使用 `multipart/form-data`） |
| 字符編碼 | 統一 UTF-8 |
| 時間格式 | Unix 時間戳（秒級） |
| 布爾值 | `true` / `false`（JSON 布爾類型） |
| 空值處理 | 可選字段不傳或傳 `null` 均視為空值 |

### 1.7 限頻策略

基於 Cloudflare Workers 的請求計數能力實現簡單限頻:

| 接口類型 | 限頻規則 | 說明 |
|---------|---------|------|
| 登錄接口 | 同一 IP 每分鐘 10 次 | 防止暴力破解 |
| 留言提交 | 同一 IP 每分鐘 5 次 | 防止垃圾留言 |
| 公開查詢接口 | 同一 IP 每秒 30 次 | 防止惡意爬取 |
| 管理接口 | 同一用戶每秒 20 次 | 正常管理操作不受影響 |

超限返回 HTTP 429 狀態碼:

```json
{
  "code": 1005,
  "msg": "請求過於頻繁,請稍後再試",
  "data": null
}
```

---

## 二、認證接口

認證接口用於管理員登錄、Token 刷新和信息獲取。

| 方法 | 路由 | 鑑權 | 說明 |
|------|------|------|------|
| POST | `/api/v1/auth/login` | 公開 | 管理員登錄,返回 JWT Token |
| POST | `/api/v1/auth/refresh` | 需認證 | 刷新 Token,返回新 Token |
| GET | `/api/v1/auth/profile` | 需認證 | 獲取當前登錄用戶信息 |
| POST | `/api/v1/auth/logout` | 需認證 | 登出（可選,KV 黑名單機制） |

### 接口詳情

#### POST /api/v1/auth/login

管理員登錄,驗證用戶名密碼後簽發 JWT Token。

密碼採用雙 MD5 比對（`md5(md5(password))`）以兼容 PbootCMS 原版數據,使用常量時間比較防止時序攻擊。

**請求體:**

```json
{
  "username": "admin",
  "password": "123456"
}
```

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `username` | `string` | 是 | 管理員用戶名 |
| `password` | `string` | 是 | 明文密碼（傳輸層由 HTTPS 保護） |

**成功響應 (code=0):**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 86400,
    "user": {
      "id": 1,
      "username": "admin",
      "realname": "管理員",
      "role_id": 1,
      "role_name": "超級管理員"
    }
  }
}
```

#### POST /api/v1/auth/refresh

刷新 Token。客戶端攜帶當前有效（或即將過期）的 Token,服務端簽發新 Token。

**請求頭:** `Authorization: Bearer <token>`

**成功響應 (code=0):**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 86400
  }
}
```

#### GET /api/v1/auth/profile

獲取當前登錄用戶的詳細信息,包括角色和菜單權限。

**請求頭:** `Authorization: Bearer <token>`

**成功響應 (code=0):**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": 1,
    "username": "admin",
    "realname": "管理員",
    "avatar": "/upload/avatar/1.png",
    "role_id": 1,
    "role_name": "超級管理員",
    "menus": [
      {
        "id": 1,
        "name": "內容管理",
        "url": "/admin/content",
        "icon": "fa-file-text",
        "children": []
      }
    ]
  }
}
```

#### POST /api/v1/auth/logout

登出當前用戶。可選實現:將當前 Token 的 `jti`（JWT ID）寫入 KV 黑名單,設置過期時間與 Token 剩餘有效期一致。

**請求頭:** `Authorization: Bearer <token>`

**成功響應 (code=0):**

```json
{
  "code": 0,
  "msg": "success",
  "data": null
}
```

---

## 三、前台公開數據接口

前台公開接口供靜態生成層和前端 SPA 調用,無需鑑權。所有接口返回標準統一響應格式。

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/site` | 站點信息 |
| GET | `/api/v1/company` | 公司信息 |
| GET | `/api/v1/sorts` | 欄目列表（?scode=&mcode=&status=） |
| GET | `/api/v1/sorts/:scode` | 欄目詳情（scode/filename/urlname 三選一） |
| GET | `/api/v1/nav` | 導航樹（遞歸構建 children） |
| GET | `/api/v1/contents` | 內容列表（?scode=&mcode=&keyword=&page=&pagesize=&istop=&isrecommend=&order=） |
| GET | `/api/v1/contents/:id` | 內容詳情（?track=1 累加訪問量） |
| GET | `/api/v1/contents/:id/images` | 內容圖片列表 |
| GET | `/api/v1/search` | 搜索（?q=&page=&pagesize=） |
| POST | `/api/v1/messages` | 提交留言（限頻） |
| GET | `/api/v1/slides` | 幻燈片（?gid=） |
| GET | `/api/v1/links` | 友情連結（?gid=） |
| GET | `/api/v1/tags` | 標籤列表 |
| GET | `/api/v1/labels` | 自定義標籤 |
| GET | `/api/v1/singles` | 單頁列表 |
| GET | `/api/v1/singles/:scode` | 單頁詳情 |

### 接口詳情

#### GET /api/v1/site

獲取站點信息,對應 `ay_site` 表。

**Query 參數:** 無

**響應 `data` 字段:**

```json
{
  "id": 1,
  "title": "示例站點",
  "subtitle": "歡迎訪問",
  "domain": "https://example.com",
  "logo": "/upload/logo.png",
  "keywords": "關鍵詞1,關鍵詞2",
  "description": "站點描述",
  "icp": "粵ICP備XXXXXXXX號",
  "theme": "default"
}
```

#### GET /api/v1/company

獲取公司信息,對應 `ay_company` 表。

**Query 參數:** 無

**響應 `data` 字段:**

```json
{
  "id": 1,
  "name": "示例公司",
  "address": "廣東省深圳市XX區XX路XX號",
  "phone": "0755-12345678",
  "mobile": "13800138000",
  "email": "contact@example.com",
  "qq": "12345678",
  "wechat": "wechat_id",
  "latitude": "22.5431",
  "longitude": "114.0579",
  "description": "公司簡介"
}
```

#### GET /api/v1/sorts

獲取欄目列表,對應 `ay_content_sort` 表。支持按欄目編碼、模型編碼和狀態篩選。

**Query 參數:**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `scode` | `string` | 否 | 欄目編碼,精確匹配 |
| `mcode` | `string` | 否 | 模型編碼,精確匹配 |
| `status` | `number` | 否 | 狀態:1=啟用,0=禁用。默認只返回啟用欄目 |
| `pcode` | `string` | 否 | 父欄目編碼,用於獲取子欄目 |

**響應 `data` (數組):**

```json
[
  {
    "id": 1,
    "scode": "1001",
    "pcode": "0",
    "name": "公司新聞",
    "mcode": "1",
    "listtpl": "newslist.html",
    "contenttpl": "news.html",
    "status": 1,
    "sorting": 100,
    "filename": "news",
    "urlname": "company-news",
    "ico": "",
    "pic": "",
    "title": "公司新聞標題",
    "keywords": "新聞關鍵詞",
    "description": "新聞描述",
    "outlink": "",
    "sonnum": 3
  }
]
```

#### GET /api/v1/sorts/:scode

獲取欄目詳情。`:scode` 可傳入欄目編碼（scode）、欄目文件名（filename）或 URL 別名（urlname）,服務端依次嘗試匹配。

**路徑參數:**

| 參數 | 說明 |
|------|------|
| `scode` | 欄目編碼 / 文件名 / URL別名（三選一,服務端自動識別） |

**響應 `data`:** 同欄目列表中的單個欄目對象。

#### GET /api/v1/nav

獲取導航樹。遞歸構建欄目樹形結構,`children` 字段包含子欄目。

**Query 參數:**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `status` | `number` | 否 | 狀態篩選,默認只返回啟用欄目 |

**響應 `data` (數組,樹形結構):**

```json
[
  {
    "id": 1,
    "scode": "1001",
    "pcode": "0",
    "name": "關於我們",
    "filename": "about",
    "urlname": "about",
    "status": 1,
    "sorting": 100,
    "outlink": "",
    "children": [
      {
        "id": 2,
        "scode": "1002",
        "pcode": "1001",
        "name": "公司簡介",
        "filename": "intro",
        "urlname": "about-intro",
        "status": 1,
        "sorting": 100,
        "outlink": "",
        "children": []
      }
    ]
  }
]
```

#### GET /api/v1/contents

獲取內容列表,對應 `ay_content` + `ay_content_ext` 表。支持多條件篩選和分頁。

**Query 參數:**

| 參數 | 類型 | 必填 | 默認值 | 說明 |
|------|------|------|--------|------|
| `scode` | `string` | 否 | - | 欄目編碼,支持傳入多個（逗號分隔） |
| `mcode` | `string` | 否 | - | 模型編碼 |
| `keyword` | `string` | 否 | - | 關鍵詞搜索（標題 + 副標題 + 描述） |
| `page` | `number` | 否 | `1` | 頁碼 |
| `pagesize` | `number` | 否 | `20` | 每頁條數 |
| `istop` | `number` | 否 | - | 是否置頂:1=是,0=否 |
| `isrecommend` | `number` | 否 | - | 是否推薦:1=是,0=否 |
| `isheadline` | `number` | 否 | - | 是否頭條:1=是,0=否 |
| `order` | `string` | 否 | `date:desc` | 排序字段 |
| `status` | `number` | 否 | `1` | 狀態:1=已發布,0=草稿。前台默認只返回已發布 |

**支持的排序字段:**

| 字段 | 說明 |
|------|------|
| `date` | 發布時間 |
| `sorting` | 排序值 |
| `hits` | 點擊量 |
| `id` | ID |

**響應 `data` (數組) + `meta`:**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": 101,
      "scode": "1001",
      "sort_name": "公司新聞",
      "title": "公司獲得行業大獎",
      "subtitle": "年度最佳企業獎",
      "titlecolor": "",
      "istop": 1,
      "isrecommend": 1,
      "isheadline": 0,
      "date": 1700000000,
      "sorting": 100,
      "hits": 1280,
      "ico": "/upload/ico/101.jpg",
      "pics": "/upload/pics/101-1.jpg,/upload/pics/101-2.jpg",
      "description": "公司於近日獲得行業大獎...",
      "ext_xxx": "擴展字段值",
      "urlname": "company-news",
      "filename": "news"
    }
  ],
  "meta": {
    "page": 1,
    "pagesize": 20,
    "total": 58
  }
}
```

#### GET /api/v1/contents/:id

獲取內容詳情。`:id` 為內容 ID。

**路徑參數:**

| 參數 | 說明 |
|------|------|
| `id` | 內容 ID（數字） |

**Query 參數:**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `track` | `number` | 否 | 傳入 `1` 時累加訪問量（hits + 1）,適合前台頁面訪問時調用 |

**響應 `data`:**

```json
{
  "id": 101,
  "scode": "1001",
  "sort_name": "公司新聞",
  "title": "公司獲得行業大獎",
  "subtitle": "年度最佳企業獎",
  "titlecolor": "",
  "istop": 1,
  "isrecommend": 1,
  "isheadline": 0,
  "date": 1700000000,
  "sorting": 100,
  "hits": 1281,
  "ico": "/upload/ico/101.jpg",
  "pics": "/upload/pics/101-1.jpg,/upload/pics/101-2.jpg",
  "description": "公司於近日獲得行業大獎...",
  "content": "<p>正文HTML內容...</p>",
  "tags": "標籤1,標籤2",
  "author": "管理員",
  "source": "本站原創",
  "ext_xxx": "擴展字段值",
  "urlname": "company-news",
  "filename": "news",
  "sort": {
    "scode": "1001",
    "name": "公司新聞",
    "filename": "news",
    "urlname": "company-news"
  },
  "prev": {
    "id": 100,
    "title": "上一篇標題"
  },
  "next": {
    "id": 102,
    "title": "下一篇標題"
  }
}
```

#### GET /api/v1/contents/:id/images

獲取內容關聯的圖片列表,解析 `pics` 字段並返回數組。

**路徑參數:**

| 參數 | 說明 |
|------|------|
| `id` | 內容 ID |

**響應 `data` (數組):**

```json
[
  {
    "url": "/upload/pics/101-1.jpg",
    "title": "圖片標題1"
  },
  {
    "url": "/upload/pics/101-2.jpg",
    "title": "圖片標題2"
  }
]
```

#### GET /api/v1/search

全文搜索。當前實現使用 SQL `LIKE` 降級方案,搜索標題和描述字段。未來可升級為 D1 FTS5 全文索引。

**Query 參數:**

| 參數 | 類型 | 必填 | 默認值 | 說明 |
|------|------|------|--------|------|
| `q` | `string` | 是 | - | 搜索關鍵詞 |
| `scode` | `string` | 否 | - | 限定欄目搜索範圍 |
| `page` | `number` | 否 | `1` | 頁碼 |
| `pagesize` | `number` | 否 | `20` | 每頁條數 |

**響應:** 同 `/api/v1/contents` 響應格式,`data` 為匹配的內容列表 + `meta` 分頁信息。

#### POST /api/v1/messages

提交留言表單,對應 `ay_message` 表。受限頻保護（同一 IP 每分鐘 5 次）。

**請求體:**

```json
{
  "name": "張三",
  "mobile": "13800138000",
  "email": "zhangsan@example.com",
  "content": "留言內容",
  "scode": "1005",
  "form_id": 1
}
```

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `name` | `string` | 是 | 留言人姓名 |
| `mobile` | `string` | 否 | 手機號 |
| `email` | `string` | 否 | 郵箱 |
| `content` | `string` | 是 | 留言內容 |
| `scode` | `string` | 否 | 關聯欄目 |
| `form_id` | `number` | 否 | 自定義表單 ID（用於擴展字段） |
| `ext_*` | `any` | 否 | 自定義表單擴展字段 |

**成功響應 (code=0):**

```json
{
  "code": 0,
  "msg": "留言提交成功",
  "data": {
    "id": 501
  }
}
```

#### GET /api/v1/slides

獲取幻燈片列表,對應 `ay_slide` 表。

**Query 參數:**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `gid` | `number` | 否 | 幻燈片分組 ID,不傳則返回全部 |

**響應 `data` (數組):**

```json
[
  {
    "id": 1,
    "gid": 1,
    "name": "首頁Banner",
    "pic": "/upload/slide/1.jpg",
    "link": "/about",
    "title": "幻燈片標題",
    "subtitle": "幻燈片副標題",
    "sorting": 100,
    "status": 1
  }
]
```

#### GET /api/v1/links

獲取友情連結列表,對應 `ay_link` 表。

**Query 參數:**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `gid` | `number` | 否 | 連結分組 ID,不傳則返回全部 |

**響應 `data` (數組):**

```json
[
  {
    "id": 1,
    "gid": 1,
    "name": "友情站點",
    "link": "https://friend.com",
    "logo": "/upload/link/1.png",
    "sorting": 100,
    "status": 1
  }
]
```

#### GET /api/v1/tags

獲取標籤列表,對應 `ay_tags` 表。標籤用於 SEO 內鏈建設。

**Query 參數:**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `page` | `number` | 否 | 頁碼,默認 1 |
| `pagesize` | `number` | 否 | 每頁條數,默認 20 |

**響應 `data` (數組) + `meta`:**

```json
[
  {
    "id": 1,
    "name": "SEO優化",
    "link": "/tags/seo",
    "sorting": 100,
    "status": 1
  }
]
```

#### GET /api/v1/labels

獲取自定義標籤列表,對應 `ay_label` 表。自定義標籤用於在模板中插入動態內容。

**Query 參數:** 無

**響應 `data` (數組):**

```json
[
  {
    "id": 1,
    "name": "聯繫電話",
    "value": "0755-12345678",
    "description": "首頁底部聯繫電話"
  }
]
```

#### GET /api/v1/singles

獲取單頁列表,對應 `ay_single` 表。單頁用於「關於我們」、「聯繫我們」等靜態頁面。

**Query 參數:** 無

**響應 `data` (數組):**

```json
[
  {
    "id": 1,
    "scode": "2001",
    "title": "關於我們",
    "content": "<p>關於我們的內容...</p>",
    "keywords": "關於我們",
    "description": "公司簡介",
    "ico": "",
    "pic": "",
    "status": 1
  }
]
```

#### GET /api/v1/singles/:scode

獲取單頁詳情。`:scode` 為欄目編碼。

**路徑參數:**

| 參數 | 說明 |
|------|------|
| `scode` | 單頁欄目編碼 |

**響應 `data`:** 同單頁列表中的單個對象。

---

## 四、後台管理接口

所有後台管理接口均需認證（`Authorization: Bearer <token>`）。接口採用統一的 RESTful 風格:

- **GET** `/api/v1/admin/{resource}` — 列表查詢（分頁）
- **GET** `/api/v1/admin/{resource}/:id` — 單條詳情
- **POST** `/api/v1/admin/{resource}` — 新增
- **PUT** `/api/v1/admin/{resource}/:id` — 修改
- **DELETE** `/api/v1/admin/{resource}/:id` — 刪除

### 4.1 內容管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/contents` | 內容列表（支持分頁、欄目篩選、關鍵詞搜索、狀態篩選） |
| GET | `/api/v1/admin/contents/:id` | 內容詳情（含擴展字段） |
| POST | `/api/v1/admin/contents` | 新增內容 |
| PUT | `/api/v1/admin/contents/:id` | 修改內容 |
| DELETE | `/api/v1/admin/contents/:id` | 刪除內容（移入回收站） |
| POST | `/api/v1/admin/contents/batch` | 批量操作（刪除、移動欄目、設置狀態） |
| GET | `/api/v1/admin/contents/trash` | 回收站列表 |
| PUT | `/api/v1/admin/contents/:id/restore` | 從回收站恢復 |
| DELETE | `/api/v1/admin/contents/:id/force` | 徹底刪除（不可恢復） |
| PUT | `/api/v1/admin/contents/:id/sort` | 修改排序值 |
| PUT | `/api/v1/admin/contents/:id/status` | 修改狀態（發布/草稿） |

**內容列表 Query 參數:**

| 參數 | 類型 | 說明 |
|------|------|------|
| `page` | `number` | 頁碼 |
| `pagesize` | `number` | 每頁條數 |
| `scode` | `string` | 欄目編碼篩選 |
| `keyword` | `string` | 關鍵詞搜索 |
| `status` | `number` | 狀態:1=已發布,0=草稿 |
| `istop` | `number` | 是否置頂 |
| `isrecommend` | `number` | 是否推薦 |
| `order` | `string` | 排序 |

**新增/修改內容請求體:**

```json
{
  "scode": "1001",
  "title": "文章標題",
  "subtitle": "副標題",
  "titlecolor": "",
  "istop": 0,
  "isrecommend": 0,
  "isheadline": 0,
  "date": 1700000000,
  "sorting": 100,
  "ico": "/upload/ico/101.jpg",
  "pics": "/upload/pics/101-1.jpg",
  "description": "文章摘要",
  "content": "<p>正文HTML</p>",
  "tags": "標籤1,標籤2",
  "author": "管理員",
  "source": "本站原創",
  "status": 1,
  "ext_fields": {
    "ext_author": "作者",
    "ext_source_url": "來源鏈接"
  }
}
```

**批量操作請求體:**

```json
{
  "action": "delete",
  "ids": [101, 102, 103],
  "scode": "1001"
}
```

| `action` 值 | 說明 | 額外參數 |
|------------|------|---------|
| `delete` | 批量刪除（移入回收站） | - |
| `move` | 批量移動欄目 | `scode`: 目標欄目編碼 |
| `publish` | 批量發布 | - |
| `draft` | 批量轉為草稿 | - |
| `top` | 批量置頂 | `istop`: 1或0 |
| `recommend` | 批量推薦 | `isrecommend`: 1或0 |

### 4.2 欄目管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/sorts` | 欄目列表（樹形結構） |
| GET | `/api/v1/admin/sorts/:id` | 欄目詳情 |
| POST | `/api/v1/admin/sorts` | 新增欄目 |
| PUT | `/api/v1/admin/sorts/:id` | 修改欄目 |
| DELETE | `/api/v1/admin/sorts/:id` | 刪除欄目（含子欄目校驗） |
| PUT | `/api/v1/admin/sorts/sort` | 批量排序（拖拽排序） |
| GET | `/api/v1/admin/sorts/tree` | 欄目樹（含模型信息,用於下拉選擇） |

**新增/修改欄目請求體:**

```json
{
  "pcode": "0",
  "name": "公司新聞",
  "mcode": "1",
  "listtpl": "newslist.html",
  "contenttpl": "news.html",
  "status": 1,
  "sorting": 100,
  "filename": "news",
  "urlname": "company-news",
  "ico": "",
  "pic": "",
  "title": "SEO標題",
  "keywords": "關鍵詞",
  "description": "描述",
  "outlink": ""
}
```

**批量排序請求體:**

```json
{
  "items": [
    { "id": 1, "sorting": 100 },
    { "id": 2, "sorting": 99 },
    { "id": 3, "sorting": 98 }
  ]
}
```

### 4.3 單頁管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/singles` | 單頁列表 |
| GET | `/api/v1/admin/singles/:id` | 單頁詳情 |
| PUT | `/api/v1/admin/singles/:id` | 修改單頁 |
| DELETE | `/api/v1/admin/singles/:id` | 刪除單頁 |

**修改單頁請求體:**

```json
{
  "title": "關於我們",
  "content": "<p>更新後的內容</p>",
  "keywords": "關於我們",
  "description": "公司簡介",
  "ico": "",
  "pic": "",
  "status": 1
}
```

### 4.4 系統配置

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/config` | 讀取系統配置（全量或分組） |
| PUT | `/api/v1/admin/config` | 修改系統配置（批量） |

**讀取配置 Query 參數:**

| 參數 | 類型 | 說明 |
|------|------|------|
| `group` | `string` | 配置分組名稱,不傳則返回全部 |

**修改配置請求體:**

```json
{
  "config": {
    "api_cache_time": "3600",
    "api_cache_status": "1",
    "home_cache": "1",
    "content_cache": "1"
  }
}
```

**響應 `data` (配置鍵值對):**

```json
{
  "api_cache_time": "3600",
  "api_cache_status": "1",
  "home_cache": "1",
  "content_cache": "1"
}
```

### 4.5 站點信息

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/site` | 讀取站點信息 |
| PUT | `/api/v1/admin/site` | 修改站點信息 |

**修改站點信息請求體:**

```json
{
  "title": "站點標題",
  "subtitle": "站點副標題",
  "domain": "https://example.com",
  "logo": "/upload/logo.png",
  "keywords": "關鍵詞1,關鍵詞2",
  "description": "站點描述",
  "icp": "粵ICP備XXXXXXXX號",
  "theme": "default"
}
```

### 4.6 公司信息

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/company` | 讀取公司信息 |
| PUT | `/api/v1/admin/company` | 修改公司信息 |

**修改公司信息請求體:**

```json
{
  "name": "公司名稱",
  "address": "公司地址",
  "phone": "聯繫電話",
  "mobile": "手機號碼",
  "email": "聯繫郵箱",
  "qq": "QQ號碼",
  "wechat": "微信號",
  "latitude": "22.5431",
  "longitude": "114.0579",
  "description": "公司簡介"
}
```

### 4.7 幻燈片管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/slides` | 幻燈片列表（?gid=分組篩選） |
| GET | `/api/v1/admin/slides/:id` | 幻燈片詳情 |
| POST | `/api/v1/admin/slides` | 新增幻燈片 |
| PUT | `/api/v1/admin/slides/:id` | 修改幻燈片 |
| DELETE | `/api/v1/admin/slides/:id` | 刪除幻燈片 |

**新增/修改幻燈片請求體:**

```json
{
  "gid": 1,
  "name": "首頁Banner",
  "pic": "/upload/slide/1.jpg",
  "link": "/about",
  "title": "幻燈片標題",
  "subtitle": "幻燈片副標題",
  "sorting": 100,
  "status": 1
}
```

### 4.8 友情連結管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/links` | 友情連結列表（?gid=分組篩選） |
| GET | `/api/v1/admin/links/:id` | 友情連結詳情 |
| POST | `/api/v1/admin/links` | 新增友情連結 |
| PUT | `/api/v1/admin/links/:id` | 修改友情連結 |
| DELETE | `/api/v1/admin/links/:id` | 刪除友情連結 |

**新增/修改友情連結請求體:**

```json
{
  "gid": 1,
  "name": "友情站點名稱",
  "link": "https://friend.com",
  "logo": "/upload/link/1.png",
  "sorting": 100,
  "status": 1
}
```

### 4.9 標籤/內鏈管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/tags` | 標籤列表（分頁） |
| GET | `/api/v1/admin/tags/:id` | 標籤詳情 |
| POST | `/api/v1/admin/tags` | 新增標籤 |
| PUT | `/api/v1/admin/tags/:id` | 修改標籤 |
| DELETE | `/api/v1/admin/tags/:id` | 刪除標籤 |

**新增/修改標籤請求體:**

```json
{
  "name": "SEO優化",
  "link": "/tags/seo",
  "sorting": 100,
  "status": 1
}
```

### 4.10 自定義標籤管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/labels` | 自定義標籤列表 |
| GET | `/api/v1/admin/labels/:id` | 自定義標籤詳情 |
| POST | `/api/v1/admin/labels` | 新增自定義標籤 |
| PUT | `/api/v1/admin/labels/:id` | 修改自定義標籤 |
| DELETE | `/api/v1/admin/labels/:id` | 刪除自定義標籤 |

**新增/修改自定義標籤請求體:**

```json
{
  "name": "聯繫電話",
  "value": "0755-12345678",
  "description": "首頁底部聯繫電話"
}
```

### 4.11 留言管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/messages` | 留言列表（分頁、狀態篩選） |
| GET | `/api/v1/admin/messages/:id` | 留言詳情 |
| PUT | `/api/v1/admin/messages/:id/reply` | 回覆留言 |
| PUT | `/api/v1/admin/messages/:id/status` | 修改留言狀態（已讀/未讀/已回覆） |
| DELETE | `/api/v1/admin/messages/:id` | 刪除留言 |
| POST | `/api/v1/admin/messages/batch` | 批量操作（標記已讀、刪除） |

**留言列表 Query 參數:**

| 參數 | 類型 | 說明 |
|------|------|------|
| `page` | `number` | 頁碼 |
| `pagesize` | `number` | 每頁條數 |
| `status` | `number` | 狀態:0=未讀,1=已讀,2=已回覆 |
| `scode` | `string` | 關聯欄目篩選 |

**回覆留言請求體:**

```json
{
  "reply": "感謝您的留言,我們已收到。"
}
```

### 4.12 自定義表單

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/forms` | 表單定義列表 |
| GET | `/api/v1/admin/forms/:id` | 表單定義詳情（含字段定義） |
| POST | `/api/v1/admin/forms` | 新增表單定義 |
| PUT | `/api/v1/admin/forms/:id` | 修改表單定義 |
| DELETE | `/api/v1/admin/forms/:id` | 刪除表單定義 |
| GET | `/api/v1/admin/forms/:id/data` | 表單數據列表（分頁） |
| GET | `/api/v1/admin/forms/:id/data/:dataId` | 表單數據詳情 |
| DELETE | `/api/v1/admin/forms/:id/data/:dataId` | 刪除表單數據 |
| POST | `/api/v1/admin/forms/:id/fields` | 新增表單字段 |
| PUT | `/api/v1/admin/forms/:id/fields/:fieldId` | 修改表單字段 |
| DELETE | `/api/v1/admin/forms/:id/fields/:fieldId` | 刪除表單字段 |

**新增表單定義請求體:**

```json
{
  "name": "在線諮詢",
  "table_name": "ay_form_1",
  "description": "客戶在線諮詢表單"
}
```

**新增表單字段請求體:**

```json
{
  "name": "聯繫人",
  "field": "contact",
  "type": "text",
  "required": 1,
  "sorting": 100,
  "default": "",
  "options": ""
}
```

### 4.13 附件管理

| 方法 | 路由 | 說明 |
|------|------|------|
| POST | `/api/v1/admin/upload` | 上傳文件（multipart/form-data,存儲到 R2） |
| GET | `/api/v1/admin/attachments` | 附件列表（分頁、類型篩選） |
| GET | `/api/v1/admin/attachments/:id` | 附件詳情 |
| DELETE | `/api/v1/admin/attachments/:id` | 刪除附件（同時刪除 R2 對象） |

**上傳文件請求:**

```
POST /api/v1/admin/upload
Content-Type: multipart/form-data

file: <二進制文件>
type: image
```

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `file` | `binary` | 是 | 文件二進制數據 |
| `type` | `string` | 否 | 文件類型:image/file,默認自動識別 |

**上傳成功響應:**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": 501,
    "url": "/upload/image/20240101/abc123.jpg",
    "filename": "abc123.jpg",
    "original": "原始文件名.jpg",
    "size": 102400,
    "mime": "image/jpeg",
    "type": "image",
    "width": 1920,
    "height": 1080
  }
}
```

**附件列表 Query 參數:**

| 參數 | 類型 | 說明 |
|------|------|------|
| `page` | `number` | 頁碼 |
| `pagesize` | `number` | 每頁條數 |
| `type` | `string` | 類型篩選:image/file |
| `keyword` | `string` | 文件名搜索 |

### 4.14 管理員管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/users` | 管理員列表（分頁） |
| GET | `/api/v1/admin/users/:id` | 管理員詳情 |
| POST | `/api/v1/admin/users` | 新增管理員 |
| PUT | `/api/v1/admin/users/:id` | 修改管理員信息 |
| PUT | `/api/v1/admin/users/:id/password` | 修改密碼 |
| DELETE | `/api/v1/admin/users/:id` | 刪除管理員 |
| PUT | `/api/v1/admin/users/:id/status` | 啟用/禁用管理員 |

**新增管理員請求體:**

```json
{
  "username": "editor",
  "password": "123456",
  "realname": "編輯員",
  "role_id": 2,
  "status": 1
}
```

**修改密碼請求體:**

```json
{
  "old_password": "舊密碼",
  "new_password": "新密碼"
}
```

### 4.15 角色管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/roles` | 角色列表 |
| GET | `/api/v1/admin/roles/:id` | 角色詳情（含權限信息） |
| POST | `/api/v1/admin/roles` | 新增角色 |
| PUT | `/api/v1/admin/roles/:id` | 修改角色 |
| DELETE | `/api/v1/admin/roles/:id` | 刪除角色 |
| PUT | `/api/v1/admin/roles/:id/permissions` | 設置角色權限（菜單+操作） |

**新增/修改角色請求體:**

```json
{
  "name": "內容編輯",
  "description": "負責內容發布和管理",
  "status": 1
}
```

**設置角色權限請求體:**

```json
{
  "permissions": [
    { "menu_id": 1, "actions": ["list", "view"] },
    { "menu_id": 2, "actions": ["list", "view", "add", "edit", "delete"] }
  ]
}
```

### 4.16 菜單管理

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/menus` | 菜單列表（樹形結構） |
| GET | `/api/v1/admin/menus/:id` | 菜單詳情 |
| POST | `/api/v1/admin/menus` | 新增菜單 |
| PUT | `/api/v1/admin/menus/:id` | 修改菜單 |
| DELETE | `/api/v1/admin/menus/:id` | 刪除菜單 |
| GET | `/api/v1/admin/menus/:id/actions` | 菜單操作列表 |
| POST | `/api/v1/admin/menus/:id/actions` | 新增菜單操作 |
| PUT | `/api/v1/admin/menus/:id/actions/:actionId` | 修改菜單操作 |
| DELETE | `/api/v1/admin/menus/:id/actions/:actionId` | 刪除菜單操作 |

**新增/修改菜單請求體:**

```json
{
  "parent_id": 0,
  "name": "內容管理",
  "url": "/admin/content",
  "icon": "fa-file-text",
  "sorting": 100,
  "status": 1
}
```

### 4.17 系統日誌

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/syslogs` | 系統日誌列表（分頁、時間範圍篩選） |
| GET | `/api/v1/admin/syslogs/:id` | 日誌詳情 |
| DELETE | `/api/v1/admin/syslogs` | 清除全部日誌 |
| DELETE | `/api/v1/admin/syslogs/before` | 清除指定時間之前的日誌（?before=時間戳） |

**系統日誌列表 Query 參數:**

| 參數 | 類型 | 說明 |
|------|------|------|
| `page` | `number` | 頁碼 |
| `pagesize` | `number` | 每頁條數 |
| `start` | `number` | 起始時間戳 |
| `end` | `number` | 結束時間戳 |
| `keyword` | `string` | 關鍵詞搜索（用戶名、操作描述） |
| `user_id` | `number` | 按操作者篩選 |

**日誌記錄 `data` 結構:**

```json
{
  "id": 1,
  "user_id": 1,
  "username": "admin",
  "event": "內容發布",
  "description": "發布文章:公司獲得行業大獎",
  "ip": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "create_time": 1700000000
}
```

> **注意:** 僅記錄關鍵操作（登錄、內容發布/刪除、配置修改）,普通瀏覽操作不記錄,以減少 D1 寫入壓力。

### 4.18 301 重定向

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/admin/redirects` | 重定向規則列表 |
| GET | `/api/v1/admin/redirects/:id` | 重定向規則詳情 |
| POST | `/api/v1/admin/redirects` | 新增重定向規則 |
| PUT | `/api/v1/admin/redirects/:id` | 修改重定向規則 |
| DELETE | `/api/v1/admin/redirects/:id` | 刪除重定向規則 |

**新增/修改重定向規則請求體:**

```json
{
  "source": "/old-page",
  "target": "/new-page",
  "type": 301,
  "status": 1
}
```

---

## 五、靜態生成專用接口

靜態生成專用接口是本項目的核心設計。靜態生成層（部署在香港伺服器）通過這些接口拉取全站數據,生成靜態 HTML 文件。這些接口為公開接口,但可通過額外的 API Key 或 IP 白名單加強安全。

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/api/v1/ssg/export-all` | 全量導出（欄目樹 + 文章基礎信息 + 單頁） |
| GET | `/api/v1/ssg/incremental` | 增量更新（?since=時間戳） |
| GET | `/api/v1/ssg/contents/batch` | 文章分批拉取（?page=&pagesize=&scode=） |
| GET | `/api/v1/ssg/contents/:id/full` | 文章完整詳情（含欄目信息 + 上下篇） |
| GET | `/api/v1/ssg/config` | 全站配置一次性返回 |
| GET | `/api/v1/ssg/sitemap` | 生成 sitemap 數據 |

### 接口詳情

#### GET /api/v1/ssg/export-all

全量導出全站數據,用於首次靜態生成或全量重建。返回欄目樹、所有文章基礎信息（不含正文）、所有單頁內容。

**Query 參數:**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `include_content` | `number` | 否 | 是否包含文章正文:0=不包含（默認）,1=包含。設為 1 時響應體較大 |

**響應 `data` 結構:**

```json
{
  "site": {
    "id": 1,
    "title": "示例站點",
    "domain": "https://example.com",
    "logo": "/upload/logo.png"
  },
  "company": {
    "name": "示例公司",
    "address": "深圳市XX區",
    "phone": "0755-12345678"
  },
  "sorts": [
    {
      "id": 1,
      "scode": "1001",
      "pcode": "0",
      "name": "公司新聞",
      "filename": "news",
      "urlname": "company-news",
      "mcode": "1",
      "status": 1,
      "sorting": 100,
      "children": []
    }
  ],
  "singles": [
    {
      "id": 1,
      "scode": "2001",
      "title": "關於我們",
      "content": "<p>關於我們的內容</p>",
      "status": 1
    }
  ],
  "contents": [
    {
      "id": 101,
      "scode": "1001",
      "title": "文章標題",
      "date": 1700000000,
      "istop": 1,
      "isrecommend": 0,
      "ico": "/upload/ico/101.jpg",
      "description": "文章摘要"
    }
  ],
  "nav": [
    {
      "scode": "1001",
      "name": "公司新聞",
      "urlname": "company-news",
      "children": []
    }
  ],
  "slides": [],
  "links": [],
  "labels": [],
  "export_time": 1700000000
}
```

#### GET /api/v1/ssg/incremental

增量更新接口。傳入時間戳,返回該時間之後有變更的所有數據（新增、修改、刪除）。

**Query 參數:**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `since` | `number` | 是 | Unix 時間戳（秒）。返回此時間之後變更的數據 |

**響應 `data` 結構:**

```json
{
  "since": 1699900000,
  "until": 1700000000,
  "contents": {
    "updated": [
      {
        "id": 101,
        "scode": "1001",
        "title": "修改後的標題",
        "date": 1700000000,
        "status": 1
      }
    ],
    "deleted": [102, 103]
  },
  "singles": {
    "updated": [
      {
        "id": 1,
        "scode": "2001",
        "title": "更新後的關於我們",
        "content": "<p>更新內容</p>"
      }
    ],
    "deleted": []
  },
  "sorts": {
    "updated": [
      {
        "id": 2,
        "scode": "1002",
        "name": "修改後的欄目名"
      }
    ],
    "deleted": []
  },
  "config_changed": true,
  "site_changed": false,
  "company_changed": false,
  "slides_changed": false,
  "links_changed": false
}
```

**增量更新字段說明:**

| 字段 | 說明 |
|------|------|
| `updated` | 新增或修改的記錄數組 |
| `deleted` | 被刪除的記錄 ID 數組 |
| `*_changed` | 對應配置項是否有變更,為 `true` 時需重新拉取對應配置 |

#### GET /api/v1/ssg/contents/batch

文章分批拉取接口。用於大數據量場景下分頁拉取文章列表,支持按欄目篩選。

**Query 參數:**

| 參數 | 類型 | 必填 | 默認值 | 說明 |
|------|------|------|--------|------|
| `page` | `number` | 否 | `1` | 頁碼 |
| `pagesize` | `number` | 否 | `50` | 每頁條數（SSG 場景默認較大） |
| `scode` | `string` | 否 | - | 欄目編碼篩選 |
| `include_content` | `number` | 否 | `1` | 是否包含正文:1=包含（默認）,0=不包含 |
| `order` | `string` | 否 | `date:desc` | 排序 |

**響應 `data` (數組) + `meta`:**

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": 101,
      "scode": "1001",
      "sort_name": "公司新聞",
      "title": "文章標題",
      "subtitle": "副標題",
      "date": 1700000000,
      "istop": 1,
      "isrecommend": 0,
      "isheadline": 0,
      "ico": "/upload/ico/101.jpg",
      "pics": "/upload/pics/101-1.jpg",
      "description": "文章摘要",
      "content": "<p>正文HTML</p>",
      "tags": "標籤1,標籤2",
      "author": "管理員",
      "source": "本站原創",
      "urlname": "company-news",
      "filename": "news"
    }
  ],
  "meta": {
    "page": 1,
    "pagesize": 50,
    "total": 500
  }
}
```

#### GET /api/v1/ssg/contents/:id/full

文章完整詳情接口。相比前台公開接口,此接口一次性返回生成靜態頁面所需的全部關聯數據,包括欄目信息、上下篇文章、相關文章、擴展字段等,減少請求次數。

**路徑參數:**

| 參數 | 說明 |
|------|------|
| `id` | 內容 ID |

**響應 `data` 結構:**

```json
{
  "content": {
    "id": 101,
    "scode": "1001",
    "title": "文章標題",
    "subtitle": "副標題",
    "date": 1700000000,
    "istop": 1,
    "isrecommend": 0,
    "isheadline": 0,
    "ico": "/upload/ico/101.jpg",
    "pics": "/upload/pics/101-1.jpg,/upload/pics/101-2.jpg",
    "description": "文章摘要",
    "content": "<p>完整正文HTML</p>",
    "tags": "標籤1,標籤2",
    "author": "管理員",
    "source": "本站原創",
    "hits": 1280,
    "ext_xxx": "擴展字段值"
  },
  "sort": {
    "scode": "1001",
    "name": "公司新聞",
    "filename": "news",
    "urlname": "company-news",
    "title": "欄目SEO標題",
    "keywords": "欄目關鍵詞",
    "description": "欄目描述"
  },
  "prev": {
    "id": 100,
    "title": "上一篇標題",
    "date": 1699900000
  },
  "next": {
    "id": 102,
    "title": "下一篇標題",
    "date": 1700100000
  },
  "related": [
    {
      "id": 105,
      "title": "相關文章標題",
      "date": 1700050000,
      "ico": "/upload/ico/105.jpg"
    }
  ],
  "images": [
    { "url": "/upload/pics/101-1.jpg", "title": "圖片1" },
    { "url": "/upload/pics/101-2.jpg", "title": "圖片2" }
  ],
  "tags_data": [
    { "name": "標籤1", "link": "/tags/標籤1" },
    { "name": "標籤2", "link": "/tags/標籤2" }
  ]
}
```

#### GET /api/v1/ssg/config

全站配置一次性返回。將站點信息、公司信息、系統配置、導航樹、幻燈片、友情連結、標籤、自定義標籤等全局數據合併在一個響應中返回,供靜態生成層一次性獲取所有模板全局變量。

**Query 參數:** 無

**響應 `data` 結構:**

```json
{
  "site": {
    "title": "示例站點",
    "subtitle": "歡迎訪問",
    "domain": "https://example.com",
    "logo": "/upload/logo.png",
    "keywords": "關鍵詞",
    "description": "站點描述",
    "icp": "粵ICP備XXXXXXXX號"
  },
  "company": {
    "name": "示例公司",
    "address": "深圳市XX區",
    "phone": "0755-12345678",
    "mobile": "13800138000",
    "email": "contact@example.com",
    "qq": "12345678",
    "wechat": "wechat_id",
    "latitude": "22.5431",
    "longitude": "114.0579"
  },
  "config": {
    "home_cache": "1",
    "content_cache": "1",
    "api_cache_time": "3600"
  },
  "nav": [
    {
      "scode": "1001",
      "name": "公司新聞",
      "urlname": "company-news",
      "filename": "news",
      "children": []
    }
  ],
  "slides": [
    {
      "id": 1,
      "gid": 1,
      "name": "首頁Banner",
      "pic": "/upload/slide/1.jpg",
      "link": "/about"
    }
  ],
  "links": [
    {
      "id": 1,
      "gid": 1,
      "name": "友情站點",
      "link": "https://friend.com"
    }
  ],
  "tags": [
    { "name": "標籤1", "link": "/tags/標籤1" }
  ],
  "labels": {
    "聯繫電話": "0755-12345678",
    "公司地址": "深圳市XX區"
  }
}
```

#### GET /api/v1/ssg/sitemap

生成 sitemap 數據,用於搜索引擎收錄。返回所有需要收錄的 URL 列表。

**Query 參數:**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `type` | `string` | 否 | 返回格式:`json`（默認）或 `xml` |

**響應 `data` (type=json 時):**

```json
{
  "urls": [
    {
      "loc": "https://example.com/",
      "lastmod": "2024-01-01",
      "changefreq": "daily",
      "priority": "1.0"
    },
    {
      "loc": "https://example.com/news/",
      "lastmod": "2024-01-01",
      "changefreq": "daily",
      "priority": "0.9"
    },
    {
      "loc": "https://example.com/news/101.html",
      "lastmod": "2024-01-01",
      "changefreq": "weekly",
      "priority": "0.8"
    },
    {
      "loc": "https://example.com/about.html",
      "lastmod": "2024-01-01",
      "changefreq": "monthly",
      "priority": "0.7"
    }
  ],
  "total": 500
}
```

**type=xml 時直接返回 XML 格式:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01-01</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

---

## 六、請求/響應示例

### 6.1 管理員登錄

**請求:**

```http
POST /api/v1/auth/login HTTP/1.1
Content-Type: application/json

{
  "username": "admin",
  "password": "123456"
}
```

**成功響應:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 0,
  "msg": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGVfaWQiOjEsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDg2NDAwfQ.signature",
    "expires_in": 86400,
    "user": {
      "id": 1,
      "username": "admin",
      "realname": "管理員",
      "role_id": 1,
      "role_name": "超級管理員"
    }
  }
}
```

**失敗響應（密碼錯誤）:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 2001,
  "msg": "用戶名或密碼錯誤",
  "data": null
}
```

### 6.2 獲取內容列表（分頁）

**請求:**

```http
GET /api/v1/contents?scode=1001&page=1&pagesize=10&order=date:desc HTTP/1.1
```

**響應:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": 105,
      "scode": "1001",
      "sort_name": "公司新聞",
      "title": "公司召開年度總結大會",
      "subtitle": "",
      "istop": 1,
      "isrecommend": 1,
      "isheadline": 0,
      "date": 1700000000,
      "sorting": 100,
      "hits": 560,
      "ico": "/upload/ico/105.jpg",
      "pics": "",
      "description": "2024年1月,公司召開年度總結大會...",
      "urlname": "company-news",
      "filename": "news"
    },
    {
      "id": 104,
      "scode": "1001",
      "sort_name": "公司新聞",
      "title": "公司獲得行業創新獎",
      "subtitle": "年度最佳創新企業",
      "istop": 0,
      "isrecommend": 1,
      "isheadline": 0,
      "date": 1699900000,
      "sorting": 99,
      "hits": 820,
      "ico": "/upload/ico/104.jpg",
      "pics": "",
      "description": "公司於近日獲得行業創新獎...",
      "urlname": "company-news",
      "filename": "news"
    }
  ],
  "meta": {
    "page": 1,
    "pagesize": 10,
    "total": 58
  }
}
```

### 6.3 新增內容（需認證）

**請求:**

```http
POST /api/v1/admin/contents HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "scode": "1001",
  "title": "公司發布新產品",
  "subtitle": "革命性創新產品",
  "istop": 1,
  "isrecommend": 1,
  "isheadline": 0,
  "date": 1700000000,
  "sorting": 100,
  "ico": "/upload/ico/106.jpg",
  "pics": "/upload/pics/106-1.jpg,/upload/pics/106-2.jpg",
  "description": "公司今日正式發布新一代產品...",
  "content": "<p>產品發布會現場...</p>",
  "tags": "新產品,發布會",
  "author": "admin",
  "source": "本站原創",
  "status": 1,
  "ext_fields": {
    "ext_product_name": "智能雲端系統",
    "ext_price": "9999"
  }
}
```

**成功響應:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 0,
  "msg": "success",
  "data": {
    "id": 106
  }
}
```

**未授權響應:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 1002,
  "msg": "未授權,請先登錄",
  "data": null
}
```

### 6.4 文件上傳（需認證）

**請求:**

```http
POST /api/v1/admin/upload HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="type"

image
------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="banner.jpg"
Content-Type: image/jpeg

(二進制數據)
------WebKitFormBoundary--
```

**成功響應:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 0,
  "msg": "success",
  "data": {
    "id": 501,
    "url": "/upload/image/20240101/abc123def456.jpg",
    "filename": "abc123def456.jpg",
    "original": "banner.jpg",
    "size": 204800,
    "mime": "image/jpeg",
    "type": "image",
    "width": 1920,
    "height": 600
  }
}
```

### 6.5 靜態生成全量導出

**請求:**

```http
GET /api/v1/ssg/export-all HTTP/1.1
```

**響應（截取關鍵部分）:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 0,
  "msg": "success",
  "data": {
    "site": {
      "title": "示例站點",
      "domain": "https://example.com",
      "logo": "/upload/logo.png"
    },
    "company": {
      "name": "示例公司",
      "phone": "0755-12345678"
    },
    "sorts": [
      {
        "scode": "1001",
        "pcode": "0",
        "name": "公司新聞",
        "filename": "news",
        "urlname": "company-news",
        "children": [
          {
            "scode": "1002",
            "pcode": "1001",
            "name": "行業動態",
            "filename": "industry",
            "urlname": "industry-news",
            "children": []
          }
        ]
      }
    ],
    "singles": [
      {
        "scode": "2001",
        "title": "關於我們",
        "content": "<p>公司成立於2010年...</p>"
      }
    ],
    "contents": [
      {
        "id": 101,
        "scode": "1001",
        "title": "公司獲得行業大獎",
        "date": 1700000000,
        "istop": 1,
        "ico": "/upload/ico/101.jpg",
        "description": "公司於近日獲得行業大獎..."
      }
    ],
    "nav": [
      {
        "scode": "1001",
        "name": "公司新聞",
        "urlname": "company-news",
        "children": []
      }
    ],
    "export_time": 1700000000
  }
}
```

### 6.6 增量更新

**請求:**

```http
GET /api/v1/ssg/incremental?since=1699900000 HTTP/1.1
```

**響應:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 0,
  "msg": "success",
  "data": {
    "since": 1699900000,
    "until": 1700000000,
    "contents": {
      "updated": [
        {
          "id": 105,
          "scode": "1001",
          "title": "修改後的標題",
          "date": 1700000000,
          "status": 1
        }
      ],
      "deleted": [102, 103]
    },
    "singles": {
      "updated": [],
      "deleted": []
    },
    "sorts": {
      "updated": [],
      "deleted": []
    },
    "config_changed": false,
    "site_changed": true,
    "company_changed": false,
    "slides_changed": false,
    "links_changed": false
  }
}
```

### 6.7 提交留言

**請求:**

```http
POST /api/v1/messages HTTP/1.1
Content-Type: application/json

{
  "name": "張三",
  "mobile": "13800138000",
  "email": "zhangsan@example.com",
  "content": "我想諮詢產品價格",
  "scode": "1005"
}
```

**成功響應:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 0,
  "msg": "留言提交成功",
  "data": {
    "id": 501
  }
}
```

**限頻響應:**

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{
  "code": 1005,
  "msg": "請求過於頻繁,請稍後再試",
  "data": null
}
```

---

## 七、錯誤碼定義

所有接口通過 `code` 字段返回業務狀態碼。`0` 表示成功,非 `0` 表示具體錯誤類型。

### 通用錯誤碼

| 錯誤碼 | HTTP 狀態碼 | 說明 | 處理建議 |
|--------|-----------|------|---------|
| `0` | 200 | 成功 | - |
| `1001` | 200 | 參數錯誤 | 檢查請求參數是否完整、類型是否正確 |
| `1002` | 200 | 未授權 | 未登錄或 Token 缺失,需重新登錄 |
| `1003` | 200 | 權限不足 | 當前用戶角色無權操作此資源 |
| `1004` | 200 | 資源不存在 | 請求的資源 ID 不存在或已被刪除 |
| `1005` | 200 | 操作失敗 | 業務邏輯執行失敗,參考 `msg` 字段 |

### 認證錯誤碼

| 錯誤碼 | HTTP 狀態碼 | 說明 | 處理建議 |
|--------|-----------|------|---------|
| `2001` | 200 | 登錄失敗 | 用戶名或密碼錯誤 |
| `2002` | 200 | Token 過期 | Access Token 已過期,需刷新或重新登錄 |
| `2003` | 200 | 賬號被鎖定 | 管理員賬號已被禁用,需聯繫超級管理員 |

### 錯誤碼使用規則

1. **業務錯誤統一返回 HTTP 200**:所有業務邏輯錯誤（參數錯誤、權限不足等）均返回 HTTP 200,通過 `code` 字段區分錯誤類型。這與 pbootcms-go 的設計保持一致,簡化前端處理邏輯。

2. **HTTP 狀態碼僅用於基礎錯誤**:
   - `200 OK`:正常請求（含業務成功和業務失敗）
   - `429 Too Many Requests`:觸發限頻
   - `500 Internal Server Error`:服務端異常

3. **前端統一處理邏輯**:

```javascript
// 前端響應攔截器偽代碼
async function request(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();

  if (result.code === 0) {
    // 成功,返回 data
    return result.data;
  }

  switch (result.code) {
    case 1002:
      // 未授權,跳轉登錄頁
      router.push('/login');
      break;
    case 2002:
      // Token 過期,嘗試刷新
      await refreshToken();
      return request(url, options); // 重試
    case 2003:
      // 賬號被鎖定
      alert('賬號已被鎖定,請聯繫管理員');
      break;
    default:
      // 其他錯誤,顯示錯誤信息
      alert(result.msg);
  }

  throw new Error(result.msg);
}
```

4. **錯誤信息國際化**:當前 `msg` 字段返回繁體中文描述。未來如需多語言支持,可在請求頭添加 `Accept-Language`,服務端返回對應語言的錯誤信息。

---

## 附錄:接口與數據表對照

| 接口資源 | 對應數據表 | 說明 |
|---------|-----------|------|
| auth | `ay_user` | 管理員認證 |
| site | `ay_site` | 站點信息 |
| company | `ay_company` | 公司信息 |
| sorts | `ay_content_sort` + `ay_model` | 欄目分類 |
| contents | `ay_content` + `ay_content_ext` + `ay_extfield` | 內容管理 |
| singles | `ay_single` | 單頁管理 |
| slides | `ay_slide` | 幻燈片 |
| links | `ay_link` | 友情連結 |
| tags | `ay_tags` | 標籤/內鏈 |
| labels | `ay_label` | 自定義標籤 |
| messages | `ay_message` | 留言管理 |
| forms | `ay_form` + `ay_form_field` | 自定義表單 |
| attachments | R2 + `ay_ctype`(附件記錄) | 附件管理 |
| users | `ay_user` | 管理員管理 |
| roles | `ay_role` + `ay_role_level` | 角色管理 |
| menus | `ay_menu` + `ay_menu_action` | 菜單管理 |
| syslogs | `ay_syslog` | 系統日誌 |
| redirects | `ay_301_redirect` | 301 重定向 |
| config | `ay_config` | 系統配置 |
