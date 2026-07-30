-- ============================================================================
-- Migration 0003: 講座預約排期表精細化
-- 1. 新增 is_special（是否特別場，如 LBV）+ special_label（特別場標籤）
-- 2. time_slot 語義變更：從「上午/下午」改為「HH:mm-HH:mm」具體時段
--    （無需 ALTER TABLE，字段類型仍為 TEXT，僅語義變更）
-- 3. 服務類型重新定義：
--    '1' = SMILE Pro 2.0（支持旺角+中環）
--    '2' = SMILE+ICL（僅中環）
--    '3' = 老花矯視（僅旺角）
-- ============================================================================

-- 新增特別場標記字段
ALTER TABLE ay_booking_schedule ADD COLUMN is_special TEXT DEFAULT '0';
ALTER TABLE ay_booking_schedule ADD COLUMN special_label TEXT DEFAULT '';

-- 清空舊的測試數據（time_slot 語義已變更，舊數據不再適用）
DELETE FROM ay_booking_schedule;
