-- ============================================================================
-- 0002_form_submissions.sql
-- ============================================================================
-- v1.9.0: 統一表單提交系統（取代留言管理）
-- 存儲動態 JSON 表單數據，支持任意字段結構
-- ============================================================================

CREATE TABLE IF NOT EXISTS ay_form_submission (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'cn',
    form_key TEXT DEFAULT 'general',
    data TEXT NOT NULL,
    name TEXT,
    tel TEXT,
    email TEXT,
    status TEXT DEFAULT '0',
    user_ip TEXT,
    user_os TEXT,
    user_bs TEXT,
    source_url TEXT,
    create_time TEXT
);

CREATE INDEX IF NOT EXISTS idx_form_sub_status ON ay_form_submission(status);
CREATE INDEX IF NOT EXISTS idx_form_sub_create_time ON ay_form_submission(create_time);
CREATE INDEX IF NOT EXISTS idx_form_sub_form_key ON ay_form_submission(form_key);
CREATE INDEX IF NOT EXISTS idx_form_sub_name ON ay_form_submission(name);
CREATE INDEX IF NOT EXISTS idx_form_sub_tel ON ay_form_submission(tel);

-- 表單通知 Webhook（客服釘釘群，與系統更新 webhook 分離）
INSERT OR IGNORE INTO ay_config (name, value, type, sorting, description) VALUES
  ('form_webhook_url', 'https://oapi.dingtalk.com/robot/send?access_token=d11729b34fe3a1fdc5f8a38419cfa88196b03c0fbd4a90ff594d26544bdba4c8', '2', 58, '表單通知 Webhook URL（客服群）');

-- 菜單統一：M204 留言管理 → 自定義表單
UPDATE ay_menu SET name = '自定義表單', url = '/admin/forms/submissions', ico = '📝', sorting = 240 WHERE mcode = 'M204';
-- 禁用舊的 M205 自定義表單佔位項
UPDATE ay_menu SET status = '0' WHERE mcode = 'M205';
