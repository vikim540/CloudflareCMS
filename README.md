# 🚀 RustCMS

> 基於 PbootCMS 3.2.12 數據庫結構的 Cloudflare Workers 純 API 後端 CMS，專為廣告站、Google SEO 場景設計。

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![D1 Database](https://img.shields.io/badge/D1-Database-0051C3?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 📋 項目簡介

RustCMS 是一個前後端完全分離的無頭 CMS（Headless CMS），後端部署在 Cloudflare Workers 上，管理後台部署在 Cloudflare Pages 上。項目基於 PbootCMS 3.2.12 的數據庫結構，實現了零改動遷移，任何 PbootCMS 用戶都可以無縫切換。

### 🎯 設計目標

- **零數據庫改動** — 完全兼容 PbootCMS 3.2.12 原版表結構
- **全球邊緣部署** — 藉助 Cloudflare 300+ 邊緣節點，超低延遲
- **零運維** — 無服務器管理、無安全補丁、無語言版本升級
- **免費額度充足** — 每天 100,000 請求，足夠廣告站使用
- **SEO 友好** — 配合獨立靜態生成層輸出全靜態頁面

---

## 🏗️ 技術架構

| 層級 | 技術 | 說明 |
|------|------|------|
| **後端 API** | Cloudflare Workers + TypeScript + Hono | 純 JSON API，不渲染 HTML |
| **管理後台** | React 18 + Vite + Tailwind CSS | 部署在 Cloudflare Pages |
| **數據庫** | Cloudflare D1 (SQLite) | 通過 binding API 訪問 |
| **緩存** | Cloudflare KV | 配置緩存、Token 黑名單 |
| **文件存儲** | Cloudflare R2 / S3 兼容 | 媒體庫文件存儲 |
| **API 代理** | Pages Functions | 同域代理，避免跨域和 DNS 污染 |

### 架構圖

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                      │
│                                                         │
│  ┌──────────────┐    Service Binding    ┌────────────┐ │
│  │  cms-admin   │◄─────────────────────►│  rust-cms  │ │
│  │  (Pages SPA) │                       │ (Workers)  │ │
│  │  React + Vite│    ┌──────────────┐   │  Hono API  │ │
│  └──────────────┘    │Pages Functions│   └─────┬──────┘ │
│                      │  /api/* 代理  │         │        │
│                      └──────────────┘         │        │
│                                               ▼        │
│                    ┌─────────┬─────────┬──────────┐    │
│                    │   D1    │   KV    │   R2     │    │
│                    │SQLite DB│ Cache   │ Storage  │    │
│                    └─────────┴─────────┴──────────┘    │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   靜態生成層 (SSG)    │
              │  獨立服務，消費 API   │
              │  輸出全靜態 HTML 頁面 │
              └─────────────────────┘
```

---

## ✨ 功能特性

### 內容管理
- 📝 富文本編輯器（Quill 2.0，CDN 加載）
- 📂 多級欄目管理（遞歸 CTE 查詢子孫欄目）
- 🏷️ 模型管理 + 自定義擴展字段（10 種類型）
- 📊 內容列表（置頂/推薦/頭條標記、排序、訪問量、批量操作）
- 🗑️ 回收站（軟刪除恢復）
- ⏰ 定時發布（日期過濾）
- 🔗 外鏈、縮略圖、多圖、標籤、作者、來源

### 媒體庫
- 📸 圖片/文檔/視頻分類管理
- 🔒 文件鎖定/標記保護（`ay_media_mark` 表）
- 🧹 冗餘文件清理（引用追踪 + 安全刪除）
- 📦 R2/S3 兼容存儲（AWS SigV4 簽名）
- 🔍 使用狀態追踪（綠色已使用/灰色未使用/琥珀色已標記）

### 系統管理
- 👥 用戶管理 + 角色權限（JWT 鑑權）
- 🔐 雙 MD5 密碼（兼容 PbootCMS）
- 📜 操作日誌
- 🗄️ 數據庫備份/恢復
- ⚙️ 系統配置（KV 緩存加速）
- 🔗 友情連結、幻燈片、標籤、自定義標籤
- 💬 留言管理

---

## 🚀 快速開始

### 環境要求

- Node.js >= 18
- pnpm（前端包管理）
- wrangler CLI（`npm install -g wrangler`）

### 1. 克隆倉庫

```bash
git clone https://github.com/vikim540/RustCMS.git
cd RustCMS
```

### 2. 後端部署（Cloudflare Workers）

```bash
# 安裝依賴
pnpm install

# 創建 D1 數據庫
wrangler d1 create rust-cms-db
# 將返回的 database_id 填入 wrangler.jsonc

# 執行數據庫遷移
wrangler d1 execute rust-cms-db --file=migrations/0001_init.sql

# 創建 KV 命名空間
wrangler kv namespace create CONFIG_CACHE
wrangler kv namespace create TOKEN_BLACKLIST
# 將返回的 id 填入 wrangler.jsonc

# 設置 JWT 密鑰
echo "JWT_SECRET=your-secret-key-here" > .dev.vars

# 部署到 Workers
npx wrangler deploy
```

### 3. 管理後台部署（Cloudflare Pages）

```bash
cd admin

# 安裝依賴
pnpm install

# 本地開發
pnpm dev

# 構建
pnpm build

# 部署到 Pages
pnpm deploy
```

### 4. 初始管理員

默認管理員賬號：
- 用戶名：`admin`
- 密碼：`123456`
- **⚠️ 請登錄後立即修改密碼**

---

## 📁 項目結構

```
RustCMS/
├── src/                    # 後端 Workers API
│   ├── index.ts            # 入口 + 路由定義
│   ├── services/           # 業務邏輯層
│   │   ├── auth.ts         # 認證服務
│   │   ├── config.ts       # 配置服務
│   │   ├── content.ts      # 內容服務
│   │   ├── extra.ts        # 擴展字段服務
│   │   ├── model.ts        # 模型服務
│   │   ├── sort.ts         # 欄目服務
│   │   ├── storage.ts      # 媒體庫服務
│   │   └── system.ts       # 系統服務
│   └── utils/              # 工具函數
│       ├── jwt.ts          # JWT 簽發/驗證
│       ├── password.ts     # 雙 MD5 密碼
│       ├── pagination.ts   # 分頁工具
│       ├── response.ts     # 統一響應格式
│       └── s3sig.ts        # AWS SigV4 簽名
├── admin/                  # 管理後台 SPA
│   ├── src/
│   │   ├── pages/          # 頁面組件
│   │   ├── components/     # 通用組件
│   │   └── lib/            # API 客戶端
│   ├── functions/          # Pages Functions（API 代理）
│   └── public/             # 靜態資源
├── migrations/             # D1 數據庫遷移
│   └── 0001_init.sql       # 初始化 SQL
├── docs/                   # 開發文檔
│   ├── 00-需求審視與YAGNI分析.md
│   ├── 01-技術架構設計.md
│   ├── 02-數據庫設計.md
│   ├── 03-API接口設計.md
│   ├── 04-核心模塊設計.md
│   ├── 05-靜態生成層對接.md
│   └── 06-開發計劃.md
├── wrangler.jsonc          # Workers 配置
├── AGENTS.md               # AI 代理約束文件
└── README.md
```

---

## 📡 API 規範

### 統一響應格式

```json
{
  "code": 0,
  "msg": "成功",
  "data": {},
  "meta": {
    "page": 1,
    "pagesize": 20,
    "total": 100
  }
}
```

### 路由前綴

| 類型 | 前綴 | 鑑權 |
|------|------|------|
| 公開接口 | `/api/v1/{resource}` | 無 |
| 管理接口 | `/api/v1/admin/{resource}` | JWT |
| SSG 接口 | `/api/v1/ssg/{action}` | API Key |

詳細 API 文檔請參考 [`docs/03-API接口設計.md`](docs/03-API接口設計.md)。

---

## 🔧 部署信息

| 項目 | 值 |
|------|-----|
| **Workers 項目名** | `rust-cms` |
| **Pages 項目名** | `cms-admin` |
| **自定義域名** | `cms.vikim.eu.org` |
| **D1 數據庫** | `rust-cms-db` |
| **KV: 配置緩存** | `CONFIG_CACHE` |
| **KV: Token 黑名單** | `TOKEN_BLACKLIST` |
| **GitHub 倉庫** | [vikim540/RustCMS](https://github.com/vikim540/RustCMS) |

### 備份命令

```bash
# 備份 D1 數據庫
wrangler d1 execute rust-cms-db --command "SELECT * FROM sqlite_master" --remote

# 導出全部數據
wrangler d1 export rust-cms-db --remote --output=backup-$(date +%Y%m%d).sql
```

---

## 📚 參考項目

- **PbootCMS 3.2.12** (PHP 原版) — 數據庫結構來源
- **pbootcms-go** (Go 版) — 業務邏輯參考
- **AnqiCMS v3.6.2** — 功能設計參考

---

## 📄 開發文檔

完整開發文檔位於 [`docs/`](docs/) 目錄，涵蓋需求分析、架構設計、數據庫設計、API 規範、核心模塊設計、靜態生成對接和開發計劃。

開發約束請參考 [`AGENTS.md`](AGENTS.md)。

---

## 📜 License

MIT License - 請隨意使用和修改。

---

<div align="center">

**⭐ 如果這個項目對你有幫助，請點個 Star！**

Made with ❤️ on Cloudflare Edge

</div>
