-- v1.9.62: 站點預覽 CSS（文章編輯器預覽功能）
-- 用途：存儲前台網站 CSS，供後台文章編輯器預覽使用，消除編輯器與前台渲染的樣式割裂
ALTER TABLE ay_site ADD COLUMN preview_css TEXT DEFAULT '';
