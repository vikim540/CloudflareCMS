-- ============================================================================
-- PbootCMS 3.2.12 數據庫初始化腳本 (Cloudflare D1 版)
-- ============================================================================
-- 項目: Cloudflare Rust CMS (基於 PbootCMS 3.2.12 數據庫結構)
-- 說明: 本腳本用於在 Cloudflare D1 (SQLite) 上初始化 PbootCMS 兼容數據庫
-- 約束:
--   1. 完全保留 PbootCMS 原版表結構,不修改/不刪除/不重命名任何原版字段
--   2. 新增表僅限 Go 版已驗證的: ay_area, ay_role_area, ay_301_redirect,
--      ay_media_mark, ay_content_ext
--   3. 表前綴 ay_ 保持不變
--   4. 使用 SQLite 兼容語法 (D1 底層是 SQLite)
--   5. 所有建表使用 CREATE TABLE IF NOT EXISTS
--   6. 所有索引使用 CREATE INDEX IF NOT EXISTS (冪等添加)
-- 密碼方案: 雙 MD5 (md5(md5(password))), 與 PbootCMS 原版完全兼容
-- 區域: acode 字段保留, 固定使用默認值 'cn'
-- ============================================================================

-- ============================================================================
-- 第一部分: 核心內容表
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ay_content: 文章表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'cn',
    scode TEXT,
    subscode TEXT,
    title TEXT,
    titlecolor TEXT,
    subtitle TEXT,
    filename TEXT,
    author TEXT,
    source TEXT,
    outlink TEXT,
    date TEXT,
    ico TEXT,
    pics TEXT,
    picstitle TEXT,
    content TEXT,
    tags TEXT,
    enclosure TEXT,
    keywords TEXT,
    description TEXT,
    sorting INTEGER UNSIGNED DEFAULT 255,
    status TEXT DEFAULT '1',
    istop TEXT DEFAULT '0',
    isrecommend TEXT DEFAULT '0',
    isheadline TEXT DEFAULT '0',
    visits INTEGER UNSIGNED DEFAULT 0,
    likes INTEGER UNSIGNED DEFAULT 0,
    oppose INTEGER UNSIGNED DEFAULT 0,
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT,
    gtype TEXT DEFAULT '4',
    gid TEXT DEFAULT '',
    gnote TEXT DEFAULT '',
    urlname TEXT
);

-- ---------------------------------------------------------------------------
-- ay_content_sort: 欄目表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_content_sort (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'cn',
    mcode TEXT,
    pcode TEXT DEFAULT '0',
    scode TEXT,
    name TEXT,
    subname TEXT,
    type TEXT,
    listtpl TEXT,
    contenttpl TEXT,
    ico TEXT,
    pic TEXT,
    title TEXT,
    keywords TEXT,
    description TEXT,
    filename TEXT,
    sorting INTEGER UNSIGNED DEFAULT 255,
    status TEXT DEFAULT '1',
    outlink TEXT,
    def1 TEXT,
    def2 TEXT,
    def3 TEXT,
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT,
    gtype TEXT DEFAULT '4',
    gid TEXT DEFAULT '',
    gnote TEXT DEFAULT '',
    urlname TEXT
);

-- ---------------------------------------------------------------------------
-- ay_content_ext: 擴展字段表 (Go 版新增)
-- 存儲文章的自定義擴展字段值, 通過 contentid 關聯 ay_content.id
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_content_ext (
    extid INTEGER PRIMARY KEY AUTOINCREMENT,
    contentid INTEGER,
    ext_price TEXT,
    ext_type TEXT,
    ext_color TEXT
);

-- ---------------------------------------------------------------------------
-- ay_extfield: 擴展字段定義表
-- 定義欄目可用的自定義擴展字段
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_extfield (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mcode TEXT,
    name TEXT,
    field TEXT,
    type TEXT,
    description TEXT,
    value TEXT,
    scode TEXT,
    required TEXT DEFAULT '0',
    sorting INTEGER DEFAULT 255,
    status TEXT DEFAULT '1'
);

-- ---------------------------------------------------------------------------
-- ay_single: 單頁表
-- 注意: 時間字段名為 createtime/updatetime (無下劃線), 與原版一致
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_single (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scode TEXT,
    title TEXT,
    keywords TEXT,
    description TEXT,
    content TEXT,
    sorting INTEGER DEFAULT 255,
    status TEXT DEFAULT '1',
    createtime TEXT,
    updatetime TEXT
);

-- ---------------------------------------------------------------------------
-- ay_model: 內容模型表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_model (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mcode TEXT,
    name TEXT,
    type TEXT DEFAULT '2',
    urlname TEXT,
    listtpl TEXT,
    contenttpl TEXT,
    status TEXT DEFAULT '1',
    issystem TEXT DEFAULT '0',
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT
);

-- ============================================================================
-- 第二部分: 系統配置表
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ay_config: 系統配置表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    value TEXT,
    type TEXT DEFAULT '1',
    sorting INTEGER DEFAULT 255,
    description TEXT
);

-- ---------------------------------------------------------------------------
-- ay_site: 站點信息表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_site (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'cn',
    name TEXT,
    title TEXT,
    subtitle TEXT,
    domain TEXT,
    keywords TEXT,
    description TEXT,
    logo TEXT,
    icp TEXT,
    copyright TEXT,
    statistical TEXT,
    theme TEXT,
    lang TEXT DEFAULT 'zh-cn'
);

-- ---------------------------------------------------------------------------
-- ay_company: 公司信息表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_company (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'cn',
    name TEXT,
    address TEXT,
    postcode TEXT,
    contact TEXT,
    mobile TEXT,
    phone TEXT,
    fax TEXT,
    email TEXT,
    qq TEXT,
    weixin TEXT,
    icp TEXT,
    blicense TEXT,
    other TEXT,
    legal TEXT,
    business TEXT
);

-- ============================================================================
-- 第三部分: 管理員權限表
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ay_user: 後台管理員表
-- 注意: lastlogintime 無下劃線, 與原版一致
-- 密碼使用雙 MD5: md5(md5(password))
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ucode TEXT,
    username TEXT,
    password TEXT,
    realname TEXT,
    rcodes TEXT,
    acodes TEXT DEFAULT 'cn',
    status TEXT DEFAULT '1',
    login_count INTEGER DEFAULT 0,
    last_login_ip TEXT,
    lastlogintime TEXT
);

-- ---------------------------------------------------------------------------
-- ay_role: 角色表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_role (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    rcode TEXT,
    name TEXT,
    description TEXT,
    levels TEXT,
    status TEXT DEFAULT '1'
);

-- ---------------------------------------------------------------------------
-- ay_role_level: 角色權限級別表
-- 注意: 字段名為 level (不是 url), 存儲權限 URL 路徑
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_role_level (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rcode TEXT,
    level TEXT
);

-- ---------------------------------------------------------------------------
-- ay_menu: 後台菜單表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_menu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mcode TEXT,
    pcode TEXT DEFAULT '0',
    name TEXT,
    url TEXT,
    ico TEXT,
    sorting INTEGER DEFAULT 255,
    status TEXT DEFAULT '1',
    shortcut TEXT DEFAULT '0',
    type TEXT DEFAULT '1'
);

-- ---------------------------------------------------------------------------
-- ay_menu_action: 菜單操作表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_menu_action (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mcode TEXT,
    name TEXT,
    action TEXT,
    sorting INTEGER DEFAULT 255
);

-- ============================================================================
-- 第四部分: 其他業務表
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ay_message: 留言表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'cn',
    contacts TEXT,
    mobile TEXT,
    content TEXT,
    user_ip TEXT,
    user_os TEXT,
    user_bs TEXT,
    recontent TEXT,
    status TEXT DEFAULT '1',
    uid INTEGER DEFAULT 0,
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT
);

-- ---------------------------------------------------------------------------
-- ay_form: 自定義表單表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_form (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fcode TEXT,
    form_name TEXT,
    table_name TEXT,
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT
);

-- ---------------------------------------------------------------------------
-- ay_form_field: 自定義表單字段表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_form_field (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fcode TEXT,
    name TEXT,
    length INTEGER,
    required TEXT DEFAULT '0',
    description TEXT,
    sorting INTEGER DEFAULT 255,
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT
);

-- ---------------------------------------------------------------------------
-- ay_link: 友情連結表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_link (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'cn',
    gid TEXT DEFAULT '1',
    name TEXT,
    link TEXT,
    logo TEXT,
    sorting INTEGER DEFAULT 255,
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT
);

-- ---------------------------------------------------------------------------
-- ay_slide: 幻燈片表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_slide (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'cn',
    gid TEXT DEFAULT '1',
    pic TEXT,
    pic_mobile TEXT,
    link TEXT,
    title TEXT,
    subtitle TEXT,
    button_text TEXT,
    sorting INTEGER DEFAULT 255,
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT
);

-- ---------------------------------------------------------------------------
-- ay_tags: 標籤表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT DEFAULT 'cn',
    name TEXT,
    link TEXT,
    sorting INTEGER DEFAULT 255,
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT
);

-- ---------------------------------------------------------------------------
-- ay_label: 自定義標籤表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_label (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    value TEXT,
    type TEXT DEFAULT '1',
    description TEXT,
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT
);

-- ---------------------------------------------------------------------------
-- ay_syslog: 系統日誌表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_syslog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT,
    event TEXT,
    user_ip TEXT,
    user_os TEXT,
    user_bs TEXT,
    create_user TEXT,
    create_time TEXT,
    username TEXT,
    url TEXT,
    content TEXT,
    ip TEXT,
    createtime TEXT
);

-- ---------------------------------------------------------------------------
-- ay_301_redirect: 301重定向表 (Go 版新增)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_301_redirect (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    old_url TEXT,
    new_url TEXT,
    match_type TEXT DEFAULT 'exact',
    status TEXT DEFAULT '1',
    sorting INTEGER DEFAULT 255,
    create_user TEXT,
    update_user TEXT,
    create_time TEXT,
    update_time TEXT
);

-- ---------------------------------------------------------------------------
-- ay_area: 區域表 (Go 版新增, 保留但不開發)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_area (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acode TEXT,
    pcode TEXT DEFAULT '0',
    name TEXT,
    domain TEXT,
    is_default TEXT DEFAULT '0'
);

-- ---------------------------------------------------------------------------
-- ay_role_area: 角色區域關聯表 (Go 版新增, 保留但不開發)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_role_area (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rcode TEXT,
    acode TEXT
);

-- ---------------------------------------------------------------------------
-- ay_media_mark: 媒體標記表 (Go 版新增)
-- 記錄已標記保護的媒體文件路徑, 用於防止誤刪及清理孤兒文件
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ay_media_mark (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    create_time TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_mark_path ON ay_media_mark(path);

-- ============================================================================
-- 第五部分: 索引 (冪等添加)
-- ============================================================================

-- ay_content 索引
CREATE INDEX IF NOT EXISTS idx_content_acode ON ay_content(acode);
CREATE INDEX IF NOT EXISTS idx_content_scode_status ON ay_content(scode, status);
CREATE INDEX IF NOT EXISTS idx_content_filename ON ay_content(filename);
CREATE INDEX IF NOT EXISTS idx_content_urlname ON ay_content(urlname);
CREATE INDEX IF NOT EXISTS idx_content_date ON ay_content(date);
CREATE INDEX IF NOT EXISTS idx_content_status ON ay_content(status);
CREATE INDEX IF NOT EXISTS idx_content_sorting ON ay_content(sorting);

-- ay_content_sort 索引
CREATE INDEX IF NOT EXISTS idx_sort_scode ON ay_content_sort(scode);
CREATE INDEX IF NOT EXISTS idx_sort_pcode ON ay_content_sort(pcode);
CREATE INDEX IF NOT EXISTS idx_sort_filename ON ay_content_sort(filename);
CREATE INDEX IF NOT EXISTS idx_sort_urlname ON ay_content_sort(urlname);

-- ay_content_ext 索引
CREATE INDEX IF NOT EXISTS idx_content_ext_contentid ON ay_content_ext(contentid);

-- ============================================================================
-- 第六部分: 初始化數據
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 默認管理員 (admin / 123456, 雙 MD5)
-- 密碼 123456 的雙 MD5 值: 14e1b600b1fd579f47433b88e8d85291
-- ---------------------------------------------------------------------------
INSERT INTO ay_user (ucode, username, password, realname, acodes, status)
VALUES ('10001', 'admin', '14e1b600b1fd579f47433b88e8d85291', '超級管理員', 'cn', '1');

-- ---------------------------------------------------------------------------
-- 默認區域
-- ---------------------------------------------------------------------------
INSERT INTO ay_area (acode, pcode, name, is_default)
VALUES ('cn', '0', '簡體中文', '1');

-- ---------------------------------------------------------------------------
-- 默認內容模型
-- ---------------------------------------------------------------------------
INSERT INTO ay_model (mcode, name, type, urlname, issystem) VALUES
('1', '專題', '1', 'about', '1'),
('2', '新聞', '2', 'list', '1'),
('3', '產品', '2', 'list', '1'),
('4', '案例', '2', 'list', '1'),
('5', '招聘', '2', 'list', '1');

-- ---------------------------------------------------------------------------
-- 默認站點信息
-- ---------------------------------------------------------------------------
INSERT INTO ay_site (acode, name, title, subtitle, domain, theme, lang)
VALUES ('cn', '我的網站', '網站標題', '網站副標題', '', 'default', 'zh-cn');

-- ---------------------------------------------------------------------------
-- 默認公司信息
-- ---------------------------------------------------------------------------
INSERT INTO ay_company (acode, name, address, contact, mobile, email)
VALUES ('cn', '公司名稱', '公司地址', '聯繫人', '13800138000', 'admin@example.com');

-- ---------------------------------------------------------------------------
-- 核心系統配置項 (43 項)
-- ---------------------------------------------------------------------------
INSERT INTO ay_config (name, value, type, sorting, description) VALUES
('open_wap', '1', '1', 10, '手機版開關'),
('wap_domain', '', '2', 11, '手機版域名'),
('wap_site_dir', 'wap', '2', 12, '手機版目錄'),
('message_check_code', '1', '1', 20, '留言驗證碼'),
('message_send_mail', '0', '1', 21, '留言發送郵件'),
('message_send_to', '', '2', 22, '留言接收郵箱'),
('message_verify', '1', '1', 23, '留言審核'),
('message_status', '1', '1', 24, '留言狀態'),
('form_check_code', '1', '1', 25, '表單驗證碼'),
('form_status', '1', '1', 26, '表單狀態'),
('form_send_mail', '0', '1', 27, '表單發送郵件'),
('admin_check_code', '1', '1', 30, '後台驗證碼'),
('lock_count', '5', '2', 31, '登錄失敗鎖定次數'),
('lock_time', '900', '2', 32, '鎖定時間(秒)'),
('ip_deny', '', '2', 33, 'IP黑名單'),
('ip_allow', '', '2', 34, 'IP白名單'),
('api_open', '0', '1', 40, 'API開關'),
('api_auth', '0', '1', 41, 'API認證'),
('api_appid', '', '2', 42, 'API AppID'),
('api_secret', '', '2', 43, 'API Secret'),
('api_cors_origins', '', '2', 44, 'API CORS域名'),
('smtp_server', '', '2', 50, 'SMTP伺服器'),
('smtp_port', '25', '2', 51, 'SMTP端口'),
('smtp_ssl', '0', '1', 52, 'SMTP SSL'),
('smtp_username', '', '2', 53, 'SMTP用戶名'),
('smtp_password', '', '2', 54, 'SMTP密碼'),
('baidu_zz_token', '', '2', 60, '百度推送Token'),
('baidu_xzh_appid', '', '2', 61, '熊掌號AppID'),
('baidu_xzh_token', '', '2', 62, '熊掌號Token'),
('watermark_open', '0', '1', 70, '水印開關'),
('watermark_text', '', '2', 71, '水印文字'),
('watermark_text_font', '', '2', 72, '水印字體'),
('watermark_text_size', '20', '2', 73, '水印字號'),
('watermark_text_color', '#000000', '2', 74, '水印顏色'),
('watermark_pic', '', '2', 75, '水印圖片'),
('watermark_position', '3', '2', 76, '水印位置'),
('url_rule_type', '2', '2', 80, 'URL規則模式(1=普通,2=偽靜態,3=兼容)'),
('url_break_char', '_', '2', 81, 'URL分隔符'),
('url_index_404', '0', '1', 82, '首頁404跳轉'),
('tpl_html_dir', 'html', '2', 83, '模板HTML目錄'),
('gzip', '1', '1', 84, 'GZIP壓縮'),
('content_tags_replace_num', '3', '2', 85, '內容關鍵詞替換次數'),
('pagesize', '15', '2', 86, '默認分頁大小');

-- ---------------------------------------------------------------------------
-- 默認後台菜單
-- ---------------------------------------------------------------------------
INSERT INTO ay_menu (mcode, pcode, name, url, ico, sorting, shortcut, type) VALUES
('M100', '0', '儀表盤', '/admin/dashboard', 'fa-dashboard', 10, '1', '1'),
('M200', '0', '內容管理', '/admin/content', 'fa-file-text', 20, '1', '1'),
('M201', 'M200', '文章列表', '/admin/content/index', '', 210, '0', '1'),
('M202', 'M200', '欄目管理', '/admin/content/sort', '', 220, '0', '1'),
('M203', 'M200', '單頁管理', '/admin/content/single', '', 230, '0', '1'),
('M204', 'M200', '留言管理', '/admin/content/message', '', 240, '0', '1'),
('M205', 'M200', '自定義表單', '/admin/content/form', '', 250, '0', '1'),
('M206', 'M200', '擴展字段', '/admin/content/extfield', '', 260, '0', '1'),
('M207', 'M200', '內容模型', '/admin/content/model', '', 270, '0', '1'),
('M208', 'M200', '回收站', '/admin/content/trash', '', 280, '0', '1'),
('M300', '0', '多媒體', '/admin/media', 'fa-picture-o', 30, '1', '1'),
('M400', '0', 'SEO設置', '/admin/seo', 'fa-search', 40, '0', '1'),
('M401', 'M400', '友情連結', '/admin/seo/link', '', 410, '0', '1'),
('M402', 'M400', '幻燈片', '/admin/seo/slide', '', 420, '0', '1'),
('M403', 'M400', '標籤管理', '/admin/seo/tags', '', 430, '0', '1'),
('M404', 'M400', '自定義標籤', '/admin/seo/label', '', 440, '0', '1'),
('M405', 'M400', '301重定向', '/admin/seo/redirect', '', 450, '0', '1'),
('M500', '0', '系統設置', '/admin/system', 'fa-cog', 50, '0', '1'),
('M501', 'M500', '站點信息', '/admin/system/site', '', 510, '0', '1'),
('M502', 'M500', '公司信息', '/admin/system/company', '', 520, '0', '1'),
('M503', 'M500', '系統配置', '/admin/system/config', '', 530, '0', '1'),
('M504', 'M500', '管理員管理', '/admin/system/user', '', 540, '0', '1'),
('M505', 'M500', '角色管理', '/admin/system/role', '', 550, '0', '1'),
('M506', 'M500', '菜單管理', '/admin/system/menu', '', 560, '0', '1'),
('M507', 'M500', '系統日誌', '/admin/system/syslog', '', 570, '0', '1');
