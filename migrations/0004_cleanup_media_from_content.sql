-- 清理 ay_content 表中被錯誤插入的媒體庫記錄
-- 這些記錄由舊版 handleUpload 函數插入，scode 為空且 content 為 S3 URL
-- 媒體庫文件應通過 S3 ListObjects 直接列出，不應存在於內容表中
DELETE FROM ay_content WHERE scode = '' AND acode = 'cn';
