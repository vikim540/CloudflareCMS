-- ============================================================================
-- 0007: 多站點管理菜單項
-- 在系統管理（M300）下新增 M308 多站點管理菜單
-- 僅需在主庫（endoscopy-cms）執行，因為菜單數據全局存儲在主庫
-- ============================================================================

-- 新增多站點管理菜單（位於系統管理分組下）
INSERT OR IGNORE INTO ay_menu (mcode, pcode, name, url, ico, sorting, status, shortcut, type)
VALUES ('M308', 'M300', '多站點管理', '/sites', '🌐', 307, '1', '0', '1');

-- 為超級管理員角色（R101）添加多站點管理權限
INSERT OR IGNORE INTO ay_role_level (rcode, level)
SELECT 'R101', 'M308'
WHERE NOT EXISTS (SELECT 1 FROM ay_role_level WHERE rcode = 'R101' AND level = 'M308');
