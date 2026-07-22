-- ============================================================================
-- 0004_form_submit_token.sql
-- ============================================================================
-- v1.9.3: 表單提交 API 安全加固
-- 1. 新增 submit_token 字段（16位隨機 token，用於隱蔽化 API 路徑）
-- 2. 為現有表單生成隨機 token
-- 3. 新增 turnstile_enabled 字段（每個表單可單獨控制人機驗證）
-- 4. 新增 allowed_origins 字段（限制提交來源域名）
-- ============================================================================

ALTER TABLE ay_form ADD COLUMN submit_token TEXT;
ALTER TABLE ay_form ADD COLUMN turnstile_enabled TEXT DEFAULT '0';
ALTER TABLE ay_form ADD COLUMN allowed_origins TEXT;

-- 為現有表單生成隨機 token（16位大小寫字母+數字）
UPDATE ay_form SET submit_token = 'Kx9mB2nQ7pL4rT8v' WHERE id = 1 AND submit_token IS NULL;
UPDATE ay_form SET submit_token = 'Ap7Lk3R9wX2nF5jH' WHERE id = 2 AND submit_token IS NULL;
UPDATE ay_form SET submit_token = 'Zt4Pq8M1cV6bN3yD' WHERE id = 3 AND submit_token IS NULL;
