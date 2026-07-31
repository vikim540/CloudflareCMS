# DEPLOYMENT-LEGACY.md — 手動部署與運維留底

> **歷史檔案**。本文件記錄 v1.9.48 前的手動部署流程及本地運維命令。
> 自 v1.9.48 起，前後端已通過 Cloudflare Git 集成自動部署，常規更新無需手動操作。
> 此文件僅供緊急回退、本地調試、CI/CD 故障時參考。

---

## 自動部署架構（v1.9.48+，當前生效）

| 服務 | Cloudflare 資源 | Git 集成方式 | 觸發條件 |
|------|----------------|-------------|----------|
| 後端 Worker | `cfstack-cms`（Workers Builds） | 倉庫根目錄 → `pnpm run build` → `wrangler deploy` | push to main |
| 前端 SPA | `cms-admin`（Pages） | 倉庫 `admin/` 子目錄 → `pnpm run build` → 輸出 `deploy/` | push to main |
| GitHub 倉庫 | `https://github.com/vikim540/CloudflareCMS.git` | 單倉庫，前後端各指定子目錄 | — |

### 自動部署配置詳情

**Worker（cfstack-cms）**：
- Root directory: `/`（倉庫根目錄）
- Build command: `pnpm run build`（執行 `tsc --noEmit` 類型檢查）
- Deploy command: `wrangler deploy`（Cloudflare 自動執行）
- 依賴安裝: `pnpm install --frozen-lockfile`

**Pages（cms-admin）**：
- Root directory: `admin`
- Build command: `pnpm run build`（執行 `vite build`）
- Build output directory: `deploy`（由 `admin/wrangler.jsonc` 的 `pages_build_output_dir` 聲明）
- 依賴安裝: `pnpm install`

### 自動部署注意事項

1. **D1 遷移不自動執行**：涉及數據庫結構變更時，必須先手動執行遷移再 push 代碼
2. **Secrets Store 不受影響**：密鑰（JWT_SECRET 等）存儲在帳號級別，部署不影響
3. **部署順序**：Worker 和 Pages 同時觸發，但 Service Binding 是動態解析，Pages 部署時 Worker 可能尚未就緒（首次部署可能短暫 502）

---

## 手動部署流程（v1.9.48 前，已廢棄）

> ⚠️ 以下流程僅供緊急回退或 CI/CD 故障時使用。常規更新請直接 `git push origin main`。

### 完整手動部署（8 步）

```powershell
# 注意：Git 路徑需加入 PATH（D:\AI\Tools\Git\cmd）
$env:PATH = 'D:\AI\Tools\Git\cmd;' + $env:PATH

# ===== 開發 =====
# 後端（Worker，端口 8787）
npx wrangler dev

# 前端（Vite，端口 3000，代理 /api → 127.0.0.1:8787）
cd admin; npx vite dev

# ===== 部署流程（嚴格按順序執行，不可跳步或調換）=====
# 步驟 1: Git commit 代碼改動（拿到 commit 時間戳和 commit message 內容）
#   git add -A; git commit -m '✨ feat: vX.Y.Z 描述...'
# 步驟 2: 用 git log 獲取 commit 真實時間戳（Asia/Hong_Kong）
#   git log --all --pretty=format:'%h|%ci|%s' -n 1
# 步驟 3: 用該時間戳一次性更新 Dashboard.tsx 三個 Tab（版本更新 + API 開發手冊 + 系統信息）
#   → date 字段填入步驟 2 獲取的真實時間戳，禁止用佔位時間再反覆修正
# 步驟 4: git commit --amend --no-edit 將 Dashboard 變更合入原 commit（一次 amend，不再反覆修改）
# 步驟 5: 部署 Worker
npx wrangler deploy
# 步驟 6: 前端構建（輸出到 deploy 目錄，非 build！）
cd admin; npx vite build
# 步驟 7: Pages 部署（從 admin 目錄執行，需含 functions/ 目錄）
cd admin; npx wrangler pages deploy deploy --project-name=cms-admin --commit-dirty=true
# 步驟 8: 推送遠程倉庫
git push origin main
```

### 手動部署注意事項

- **Pages 部署必須從 `admin/` 目錄執行**，否則 `functions/` 目錄不會被上傳
- **Vite 構建輸出到 `deploy/` 目錄**（`vite.config.ts` 中 `outDir: 'deploy'`，配合 `fixEmptyChunksPlugin` 修復 Windows 0 字節 chunk 問題）
- **wrangler 必須使用 `npx wrangler` 調用**（直接 `wrangler` 命中 Yarn 全局 3.1.0，路徑 `D:\Program Files\nodejs\Yarn\bin\wrangler.cmd`，過時不可用）
- **TRAE 沙箱中 pnpm 跨盤符號連結會觸發 EBUSY**，需使用 `pnpm install --store-dir='F:\mysite\AI\idea\Cloudflarerustcms\.pnpm-store'` 同盤安裝

---

## 本地運維命令（仍然有效）

### 數據庫操作

```powershell
# 遷移（主庫 endoscopy-cms）
npx wrangler d1 migrations apply endoscopy-cms --remote

# 遷移（smile 站點）
npx wrangler d1 migrations apply smile-cms --remote

# 遷移（vision 站點）
npx wrangler d1 migrations apply vision-cms --remote

# 執行 SQL（主庫 endoscopy-cms）
npx wrangler d1 execute endoscopy-cms --remote --command "SELECT * FROM ay_config LIMIT 5"

# 本地開發遷移
npx wrangler d1 migrations apply endoscopy-cms --local

# 生成類型（配置變更後必須運行）
npx wrangler types
```

### Git 操作

```powershell
# Git 路徑（需手動加入 PATH）
$env:PATH = 'D:\AI\Tools\Git\cmd;' + $env:PATH

# 查看最近提交（含時間戳）
git log --all --pretty=format:'%h|%ci|%s' -n 5

# 常規提交
git add -A; git commit -m '✨ feat: 描述'; git push origin main
```

### 本地開發

```powershell
# 後端開發服務器（端口 8787）
npx wrangler dev

# 前端開發服務器（端口 3000，代理 /api → 127.0.0.1:8787）
cd admin; npx vite dev

# 前端類型檢查（本地用，構建時已跳過）
cd admin; npx tsc --noEmit

# 後端類型檢查
npx tsc --noEmit
```

---

## 緊急回退流程

若自動部署失敗需要手動回退：

```powershell
# 1. 回退到上一個穩定版本
$env:PATH = 'D:\AI\Tools\Git\cmd;' + $env:PATH
cd 'f:\mysite\AI\idea\Cloudflarerustcms'
git log --oneline -10  # 找到穩定版本 hash
git revert <hash>      # 或 git reset --hard <hash>（危險！）

# 2. 手動部署 Worker
npx wrangler deploy

# 3. 手動構建並部署前端
cd admin; npx vite build
npx wrangler pages deploy deploy --project-name=cms-admin --commit-dirty=true

# 4. 推送回退 commit
git push origin main
```

---

## 版本歷史摘要

| 版本 | 日期 | 重要變更 |
|------|------|----------|
| v1.9.48 | 2026-07-31 | P0 安全修復 + CI/CD 自動部署上線 |
| v1.9.47 | 2026-07-31 | 數據庫備份 Queue 異步解耦 |
| v1.9.46 | 2026-07-30 | 備份 gzip 壓縮 + 站點 Tab |
| v1.9.45 | 2026-07-30 | 備份排除日誌 + 日誌清理 |
| v1.9.44 | 2026-07-30 | 修復非 smile 站點備份失敗 |
| v1.9.43 | 2026-07-30 | 備份多站點改進 |
| v1.9.42 | 2026-07-30 | 權限 toast 修復 + wrangler 升級 |
| v1.9.33 | 2026-07-22 | 合併遷移文件 0001-0007 → 0001_init.sql |

> 完整版本歷史見 Dashboard.tsx `VERSIONS` 數組。

---

## Cloudflare 資源清單（供運維參考）

| 資源 | 標識 | ID |
|------|------|-----|
| Worker | `cfstack-cms` | — |
| D1（主庫） | `endoscopy-cms` | `c824a999-6a14-4878-bc43-2f3de023cbde` |
| D1（smile） | `smile-cms` | `f59320b5-b1f2-47cf-8b32-e341e1c5da48` |
| D1（vision） | `vision-cms` | `a49903a9-098e-43cd-934c-9bad2466d8ae` |
| Pages | `cms-admin` | — |
| GitHub 倉庫 | `vikim540/CloudflareCMS` | Account: `f5d4e94cb23f69f8ae69baedff94f2ba` |
| Secrets Store | `default_secrets_store` | `aef7c32e26c84aedb4b2a5938128ca23` |
| Vectorize | `article-semantic-search` | 768 維 cosine |
| Queues | `publish-queue` / `backup-queue` | DLQ: `publish-dlq` / `backup-dlq` |

---

*本文件最後更新：2026-07-31（v1.9.48 CI/CD 上線）*
