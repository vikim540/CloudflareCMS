-- ============================================================================
-- 0003_indexes.sql — 高頻查詢表索引補充 + ay_content_ext UNIQUE 約束
-- ============================================================================
-- 生成日期：2026-07-31（v1.9.48 P0 修復）
-- 目的：為 18 張無索引的高頻查詢表添加索引，消除全表掃描
-- 安全性：全冪等語法（CREATE INDEX IF NOT EXISTS），可安全重複執行
--
-- 索引選擇原則：
--   僅為「高頻查詢的 WHERE / ORDER BY / JOIN 字段」添加索引
--   不為低頻表或小數據量表添加無謂索引（寫入開銷）
-- ============================================================================

-- === 認證與 RBAC ===
-- ay_user: 登錄查詢 WHERE username = ?（每次登錄全表掃描）
CREATE INDEX IF NOT EXISTS idx_user_username ON ay_user(username);
CREATE INDEX IF NOT EXISTS idx_user_ucode ON ay_user(ucode);
CREATE INDEX IF NOT EXISTS idx_user_status ON ay_user(status);

-- ay_role: 角色查詢 WHERE rcode = ?
CREATE INDEX IF NOT EXISTS idx_role_rcode ON ay_role(rcode);

-- ay_role_level: 權限加載 WHERE rcode = ?
CREATE INDEX IF NOT EXISTS idx_role_level_rcode ON ay_role_level(rcode);

-- ay_role_area: 區域查詢 WHERE rcode = ?
CREATE INDEX IF NOT EXISTS idx_role_area_rcode ON ay_role_area(rcode);

-- === 菜單系統 ===
-- ay_menu: 菜單樹構建 WHERE pcode = ? / mcode = ?
CREATE INDEX IF NOT EXISTS idx_menu_mcode ON ay_menu(mcode);
CREATE INDEX IF NOT EXISTS idx_menu_pcode ON ay_menu(pcode);

-- === 內容管理 ===
-- ay_content_sort: 按模型過濾 WHERE mcode = ?
CREATE INDEX IF NOT EXISTS idx_sort_mcode ON ay_content_sort(mcode);

-- ay_content_ext: UNIQUE 約束（修復 Upsert 競態條件 P0-5）
-- 步驟 1: 清理可能存在的重複記錄（保留最新的一條）
DELETE FROM ay_content_ext WHERE extid NOT IN (
  SELECT MAX(extid) FROM ay_content_ext GROUP BY contentid
);
-- 步驟 2: 添加 UNIQUE 索引（使 INSERT ON CONFLICT 生效）
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_ext_contentid_unique ON ay_content_ext(contentid);

-- === 配置 ===
-- ay_config: 配置查詢 WHERE name = ?
CREATE INDEX IF NOT EXISTS idx_config_name ON ay_config(name);

-- === 表單 ===
-- ay_form: 表單查詢 WHERE fcode = ? / submit_token = ?
CREATE INDEX IF NOT EXISTS idx_form_fcode ON ay_form(fcode);
CREATE INDEX IF NOT EXISTS idx_form_submit_token ON ay_form(submit_token);

-- === 系統日誌 ===
-- ay_syslog: 日誌查詢 ORDER BY create_time DESC / WHERE level = ?
CREATE INDEX IF NOT EXISTS idx_syslog_create_time ON ay_syslog(create_time);
CREATE INDEX IF NOT EXISTS idx_syslog_level ON ay_syslog(level);
CREATE INDEX IF NOT EXISTS idx_syslog_username ON ay_syslog(username);

-- === 301 重定向 ===
-- ay_301_redirect: 每次請求檢查 WHERE old_url = ? AND status = '1'
CREATE INDEX IF NOT EXISTS idx_redirect_old_url ON ay_301_redirect(old_url);
CREATE INDEX IF NOT EXISTS idx_redirect_status ON ay_301_redirect(status);

-- === 講座預約 ===
-- ay_booking_schedule: 按日期查詢排期 WHERE booking_date = ?
CREATE INDEX IF NOT EXISTS idx_booking_schedule_date ON ay_booking_schedule(booking_date);
CREATE INDEX IF NOT EXISTS idx_booking_schedule_type ON ay_booking_schedule(service_type);
