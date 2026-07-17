-- ============================================================================
-- Migration 0003: 新增開發日誌/API文檔模型 + API文檔欄目 + API文檔文章
-- 規則: 不修改表結構, 僅冪等插入新數據行
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 新增模型: 開發日誌 (mcode='6') 和 API文檔 (mcode='7')
-- ---------------------------------------------------------------------------
INSERT INTO ay_model (mcode, name, type, urlname, issystem)
SELECT '6', '開發日誌', '2', 'devlog', '0'
WHERE NOT EXISTS (SELECT 1 FROM ay_model WHERE mcode = '6');

INSERT INTO ay_model (mcode, name, type, urlname, issystem)
SELECT '7', 'API文檔', '2', 'apidoc', '0'
WHERE NOT EXISTS (SELECT 1 FROM ay_model WHERE mcode = '7');

-- ---------------------------------------------------------------------------
-- 新增欄目: API文檔 (scode 使用固定值 '100' 避免衝突)
-- 關聯模型 mcode='7' (API文檔)
-- ---------------------------------------------------------------------------
INSERT INTO ay_content_sort (acode, mcode, pcode, scode, name, subname, sorting, status, gtype, gid, create_time, update_time)
SELECT 'cn', '7', '0', '100', 'API文檔', '', 100, '1', '4', '', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM ay_content_sort WHERE scode = '100');

-- ---------------------------------------------------------------------------
-- 新增欄目: 開發日誌 (scode='101', 關聯模型 mcode='6')
-- ---------------------------------------------------------------------------
INSERT INTO ay_content_sort (acode, mcode, pcode, scode, name, subname, sorting, status, gtype, gid, create_time, update_time)
SELECT 'cn', '6', '0', '101', '開發日誌', '', 101, '1', '4', '', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM ay_content_sort WHERE scode = '101');

-- ---------------------------------------------------------------------------
-- 新增 API 文檔文章 (插入到 scode='100' API文檔欄目)
-- 內容為完整的 API 使用文檔, 供前端開發人員參考
-- ---------------------------------------------------------------------------
INSERT INTO ay_content (acode, scode, subscode, title, titlecolor, subtitle, filename, outlink, date, ico, pics, content, tags, keywords, description, sorting, status, istop, isrecommend, isheadline, visits, author, source, create_user, update_user, create_time, update_time)
SELECT
  'cn',
  '100',
  '',
  'RustCMS API 完整使用文檔',
  '',
  '供前端開發人員快速接入 CMS API',
  'api-docs',
  '',
  datetime('now'),
  '',
  '',
  '<h2>一、API 概述</h2>
<p>RustCMS 是基於 Cloudflare Workers 的純 API 後端 CMS 系統，所有接口均返回 JSON 格式數據。API 基礎路徑為 <code>/api/v1/</code>。</p>
<p><strong>基礎 URL</strong>: <code>https://cms.vikim.eu.org/api/v1/</code> 或通過 Pages Functions 同域代理 <code>/api/v1/</code></p>

<h2>二、認證方式</h2>
<h3>2.1 JWT Bearer Token（管理接口）</h3>
<p>管理接口需要通過 JWT 認證，在請求頭中攜帶 <code>Authorization: Bearer &lt;token&gt;</code>。</p>
<p>獲取 Token：</p>
<pre><code>POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}

// 響應
{
  "code": 0,
  "msg": "登錄成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { "id": 1, "username": "admin", "realname": "超級管理員" }
  }
}</code></pre>

<h3>2.2 API Key（SSG 接口）</h3>
<p>靜態生成接口使用 <code>X-API-Key</code> 頭進行認證，密鑰在後台「系統設置 > WebAPI」中配置。</p>

<h2>三、統一響應格式</h2>
<p>所有接口返回統一的 JSON 結構：</p>
<pre><code>{
  "code": 0,           // 0=成功, 非0=失敗
  "msg": "成功",       // 提示消息
  "data": {},          // 數據載荷
  "meta": {            // 可選, 列表接口必須
    "page": 1,
    "pagesize": 20,
    "total": 100
  }
}</code></pre>

<h2>四、公開接口（無需認證）</h2>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>方法</th><th>路徑</th><th>說明</th></tr>
<tr><td>GET</td><td>/api/v1/site</td><td>獲取站點信息</td></tr>
<tr><td>GET</td><td>/api/v1/sorts</td><td>獲取欄目樹</td></tr>
<tr><td>GET</td><td>/api/v1/nav</td><td>獲取導航菜單</td></tr>
<tr><td>GET</td><td>/api/v1/sorts/:scode</td><td>獲取欄目詳情</td></tr>
<tr><td>GET</td><td>/api/v1/contents</td><td>內容列表（支持分頁、欄目過濾）</td></tr>
<tr><td>GET</td><td>/api/v1/contents/:id</td><td>內容詳情</td></tr>
<tr><td>GET</td><td>/api/v1/singles</td><td>單頁列表</td></tr>
<tr><td>GET</td><td>/api/v1/singles/:scode</td><td>單頁詳情</td></tr>
<tr><td>GET</td><td>/api/v1/links</td><td>友情連結</td></tr>
<tr><td>GET</td><td>/api/v1/slides</td><td>幻燈片</td></tr>
<tr><td>GET</td><td>/api/v1/tags</td><td>標籤列表</td></tr>
<tr><td>GET</td><td>/api/v1/labels</td><td>自定義標籤</td></tr>
<tr><td>POST</td><td>/api/v1/messages</td><td>提交留言</td></tr>
</table>

<h3>4.1 內容列表查詢示例</h3>
<pre><code>GET /api/v1/contents?scode=2&page=1&pagesize=10&keyword=關鍵詞

// 響應
{
  "code": 0,
  "msg": "成功",
  "data": [
    {
      "id": 1,
      "title": "文章標題",
      "scode": "2",
      "content": "文章內容HTML",
      "date": "2026-07-17 10:00:00",
      "visits": 100,
      "ico": "縮略圖URL",
      "keywords": "關鍵詞",
      "description": "摘要"
    }
  ],
  "meta": { "page": 1, "pagesize": 10, "total": 50 }
}</code></pre>

<h3>4.2 提交留言示例</h3>
<pre><code>POST /api/v1/messages
Content-Type: application/json

{
  "contacts": "張三",
  "mobile": "13800138000",
  "content": "留言內容"
}

// 響應
{
  "code": 0,
  "msg": "留言提交成功"
}</code></pre>

<h2>五、管理接口（需 JWT 認證）</h2>
<p>管理接口統一前綴 <code>/api/v1/admin/</code>，需要在請求頭攜帶 <code>Authorization: Bearer &lt;token&gt;</code>。</p>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>模塊</th><th>主要接口</th></tr>
<tr><td>內容管理</td><td>GET/POST/PUT/DELETE /admin/contents</td></tr>
<tr><td>欄目管理</td><td>GET/POST/PUT/DELETE /admin/sorts</td></tr>
<tr><td>模型管理</td><td>GET/POST/PUT/DELETE /admin/models</td></tr>
<tr><td>擴展字段</td><td>GET/POST/PUT/DELETE /admin/extfields</td></tr>
<tr><td>單頁管理</td><td>GET/POST/PUT/DELETE /admin/singles</td></tr>
<tr><td>留言管理</td><td>GET/PUT/DELETE /admin/messages</td></tr>
<tr><td>媒體庫</td><td>GET/DELETE /admin/media, POST /admin/upload</td></tr>
<tr><td>存儲配置</td><td>GET/POST /admin/storage</td></tr>
<tr><td>系統配置</td><td>GET/PUT /admin/configs</td></tr>
<tr><td>用戶管理</td><td>GET/POST/PUT/DELETE /admin/users</td></tr>
<tr><td>角色管理</td><td>GET/POST/PUT/DELETE /admin/roles</td></tr>
<tr><td>操作日誌</td><td>GET/DELETE /admin/logs</td></tr>
<tr><td>通知測試</td><td>POST /admin/notify/test-mail, POST /admin/notify/test-webhook</td></tr>
</table>

<h2>六、跨域配置（CORS）</h2>
<p>在後台「系統設置 > WebAPI > API CORS域名」中配置允許的域名（逗號分隔）：</p>
<ul>
<li>留空：允許所有域名（<code>*</code>）</li>
<li>配置域名：如 <code>https://example.com,https://app.example.com</code>，僅允許列出的域名</li>
</ul>
<p>配置後，API 會根據請求的 <code>Origin</code> 頭動態返回 CORS 響應頭。</p>

<h2>七、通知服務</h2>
<h3>7.1 郵件通知</h3>
<p>留言/表單/評論提交時可觸發郵件通知。在「系統設置 > 通知配置」中配置：</p>
<ul>
<li>SMTP 伺服器配置（參考用，實際通過 HTTP API 發信）</li>
<li>郵件服務（mail_provider）：mailchannels / resend</li>
<li>API Key、發件人地址、發件人名稱</li>
</ul>
<h3>7.2 Webhook 推送</h3>
<p>支持釘釘機器人、企業微信機器人、通用 Webhook。配置 webhook_url 和各分項開關：</p>
<ul>
<li>webhook_message：留言推送</li>
<li>webhook_form：表單推送</li>
<li>webhook_comment：評論推送</li>
</ul>

<h2>八、錯誤碼說明</h2>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>code</th><th>說明</th></tr>
<tr><td>0</td><td>成功</td></tr>
<tr><td>1001</td><td>參數錯誤</td></tr>
<tr><td>1004</td><td>資源不存在</td></tr>
<tr><td>1005</td><td>操作失敗</td></tr>
<tr><td>1006</td><td>請求過於頻繁</td></tr>
<tr><td>2002</td><td>未授權/Token無效</td></tr>
<tr><td>2003</td><td>權限不足</td></tr>
<tr><td>500</td><td>服務器錯誤</td></tr>
</table>

<h2>九、使用建議</h2>
<ol>
<li><strong>同域代理</strong>：建議通過 Cloudflare Pages Functions 同域代理 API，避免跨域和 DNS 問題。</li>
<li><strong>緩存策略</strong>：公開 GET 接口可設置 CDN 緩存，管理接口不緩存。</li>
<li><strong>安全防護</strong>：管理接口必須攜帶 JWT Token，SSG 接口使用 API Key。</li>
<li><strong>速率限制</strong>：留言接口有 60 秒 IP 級速率限制。</li>
<li><strong>分頁</strong>：列表接口 page 從 1 開始，pagesize 默認 20。</li>
</ol>',
  '',
  'RustCMS,API,文檔,Cloudflare Workers,CMS',
  'RustCMS API 完整使用文檔，包含認證方式、接口列表、響應格式、跨域配置、通知服務等',
  1,
  '1',
  '0',
  '0',
  '0',
  0,
  '系統',
  'RustCMS',
  'system',
  'system',
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM ay_content WHERE filename = 'api-docs' AND scode = '100');
