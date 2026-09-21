-- v1.9.82: 單頁/專題落地頁新增 banner_alt 和 banner_title 字段
ALTER TABLE ay_single ADD COLUMN banner_alt TEXT DEFAULT '';
ALTER TABLE ay_single ADD COLUMN banner_title TEXT DEFAULT '';
