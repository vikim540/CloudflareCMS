-- ============================================================================
-- 0007_system_webhook_url.sql
-- ============================================================================
-- v1.9.32: 系統更新 Webhook 與表單推送 Webhook 分離
--
-- 背景：
--   原先 handleVersionNotify 使用 webhook_url（與表單/留言/評論推送共用），
--   導致版本更新通知與表單提交通知推送到同一個群組。
--   新增 system_webhook_url 配置項，讓系統更新通知推送到獨立的開發群組。
--
-- 配置項說明：
--   system_webhook_url (sorting 61) — 系統更新 Webhook URL（開發群）
--   webhook_url        (sorting 57) — 表單/留言/評論 Webhook URL（客服群）
--   form_webhook_url   (sorting 58) — 表單專屬 Webhook URL（客服群，覆蓋 webhook_url）
--
-- 向後兼容：system_webhook_url 為空時，handleVersionNotify 回退到 webhook_url
-- ============================================================================

INSERT OR IGNORE INTO ay_config (name, value, type, sorting, description) VALUES
  ('system_webhook_url', '', '2', 61, '系統更新 Webhook URL（開發群，留空則回退到 webhook_url）');

-- 更新 webhook_url 描述，明確標註為表單推送用
UPDATE ay_config SET description = '表單/留言/評論 Webhook 推送地址（客服群）' WHERE name = 'webhook_url';
