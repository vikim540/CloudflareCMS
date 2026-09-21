-- v1.9.80: 單頁/專題落地頁新增 whatsapp_btn 字段（按鈕顯示文案）
ALTER TABLE ay_single ADD COLUMN whatsapp_btn TEXT DEFAULT '立即預約查詢';
