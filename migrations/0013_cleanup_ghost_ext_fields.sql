-- v1.8.2: 清理 ay_content_ext 幽靈字段
-- 這些字段是開發/測試期間通過 ALTER TABLE 動態添加的，但 ay_extfield 中沒有對應定義記錄
-- 保留：extid, contentid（系統字段）+ ext_price, ext_type, ext_color（PbootCMS 原版硬編碼列）+ ext_content_whatsapp（有效字段）
-- 刪除：13 個無定義的測試殘留字段

-- SQLite 3.35.0+ 支持 ALTER TABLE DROP COLUMN，D1 基於較新版本
ALTER TABLE ay_content_ext DROP COLUMN ext_source;
ALTER TABLE ay_content_ext DROP COLUMN ext_author;
ALTER TABLE ay_content_ext DROP COLUMN ext_readtime;
ALTER TABLE ay_content_ext DROP COLUMN ext_rating;
ALTER TABLE ay_content_ext DROP COLUMN ext_spec;
ALTER TABLE ay_content_ext DROP COLUMN ext_category;
ALTER TABLE ay_content_ext DROP COLUMN ext_logtype;
ALTER TABLE ay_content_ext DROP COLUMN ext_version;
ALTER TABLE ay_content_ext DROP COLUMN ext_filecount;
ALTER TABLE ay_content_ext DROP COLUMN ext_method;
ALTER TABLE ay_content_ext DROP COLUMN ext_path;
ALTER TABLE ay_content_ext DROP COLUMN ext_auth;
ALTER TABLE ay_content_ext DROP COLUMN ext_apiversion;
