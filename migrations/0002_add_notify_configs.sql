-- ============================================================================
-- Migration 0002: 新增 Webhook 通知 + 郵件服務配置項
-- 規則: 不修改表結構, 僅冪等插入新配置行到 ay_config
-- 參考: pbootcms-go 的 webhook.go 和 mailer.go 配置項
-- ============================================================================

-- Webhook 推送配置 (sorting 55-59, 歸入通知配置分組)
INSERT INTO ay_config (name, value, type, sorting, description)
SELECT 'webhook_url', '', '2', 55, 'Webhook推送地址(釘釘/企業微信/通用)'
WHERE NOT EXISTS (SELECT 1 FROM ay_config WHERE name = 'webhook_url');

INSERT INTO ay_config (name, value, type, sorting, description)
SELECT 'webhook_message', '0', '1', 56, '留言推送開關'
WHERE NOT EXISTS (SELECT 1 FROM ay_config WHERE name = 'webhook_message');

INSERT INTO ay_config (name, value, type, sorting, description)
SELECT 'webhook_form', '0', '1', 57, '表單推送開關'
WHERE NOT EXISTS (SELECT 1 FROM ay_config WHERE name = 'webhook_form');

INSERT INTO ay_config (name, value, type, sorting, description)
SELECT 'webhook_comment', '0', '1', 58, '評論推送開關'
WHERE NOT EXISTS (SELECT 1 FROM ay_config WHERE name = 'webhook_comment');

INSERT INTO ay_config (name, value, type, sorting, description)
SELECT 'comment_send_mail', '0', '1', 28, '評論發送郵件'
WHERE NOT EXISTS (SELECT 1 FROM ay_config WHERE name = 'comment_send_mail');

-- 郵件服務高級配置 (sorting 90-94, 新增郵件服務分組)
INSERT INTO ay_config (name, value, type, sorting, description)
SELECT 'mail_provider', 'mailchannels', '2', 90, '郵件服務(mailchannels/resend)'
WHERE NOT EXISTS (SELECT 1 FROM ay_config WHERE name = 'mail_provider');

INSERT INTO ay_config (name, value, type, sorting, description)
SELECT 'mail_api_key', '', '2', 91, '郵件服務API Key'
WHERE NOT EXISTS (SELECT 1 FROM ay_config WHERE name = 'mail_api_key');

INSERT INTO ay_config (name, value, type, sorting, description)
SELECT 'mail_from', '', '2', 92, '發件人地址'
WHERE NOT EXISTS (SELECT 1 FROM ay_config WHERE name = 'mail_from');

INSERT INTO ay_config (name, value, type, sorting, description)
SELECT 'mail_from_name', 'CMS系統', '2', 93, '發件人名稱'
WHERE NOT EXISTS (SELECT 1 FROM ay_config WHERE name = 'mail_from_name');
