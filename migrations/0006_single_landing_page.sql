-- v1.9.78: 單頁/營銷專題落地頁增強字段
-- 支援目錄別名 (filename)、雙端 Banner、WhatsApp 轉化配置、套餐價目表 JSON、條款及細則
ALTER TABLE ay_single ADD COLUMN filename TEXT DEFAULT '';
ALTER TABLE ay_single ADD COLUMN banner_pc TEXT DEFAULT '';
ALTER TABLE ay_single ADD COLUMN banner_mb TEXT DEFAULT '';
ALTER TABLE ay_single ADD COLUMN whatsapp_phone TEXT DEFAULT '';
ALTER TABLE ay_single ADD COLUMN whatsapp_text TEXT DEFAULT '';
ALTER TABLE ay_single ADD COLUMN packages TEXT DEFAULT '';
ALTER TABLE ay_single ADD COLUMN terms TEXT DEFAULT '';
