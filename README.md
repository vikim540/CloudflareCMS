# CloudflareCMS

> 基於 PbootCMS 3.2.12 數據庫結構的 Cloudflare Workers 無頭 CMS（Headless CMS），前後端完全分離，支援多站點架構。

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![D1 Database](https://img.shields.io/badge/D1-Database-0051C3?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)

---

## 項目簡介

CloudflareCMS 是一個前後端完全分離的無頭 CMS，後端部署在 Cloudflare Workers 上，管理後台部署在 Cloudflare Pages 上。項目基於 PbootCMS 3.2.12 的數據庫結構，支援多站點架構、語義搜索、定時發布等高級功能。

### 設計目標

- **多站點架構** — 單 Worker 實例支持多個站點，通過 `X-Site-Id` 路由到獨立 D1 數據庫
- **全球邊緣部署** — Cloudflare 300+ 邊緣節點 + Smart Placement 自動靠近數據庫
- **零運維** — 無服務器管理、無安全補丁、無語言版本升級
- **安全優先** — Turnstile 人機驗證、Secrets Store 密鑰管理、CSP 安全頭、HTML 淨化、MIME 白名單
- **SEO 友好** — 語義搜索（Vectorize）、文章內鏈自動替換、FAQ 結構化數據（JSON-LD + microdata）

---

## 技術架構

| 層級 | 技術 | 說明 |
|------|------|------|
| **後端 API** | Cloudflare Workers + TypeScript + Hono | 純 JSON API，不渲染 HTML |
| **管理後台** | React 18 + Vite + Tailwind CSS | 部署在 Cloudflare Pages |
| **數據庫** | Cloudflare D1 (SQLite) | 多站點獨立數據庫，binding API 訪問 |
| **邊緣緩存** | Cloudflare Workers Cache + KV | 聲明式邊緣緩存 + KV 配置/Token 管理 |
| **文件存儲** | Cloudflare R2 / S3 兼容 | AWS SigV4 簽名，媒體庫文件存儲 |
| **語義搜索** | Cloudflare Vectorize + Workers AI | 768 維向量索引，多語言嵌入模型 |
| **功能開關** | Cloudflare Flagship | 真混合模式（Flagship 優先，D1 回退） |
| **密鑰管理** | Cloudflare Secrets Store | 帳號級別，異步訪問，跨 Worker 共享 |
| **API 代理** | Pages Functions Service Binding | 同域代理，零延遲內部通信 |

### 架構圖

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                      │
│                                                         │
│  ┌──────────────┐    Service Binding    ┌────────────┐ │
│  │  cms-admin   │◄─────────────────────►│cfstack-cms │ │
│  │  (Pages SPA) │                       │ (Workers)  │ │
│  │  React + Vite│    ┌──────────────┐   │  Hono API  │ │
│  └──────────────┘    │Pages Functions│   └─────┬──────┘ │
│                      │  /api/* 代理  │         │        │
│                      └──────────────┘         │        │
│                                               │        │
│         ┌─────────────┬──────────────┬────────┴───┐    │
│         │  D1 (多站點) │  KV (緩存)   │  R2/S3     │    │
│         │  SQLite DB  │  Config/Token│  Storage   │    │
│         └─────────────┴──────────────┴────────────┘    │
│                                                         │
│         ┌─────────────┬──────────────┬────────────┐    │
│         │  Vectorize  │  Workers AI  │  Flagship  │    │
│         │  語義搜索   │  嵌入模型    │  功能開關  │    │
│         └─────────────┴──────────────┴────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 功能特性

### 內容管理
- 富文本編輯器（Quill 2.0，CDN 加載，自定義插件：FAQ / 視頻 / 列表 / HTML 清理）
- 多級欄目管理（遞歸 CTE 查詢子孫欄目）
- 模型管理 + 自定義擴展字段（11 種類型）
- 內容列表（置頂/推薦/頭條標記、排序、訪問量、批量操作）
- 回收站（軟刪除恢復）
- 定時發布（Queues + Cron 每 15 分鐘掃描）
- 文章內鏈自動替換（五步預佔位策略，參考 PbootCMS Go 版）
- FAQ 結構化數據（Google microdata + JSON-LD 雙重 SEO）

### 多站點架構
- 單 Worker 實例支持多個站點，每個站點獨立 D1 數據庫
- 通過 `X-Site-Id` header 路由到對應數據庫 binding
- 動態站點創建（Cloudflare D1 REST API 自動建庫 + 建表）
- 用戶站點權限分配（非超管用戶只能訪問已分配站點）
- 邊緣緩存通過 `Vary: X-Site-Id` 實現多站點分區

### 媒體庫
- 圖片/文檔/視頻分類管理
- 文件鎖定/標記保護
- 冗餘文件清理（引用追踪 + 安全刪除）
- R2/S3 兼容存儲（AWS SigV4 簽名）
- 圖片壓縮（JPG/PNG → WebP，三層組件架構：引擎 → Hook → UI）

### 系統管理
- 用戶管理 + 角色權限（RBAC，JWT 實時刷新無需重新登錄）
- 雙 MD5 密碼（兼容 PbootCMS）
- 操作日誌（用戶行為分類，非原始 HTTP 請求）
- 數據庫備份/恢復
- 系統配置（獨立卡片分組 + 獨立保存按鈕）
- 統一表單提交系統（隨機路徑 + Turnstile + 蜜罐 + 速率限制 + 釘釘通知）

### 安全加固
- Cloudflare Turnstile 人機驗證
- 安全 HTTP 響應頭（CSP / HSTS / X-Frame-Options 等 6 個頭）
- HTML 淨化防 XSS（sanitizeHtml / stripHtmlTags）
- 輸入長度校驗 + 2MB 請求體限制
- 文件上傳 MIME 白名單
- Secrets Store 密鑰管理（JWT_SECRET / API Token / S3 憑證 / Turnstile 密鑰）
- 全局錯誤追蹤（React ErrorBoundary + API 攔截 + 全局 Toast）

---

## 快速開始

### 環境要求

- Node.js >= 18
- pnpm（包管理）
- wrangler CLI（使用 `npx wrangler` 調用，⚠️ 全局安裝可能版本過時）

### 1. 克隆倉庫

```bash
git clone https://github.com/vikim540/CloudflareCMS.git
cd CloudflareCMS
```

### 2. 後端部署（Cloudflare Workers）

```bash
# 安裝依賴
pnpm install

# 創建 D1 數據庫
npx wrangler d1 create your-cms-db
# 將返回的 database_id 填入 wrangler.jsonc

# 執行數據庫遷移
npx wrangler d1 migrations apply your-cms-db --remote

# 創建 KV 命名空間
npx wrangler kv namespace create CONFIG_CACHE
npx wrangler kv namespace create TOKEN_BLACKLIST
# 將返回的 id 填入 wrangler.jsonc

# 配置 Secrets Store（存儲 JWT_SECRET 等）
npx wrangler secrets-store secret create <store-id> --name JWT_SECRET --value "your-secret" --scopes workers --remote

# 本地開發（端口 8787）
npx wrangler dev

# 部署到 Workers
npx wrangler deploy
```

### 3. 管理後台部署（Cloudflare Pages）

```bash
cd admin

# 安裝依賴
pnpm install

# 本地開發（端口 3000，代理 /api → 127.0.0.1:8787）
npx vite dev

# 構建（輸出到 deploy 目錄，非 build！）
npx vite build

# 部署到 Pages
npx wrangler pages deploy deploy --project-name=cms-admin
```

> **注意**：Pages 部署必須從 `admin/` 目錄執行，否則 `functions/` 目錄不會被上傳。

---

## 項目結構

```
CloudflareCMS/
├── src/                        # 後端 Worker（TypeScript + Hono）
│   ├── index.ts                # 路由薄層 + 中間件註冊
│   ├── services/               # 業務厚層（16 個服務模塊）
│   └── utils/                  # 純函數（9 個工具模塊）
├── admin/                      # 前端 SPA（React 18 + Vite + Tailwind）
│   ├── functions/api/v1/[[path]].ts  # Pages Functions Service Binding 代理
│   ├── src/
│   │   ├── components/         # 14 個通用組件
│   │   ├── contexts/           # SiteContext（站點切換）
│   │   ├── hooks/              # 3 個自定義 Hook
│   │   ├── lib/                # API 客戶端 + 圖片壓縮 + Quill 插件
│   │   └── pages/              # 26 個頁面組件
│   ├── vite.config.ts          # 輸出目錄 deploy（fixEmptyChunksPlugin）
│   └── wrangler.jsonc          # Pages 配置 + Service Binding
├── migrations/                 # D1 遷移（冪等語法，0001-0006）
└── wrangler.jsonc              # Worker 配置（bindings + cron + cache + placement）
```

> 完整目錄結構及開發約束請參考 [`AGENTS.md`](AGENTS.md)。

---

## API 規範

### 統一響應格式

```json
{
  "code": 0,
  "msg": "成功",
  "data": {},
  "meta": { "page": 1, "pagesize": 20, "total": 100 }
}
```

### 路由前綴

| 類型 | 前綴 | 鑑權 | 速率限制 |
|------|------|------|----------|
| 公開接口 | `/api/v1/{resource}` | 無 | 60 req/min |
| 管理接口 | `/api/v1/admin/{resource}` | JWT + 菜單權限 | 300 req/min |
| 表單提交 | `/api/v1/f/:token` | 隨機 token + Turnstile | 1 req/10s |
| 語義搜索 | `/api/v1/search` | 無 | 60 req/min |

詳細 API 文檔請參考管理後台 Dashboard 的「API 開發手冊」Tab。

---

## 參考項目

- **PbootCMS 3.2.12** (PHP 原版) — 數據庫結構來源
- **pbootcms-go** (Go 版) — 業務邏輯參考
- **AnqiCMS v3.6.2** — 功能設計參考

---

## License

MIT License
