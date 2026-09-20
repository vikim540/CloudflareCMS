-- v1.9.79: 單頁/專題落地頁新增 seo_title 字段
-- 用途：區分後台專題管理名稱（如「二人同行」）與前台 SEO TDK 頁面標題（如「二人同行腸胃鏡檢查計劃｜胃鏡及大腸鏡檢查 - 香港內視鏡中心」）
ALTER TABLE ay_single ADD COLUMN seo_title TEXT DEFAULT '';
