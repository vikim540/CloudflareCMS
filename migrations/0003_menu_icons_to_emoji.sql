-- 0003: 菜單圖標從 FontAwesome 轉為 emoji
-- 項目約束：全盤使用 emoji，禁止引入 SVG/字體圖標庫

UPDATE ay_menu SET ico = '📊' WHERE ico = 'fa-dashboard';
UPDATE ay_menu SET ico = '📄' WHERE ico = 'fa-file-text';
UPDATE ay_menu SET ico = '🖼️' WHERE ico = 'fa-picture-o';
UPDATE ay_menu SET ico = '🔍' WHERE ico = 'fa-search';
UPDATE ay_menu SET ico = '⚙️' WHERE ico = 'fa-cog';
