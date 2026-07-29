-- ============================================================================
-- Migration 0002: 講座預約管理（僅 smile 站點）
-- 兩張表：ay_booking_calendar（日曆圖片）+ ay_booking_schedule（預約排期）
-- 菜單：M302 講座預約（掛在 M300 多媒體下）
-- ============================================================================

-- ============================================================================
-- Section 1: 日曆圖片表（ay_booking_calendar）
-- 存儲月度日曆圖片（WebP），兩張圖全展示（中環+旺角），無需 location 字段
-- title 同時用作 alt_text 和 title_attr
-- ============================================================================
CREATE TABLE IF NOT EXISTS ay_booking_calendar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'smile',
    pic TEXT DEFAULT '',
    title TEXT DEFAULT '',
    sorting INTEGER DEFAULT 255,
    status TEXT DEFAULT '1',
    create_user TEXT DEFAULT '',
    update_user TEXT DEFAULT '',
    create_time TEXT,
    update_time TEXT
);

-- ============================================================================
-- Section 2: 預約排期表（ay_booking_schedule）
-- 存儲可預約的日期、時段、服務類型、地點
-- service_type: '1'=Smile Pro旺角, '2'=Smile Pro中環, '3'=Smile中環
-- location: '1'=旺角, '2'=中環
-- time_slot: '上午' / '下午'
-- ============================================================================
CREATE TABLE IF NOT EXISTS ay_booking_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'smile',
    service_type TEXT DEFAULT '1',
    location TEXT DEFAULT '1',
    booking_date TEXT DEFAULT '',
    time_slot TEXT DEFAULT '上午',
    max_seats INTEGER DEFAULT 10,
    status TEXT DEFAULT '1',
    sorting INTEGER DEFAULT 255,
    create_user TEXT DEFAULT '',
    update_user TEXT DEFAULT '',
    create_time TEXT,
    update_time TEXT
);

-- ============================================================================
-- Section 3: 菜單 — M302 講座預約（掛在 M300 多媒體下）
-- ============================================================================
INSERT OR IGNORE INTO ay_menu (id, mcode, pcode, name, url, ico, sorting, status, shortcut, type) VALUES
  (56, 'M302', 'M300', '講座預約', '/admin/booking', '📅', 302, '1', '1', '1');

-- ============================================================================
-- Section 4: 角色權限 — 超級管理員 + 文案編輯 可見
-- ============================================================================
INSERT OR IGNORE INTO ay_role_level (rcode, level) VALUES
  ('R101', 'M302'),
  ('R102', 'M302');

-- 同步更新 ay_role.levels 字段（逗號分隔的權限列表，用於前端顯示）
UPDATE ay_role SET levels = levels || ',M302' WHERE code = 'R101' AND levels NOT LIKE '%M302%';
UPDATE ay_role SET levels = levels || ',M302' WHERE code = 'R102' AND levels NOT LIKE '%M302%';
