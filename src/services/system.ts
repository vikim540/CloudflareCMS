/**
 * 系統管理服務 (5 個模塊)
 * 包含: 用戶管理 / 角色管理 / 菜單管理 / 系統日誌 / 數據庫備份
 *
 * 表結構注意事項 (來自 migrations/0001_init.sql):
 *   - ay_user:        lastlogintime 無下劃線, rcodes 為逗號分隔角色代碼
 *   - ay_role:        code + rcode 雙代碼字段, levels 為逗號分隔權限
 *   - ay_role_level:  level 字段存儲權限鍵 (如 'content:index')
 *   - ay_menu:        pcode/mcode 構建樹形結構
 *   - ay_syslog:      雙時間字段 (create_time + createtime), 雙 IP 字段 (user_ip + ip)
 *
 * 所有 SQL 均使用 D1 binding 的參數化查詢, 禁止字符串拼接值
 */
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { okData, ok, err, okList, createMeta, notFound } from '../utils/response';
import { fromQuery, offset } from '../utils/pagination';
import { hashPassword } from '../utils/password';
import { getS3Config, type S3Secrets } from './storage';
import { s3PutObject, s3GetObject, s3DeleteObject, s3ListObjects } from '../utils/s3sig';
import { nowStr, todayStr } from '../utils/datetime';
import { getConfig } from './config';

/** 超級管理員 ucode, 禁止刪除/禁用 */
const SUPER_ADMIN_UCODE = '10001';

/** User-Agent 解析 (用於日誌記錄客戶端信息) */
function parseUA(ua: string): { os: string; browser: string } {
  let os = 'Unknown';
  let browser = 'Unknown';
  if (!ua) return { os, browser };

  if (/Windows NT 10/.test(ua)) os = 'Windows 10';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/MSIE|Trident/.test(ua)) browser = 'IE';

  return { os, browser };
}

/** 將 levels 參數統一為字符串數組 */
function normalizeLevels(levels: unknown): string[] {
  if (Array.isArray(levels)) {
    return levels.filter((l) => typeof l === 'string' && l.length > 0);
  }
  if (typeof levels === 'string' && levels.length > 0) {
    return levels
      .split(',')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }
  return [];
}

/** SQL 值轉義 (用於備份 INSERT 語句生成) */
function escapeSqlValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  // 字符串: 轉義單引號
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

/** 備份文件名安全校驗 (僅允許字母數字、下劃線、點、連字符) */
function sanitizeBackupFilename(filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe.endsWith('.sql')) return '';
  return safe;
}

// ============================================================================
// 代碼生成器
// ============================================================================

/** 生成用戶 ucode (查找最大數字 ucode + 1, 格式 "10001") */
async function generateUcode(db: D1Database): Promise<string> {
  const last = await db
    .prepare('SELECT ucode FROM ay_user ORDER BY CAST(ucode AS INTEGER) DESC LIMIT 1')
    .first<{ ucode: string }>();
  if (!last || !last.ucode) return '10001';
  const num = parseInt(last.ucode, 10);
  return isNaN(num) ? '10001' : String(num + 1).padStart(5, '0');
}

/** 生成角色 rcode (R101, R102, ...) */
async function generateRcode(db: D1Database): Promise<string> {
  const last = await db
    .prepare(
      "SELECT rcode FROM ay_role WHERE rcode LIKE 'R%' ORDER BY CAST(SUBSTR(rcode, 2) AS INTEGER) DESC LIMIT 1",
    )
    .first<{ rcode: string }>();
  if (!last || !last.rcode) return 'R101';
  const num = parseInt(last.rcode.substring(1), 10);
  return isNaN(num) ? 'R101' : 'R' + String(num + 1).padStart(3, '0');
}

/** 生成菜單 mcode (M100, M101, ...) */
async function generateMcode(db: D1Database): Promise<string> {
  const last = await db
    .prepare(
      "SELECT mcode FROM ay_menu WHERE mcode LIKE 'M%' ORDER BY CAST(SUBSTR(mcode, 2) AS INTEGER) DESC LIMIT 1",
    )
    .first<{ mcode: string }>();
  if (!last || !last.mcode) return 'M100';
  const num = parseInt(last.mcode.substring(1), 10);
  return isNaN(num) ? 'M100' : 'M' + String(num + 1);
}

// ============================================================================
// 模塊 1: 用戶管理 (ay_user)
// 密碼使用雙 MD5, 不在響應中返回 password 字段
// ============================================================================

/** 用戶列表查詢字段 (排除 password) */
const USER_SELECT_FIELDS =
  'id, ucode, username, realname, rcodes, acodes, status, login_count, last_login_ip, lastlogintime';

/** 用戶列表 (分頁, ORDER BY id ASC) */
export async function handleListUsers(
  db: D1Database,
  params: URLSearchParams,
): Promise<Response> {
  const pagination = fromQuery(params);
  const off = offset(pagination);

  const listResult = await db
    .prepare(`SELECT ${USER_SELECT_FIELDS} FROM ay_user ORDER BY id ASC LIMIT ? OFFSET ?`)
    .bind(pagination.pagesize, off)
    .all();

  const countResult = await db.prepare('SELECT COUNT(*) as total FROM ay_user').first<{ total: number }>();
  const total = countResult?.total ?? 0;

  return okList(listResult.results, createMeta(pagination.page, pagination.pagesize, total), '成功');
}

/** 用戶詳情 (不返回 password) */
export async function handleGetUser(db: D1Database, id: number): Promise<Response> {
  const row = await db
    .prepare(`SELECT ${USER_SELECT_FIELDS} FROM ay_user WHERE id = ?`)
    .bind(id)
    .first();
  if (!row) return notFound('用戶不存在');
  return okData(row, '成功');
}

/** 新增用戶 */
export async function handleCreateUser(
  db: D1Database,
  body: {
    username?: string;
    password?: string;
    realname?: string;
    rcodes?: string;
    status?: string;
  },
): Promise<Response> {
  const username = body.username;
  const passwordInput = body.password;
  if (!username) return err('缺少 username 參數', 1001);
  if (!passwordInput) return err('缺少 password 參數', 1001);

  // 檢查用戶名唯一性
  const existing = await db
    .prepare('SELECT id FROM ay_user WHERE username = ?')
    .bind(username)
    .first<{ id: number }>();
  if (existing) {
    return err('用戶名已存在', 1002);
  }

  const ucode = await generateUcode(db);
  const hashedPassword = hashPassword(passwordInput);
  const now = nowStr();

  const result = await db
    .prepare(
      'INSERT INTO ay_user (ucode, username, password, realname, rcodes, acodes, status, login_count, lastlogintime) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
    )
    .bind(
      ucode,
      username,
      hashedPassword,
      body.realname || '',
      body.rcodes || '',
      'cn',
      body.status || '1',
      now,
    )
    .run();

  if (result.meta.changes > 0) {
    // 返回新用戶 ID，供前端立即保存站點權限分配（v1.7.5 修復：創建後站點權限丟失）
    const newId = result.meta.last_row_id;
    return okData({ id: newId, ucode }, '用戶創建成功');
  }
  return err('用戶創建失敗', 1005);
}

/** 修改用戶 (白名單字段動態 UPDATE, 可選更新密碼) */
export async function handleUpdateUser(
  db: D1Database,
  id: number,
  body: {
    realname?: string;
    rcodes?: string;
    status?: string;
    password?: string;
  },
): Promise<Response> {
  // 查詢當前用戶, 判斷是否為超級管理員
  const currentUser = await db
    .prepare('SELECT ucode FROM ay_user WHERE id = ?')
    .bind(id)
    .first<{ ucode: string }>();
  if (!currentUser) return notFound('用戶不存在');

  const isSuperAdmin = currentUser.ucode === SUPER_ADMIN_UCODE;

  const sets: string[] = [];
  const binds: (string | number)[] = [];

  // realname
  if (body.realname !== undefined && typeof body.realname === 'string') {
    sets.push('realname = ?');
    binds.push(body.realname);
  }

  // rcodes
  if (body.rcodes !== undefined && typeof body.rcodes === 'string') {
    sets.push('rcodes = ?');
    binds.push(body.rcodes);
  }

  // status - 超級管理員不允許被禁用（status="0"），但允許保持啟用
  if (body.status !== undefined && typeof body.status === 'string') {
    if (isSuperAdmin && body.status === '0') {
      return err('不允許禁用超級管理員', 1003);
    }
    // 超級管理員 status="1" 或非超級管理員，正常更新
    sets.push('status = ?');
    binds.push(body.status);
  }

  // password - 如果提供且非空, 則更新 (雙 MD5)
  if (body.password !== undefined && body.password !== '') {
    sets.push('password = ?');
    binds.push(hashPassword(body.password));
  }

  if (sets.length === 0) {
    return err('沒有需要更新的字段', 1001);
  }

  binds.push(id);
  const sql = `UPDATE ay_user SET ${sets.join(', ')} WHERE id = ?`;
  await db.prepare(sql).bind(...binds).run();

  return ok('用戶更新成功');
}

/** 刪除用戶 (禁止刪除超級管理員 ucode="10001") */
export async function handleDeleteUser(db: D1Database, id: number): Promise<Response> {
  const user = await db
    .prepare('SELECT ucode FROM ay_user WHERE id = ?')
    .bind(id)
    .first<{ ucode: string }>();
  if (!user) return notFound('用戶不存在');

  if (user.ucode === SUPER_ADMIN_UCODE) {
    return err('不允許刪除超級管理員', 1003);
  }

  await db.prepare('DELETE FROM ay_user WHERE id = ?').bind(id).run();
  return ok('用戶刪除成功');
}

/** 重置密碼 (雙 MD5) */
export async function handleResetPassword(
  db: D1Database,
  id: number,
  body: { password?: string },
): Promise<Response> {
  const passwordInput = body.password;
  if (!passwordInput) return err('缺少 password 參數', 1001);

  const user = await db
    .prepare('SELECT id FROM ay_user WHERE id = ?')
    .bind(id)
    .first<{ id: number }>();
  if (!user) return notFound('用戶不存在');

  const hashedPassword = hashPassword(passwordInput);

  await db
    .prepare('UPDATE ay_user SET password = ? WHERE id = ?')
    .bind(hashedPassword, id)
    .run();

  return ok('密碼重置成功');
}

// ============================================================================
// 模塊 2: 角色管理 (ay_role + ay_role_level)
// ay_role.levels 存儲逗號分隔權限, ay_role_level 存儲逐條權限
// ============================================================================

/**
 * 查詢所有角色權限數量 (rcode → COUNT)
 * 一條 SQL 查詢 ay_role_level, 按 rcode 分組統計
 * 返回 Map<rcode, levelCount>
 */
async function loadLevelCountMap(db: D1Database): Promise<Map<string, number>> {
  const result = await db
    .prepare('SELECT rcode, COUNT(*) as cnt FROM ay_role_level GROUP BY rcode')
    .all<{ rcode: string; cnt: number }>();
  const map = new Map<string, number>();
  for (const row of result.results) {
    map.set(row.rcode, row.cnt);
  }
  return map;
}

/**
 * 查詢所有用戶的 rcodes, 統計每個 rcode 被引用次數
 * 因 rcodes 是逗號分隔字符串, 需在 JS 中解析統計
 * 返回 Map<rcode, userCount>
 */
async function loadUserCountMap(db: D1Database): Promise<Map<string, number>> {
  const result = await db
    .prepare('SELECT rcodes FROM ay_user')
    .all<{ rcodes: string | null }>();
  const map = new Map<string, number>();
  for (const u of result.results) {
    if (!u.rcodes) continue;
    const codes = u.rcodes.split(',').map((c) => c.trim()).filter(Boolean);
    for (const code of codes) {
      map.set(code, (map.get(code) || 0) + 1);
    }
  }
  return map;
}

/** 角色列表 (分頁, ORDER BY id ASC, 含用戶數 userCount 和權限數 levelCount) */
export async function handleListRoles(
  db: D1Database,
  params: URLSearchParams,
): Promise<Response> {
  const pagination = fromQuery(params);
  const off = offset(pagination);

  const listResult = await db
    .prepare('SELECT * FROM ay_role ORDER BY id ASC LIMIT ? OFFSET ?')
    .bind(pagination.pagesize, off)
    .all<{ rcode: string }>();

  const countResult = await db.prepare('SELECT COUNT(*) as total FROM ay_role').first<{ total: number }>();
  const total = countResult?.total ?? 0;

  // 查詢用戶數和權限數映射
  const [userCountMap, levelCountMap] = await Promise.all([
    loadUserCountMap(db),
    loadLevelCountMap(db),
  ]);

  // 合併到角色列表
  const roles = listResult.results.map((role) => ({
    ...role,
    userCount: userCountMap.get(role.rcode) || 0,
    levelCount: levelCountMap.get(role.rcode) || 0,
  }));

  return okList(roles, createMeta(pagination.page, pagination.pagesize, total), '成功');
}

/** 全部啟用角色列表 (用於下拉選擇, 無分頁, 含權限數 levelCount) */
export async function handleListRolesAll(db: D1Database): Promise<Response> {
  const result = await db
    .prepare("SELECT id, rcode, name, description FROM ay_role WHERE status = '1' ORDER BY id ASC")
    .all<{ rcode: string }>();

  const levelCountMap = await loadLevelCountMap(db);

  const roles = result.results.map((role) => ({
    ...role,
    levelCount: levelCountMap.get(role.rcode) || 0,
  }));

  return okData(roles, '成功');
}

/** 角色詳情 (包含權限級別列表) */
export async function handleGetRole(db: D1Database, id: number): Promise<Response> {
  const role = await db
    .prepare('SELECT * FROM ay_role WHERE id = ?')
    .bind(id)
    .first<{ rcode: string }>();
  if (!role) return notFound('角色不存在');

  // 查詢角色的權限級別列表
  const levelsResult = await db
    .prepare('SELECT level FROM ay_role_level WHERE rcode = ? ORDER BY id ASC')
    .bind(role.rcode)
    .all<{ level: string }>();

  const levels = levelsResult.results.map((r) => r.level);

  return okData({ ...role, levels }, '成功');
}

/** 新增角色 (同時寫入 ay_role_level) */
export async function handleCreateRole(
  db: D1Database,
  body: {
    name?: string;
    description?: string;
    status?: string;
    levels?: string[] | string;
  },
): Promise<Response> {
  const name = body.name;
  if (!name) return err('缺少 name 參數', 1001);

  const rcode = await generateRcode(db);
  const levels = normalizeLevels(body.levels);
  const levelsStr = levels.join(',');
  const now = nowStr();

  // 插入角色
  const result = await db
    .prepare(
      'INSERT INTO ay_role (code, rcode, name, description, levels, status) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(rcode, rcode, name, body.description || '', levelsStr, body.status || '1')
    .run();

  if (result.meta.changes === 0) {
    return err('角色創建失敗', 1005);
  }

  // 插入權限級別
  for (const level of levels) {
    await db
      .prepare('INSERT INTO ay_role_level (rcode, level) VALUES (?, ?)')
      .bind(rcode, level)
      .run();
  }

  return ok('角色創建成功');
}

/** 修改角色 (更新 ay_role, 重建 ay_role_level) */
export async function handleUpdateRole(
  db: D1Database,
  id: number,
  body: {
    name?: string;
    description?: string;
    status?: string;
    levels?: string[] | string;
  },
): Promise<Response> {
  // 查詢角色是否存在, 獲取 rcode
  const role = await db
    .prepare('SELECT rcode FROM ay_role WHERE id = ?')
    .bind(id)
    .first<{ rcode: string }>();
  if (!role) return notFound('角色不存在');

  const sets: string[] = [];
  const binds: (string | number)[] = [];

  if (body.name !== undefined && typeof body.name === 'string') {
    sets.push('name = ?');
    binds.push(body.name);
  }
  if (body.description !== undefined && typeof body.description === 'string') {
    sets.push('description = ?');
    binds.push(body.description);
  }
  if (body.status !== undefined && typeof body.status === 'string') {
    sets.push('status = ?');
    binds.push(body.status);
  }

  // 如果提供了 levels, 更新 levels 字段並重建 ay_role_level
  if (body.levels !== undefined) {
    const levels = normalizeLevels(body.levels);
    sets.push('levels = ?');
    binds.push(levels.join(','));

    // 先更新 ay_role
    binds.push(id);
    const sql = `UPDATE ay_role SET ${sets.join(', ')} WHERE id = ?`;
    await db.prepare(sql).bind(...binds).run();

    // 刪除舊的權限級別
    await db
      .prepare('DELETE FROM ay_role_level WHERE rcode = ?')
      .bind(role.rcode)
      .run();

    // 插入新的權限級別
    for (const level of levels) {
      await db
        .prepare('INSERT INTO ay_role_level (rcode, level) VALUES (?, ?)')
        .bind(role.rcode, level)
        .run();
    }
  } else {
    // 無 levels 更新, 僅更新 ay_role 字段
    if (sets.length === 0) {
      return err('沒有需要更新的字段', 1001);
    }
    binds.push(id);
    const sql = `UPDATE ay_role SET ${sets.join(', ')} WHERE id = ?`;
    await db.prepare(sql).bind(...binds).run();
  }

  return ok('角色更新成功');
}

/** 刪除角色 (同時刪除 ay_role_level, 檢查是否有用戶使用) */
export async function handleDeleteRole(db: D1Database, id: number): Promise<Response> {
  const role = await db
    .prepare('SELECT rcode FROM ay_role WHERE id = ?')
    .bind(id)
    .first<{ rcode: string }>();
  if (!role) return notFound('角色不存在');

  // 檢查是否有用戶使用此角色 (rcodes 字段包含 rcode)
  const userResult = await db
    .prepare('SELECT id, username, rcodes FROM ay_user')
    .all<{ id: number; username: string; rcodes: string }>();

  const assignedUsers = userResult.results.filter((u) => {
    if (!u.rcodes) return false;
    const codes = u.rcodes.split(',').map((c) => c.trim());
    return codes.includes(role.rcode);
  });

  if (assignedUsers.length > 0) {
    const names = assignedUsers.map((u) => u.username).join(', ');
    return err(`角色已被以下用戶使用, 無法刪除: ${names}`, 1003);
  }

  // 刪除角色權限級別
  await db
    .prepare('DELETE FROM ay_role_level WHERE rcode = ?')
    .bind(role.rcode)
    .run();

  // 刪除角色
  await db.prepare('DELETE FROM ay_role WHERE id = ?').bind(id).run();

  return ok('角色刪除成功');
}

// ============================================================================
// 模塊 3: 菜單管理 (ay_menu + ay_menu_action)
// pcode/mcode 構建樹形結構, pcode='0' 為頂級菜單
// ============================================================================

/** 菜單樹構建 (遞歸, 基於 pcode/mcode) */
function buildMenuTree(
  menus: Array<Record<string, unknown>>,
  pcode = '0',
): Array<Record<string, unknown>> {
  return menus
    .filter((m) => String(m.pcode) === pcode)
    .map((m) => ({
      ...m,
      children: buildMenuTree(menus, String(m.mcode)),
    }));
}

/** 菜單列表 (樹形結構, ORDER BY sorting ASC, id ASC) */
export async function handleListMenus(db: D1Database): Promise<Response> {
  const result = await db
    .prepare('SELECT * FROM ay_menu ORDER BY sorting ASC, id ASC')
    .all();

  const tree = buildMenuTree(result.results as Array<Record<string, unknown>>);
  return okData(tree, '成功');
}

/** 菜單列表 (扁平結構, 用於管理) */
export async function handleListMenusFlat(db: D1Database): Promise<Response> {
  const result = await db
    .prepare('SELECT * FROM ay_menu ORDER BY sorting ASC, id ASC')
    .all();
  return okData(result.results, '成功');
}

/** 新增菜單 */
export async function handleCreateMenu(
  db: D1Database,
  body: {
    pcode?: string;
    name?: string;
    url?: string;
    ico?: string;
    sorting?: number;
    status?: string;
    shortcut?: string;
    type?: string;
  },
): Promise<Response> {
  const name = body.name;
  if (!name) return err('缺少 name 參數', 1001);

  const mcode = await generateMcode(db);
  const sorting = typeof body.sorting === 'number' ? body.sorting : 255;

  const result = await db
    .prepare(
      'INSERT INTO ay_menu (mcode, pcode, name, url, ico, sorting, status, shortcut, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      mcode,
      body.pcode || '0',
      name,
      body.url || '',
      body.ico || '',
      sorting,
      body.status || '1',
      body.shortcut || '0',
      body.type || '1',
    )
    .run();

  if (result.meta.changes > 0) {
    return ok('菜單創建成功');
  }
  return err('菜單創建失敗', 1005);
}

/** 修改菜單 (白名單字段動態 UPDATE) */
export async function handleUpdateMenu(
  db: D1Database,
  id: number,
  body: Record<string, unknown>,
): Promise<Response> {
  const allowedFields = ['pcode', 'name', 'url', 'ico', 'sorting', 'status', 'shortcut', 'type'];

  const sets: string[] = [];
  const binds: (string | number)[] = [];

  for (const field of allowedFields) {
    const val = body[field];
    if (val !== undefined && (typeof val === 'string' || typeof val === 'number')) {
      sets.push(`${field} = ?`);
      binds.push(val);
    }
  }

  if (sets.length === 0) {
    return err('沒有需要更新的字段', 1001);
  }

  binds.push(id);
  const sql = `UPDATE ay_menu SET ${sets.join(', ')} WHERE id = ?`;
  await db.prepare(sql).bind(...binds).run();

  return ok('菜單更新成功');
}

/**
 * 刪除菜單 (遞歸刪除子菜單, 同時刪除 ay_menu_action)
 * 遞歸收集所有子孫菜單的 mcode, 統一刪除
 */
export async function handleDeleteMenu(db: D1Database, id: number): Promise<Response> {
  // 查詢當前菜單的 mcode
  const menu = await db
    .prepare('SELECT mcode FROM ay_menu WHERE id = ?')
    .bind(id)
    .first<{ mcode: string }>();
  if (!menu) return notFound('菜單不存在');

  // 遞歸收集所有子孫菜單 mcode (包含自身)
  const allMcodes: string[] = [menu.mcode];
  await collectChildMcodes(db, menu.mcode, allMcodes);

  // 刪除所有相關菜單
  const placeholders = allMcodes.map(() => '?').join(', ');
  await db
    .prepare(`DELETE FROM ay_menu WHERE mcode IN (${placeholders})`)
    .bind(...allMcodes)
    .run();

  // 刪除所有相關菜單操作
  await db
    .prepare(`DELETE FROM ay_menu_action WHERE mcode IN (${placeholders})`)
    .bind(...allMcodes)
    .run();

  return ok('菜單刪除成功');
}

/** 遞歸收集子菜單 mcode */
async function collectChildMcodes(db: D1Database, parentMcode: string, acc: string[]): Promise<void> {
  const children = await db
    .prepare('SELECT mcode FROM ay_menu WHERE pcode = ?')
    .bind(parentMcode)
    .all<{ mcode: string }>();

  for (const child of children.results) {
    acc.push(child.mcode);
    await collectChildMcodes(db, child.mcode, acc);
  }
}

// ============================================================================
// 模塊 4: 系統日誌 (ay_syslog)
// level 分類: admin (管理操作), spider (爬蟲), mail_*/webhook_* (通知)
// ============================================================================

/**
 * 構建日誌查詢的 WHERE 子句
 * - admin: 排除 spider、mail_*、webhook_* 日誌
 * - spider: 僅 spider 日誌
 * - notify: 僅 mail_*、webhook_* 日誌
 * - 其他: 無過濾
 */
function buildLogWhereClause(level: string): string {
  if (level === 'admin') {
    // 管理日誌：合併原 admin + security，排除 content/notify/error
    return "level IN ('admin', 'security')";
  }
  if (level === 'content') {
    return "level = 'content'";
  }
  if (level === 'error') {
    return "level = 'error'";
  }
  if (level === 'notify') {
    return "level LIKE 'mail_%' OR level LIKE 'webhook_%'";
  }
  return '';
}

/** 系統日誌列表 (分頁, 支持 level 篩選, ORDER BY id DESC) */
export async function handleListLogs(
  db: D1Database,
  params: URLSearchParams,
): Promise<Response> {
  const pagination = fromQuery(params);
  const level = params.get('level') || '';
  const off = offset(pagination);

  const whereClause = buildLogWhereClause(level);

  if (whereClause) {
    const listSql = `SELECT * FROM ay_syslog WHERE ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`;
    const listResult = await db.prepare(listSql).bind(pagination.pagesize, off).all();

    const countSql = `SELECT COUNT(*) as total FROM ay_syslog WHERE ${whereClause}`;
    const countResult = await db.prepare(countSql).first<{ total: number }>();
    const total = countResult?.total ?? 0;

    return okList(listResult.results, createMeta(pagination.page, pagination.pagesize, total), '成功');
  }

  // 無過濾條件
  const listResult = await db
    .prepare('SELECT * FROM ay_syslog ORDER BY id DESC LIMIT ? OFFSET ?')
    .bind(pagination.pagesize, off)
    .all();

  const countResult = await db.prepare('SELECT COUNT(*) as total FROM ay_syslog').first<{ total: number }>();
  const total = countResult?.total ?? 0;

  return okList(listResult.results, createMeta(pagination.page, pagination.pagesize, total), '成功');
}

/** 清空系統日誌 (按類型刪除) */
export async function handleClearLogs(
  db: D1Database,
  body: { type?: string },
): Promise<Response> {
  const type = body.type || 'all';

  if (type === 'all') {
    await db.prepare('DELETE FROM ay_syslog').run();
    return ok('已清空全部日誌');
  }

  const whereClause = buildLogWhereClause(type);
  if (!whereClause) {
    return err('無效的日誌類型, 支持: admin / content / error / notify / all', 1001);
  }

  await db.prepare(`DELETE FROM ay_syslog WHERE ${whereClause}`).run();
  return ok(`已清空${type}日誌`);
}

/**
 * 寫入日誌記錄 (輔助函數, 供其他服務調用)
 * 解析 User-Agent 獲取操作系統和瀏覽器信息
 * 寫入失敗不影響主流程
 */
export async function logAction(
  db: D1Database,
  username: string,
  userIp: string,
  userAgent: string,
  event: string,
  level: string,
  url: string,
): Promise<void> {
  try {
    const { os, browser } = parseUA(userAgent);
    const now = nowStr();

    await db
      .prepare(
        'INSERT INTO ay_syslog (level, event, user_ip, user_os, user_bs, create_user, create_time, username, url, content, ip, createtime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(level, event, userIp, os, browser, username, now, username, url, '', userIp, now)
      .run();
  } catch {
    // 日誌寫入失敗不影響主流程
  }
}

// ============================================================================
// 模塊 5: 數據庫備份
// 通過 S3 兼容 API 上傳/下載備份文件到 R2 存儲
// 備份格式: SQL 腳本 (CREATE TABLE + INSERT 語句)
// 存儲路徑: backups/backup_YYYYMMDD_HHmmss.sql
// ============================================================================

/** 備份前綴 (S3 key 前綴) */
const BACKUP_PREFIX = 'backups/';

/** 需要備份的表列表 (來自已知 schema) */
const BACKUP_TABLES = [
  'ay_content',
  'ay_content_sort',
  'ay_content_ext',
  'ay_extfield',
  'ay_single',
  'ay_model',
  'ay_config',
  'ay_site',
  'ay_company',
  'ay_user',
  'ay_role',
  'ay_role_level',
  'ay_menu',
  'ay_menu_action',
  'ay_message',
  'ay_form',
  'ay_form_field',
  'ay_form_submission',
  'ay_link',
  'ay_slide',
  'ay_tags',
  'ay_label',
  'ay_syslog',
  'ay_301_redirect',
  'ay_area',
  'ay_role_area',
  'ay_media_mark',
  'ay_booking_calendar',
  'ay_booking_schedule',
];

/** 備份時可排除數據的表（僅導出 schema，不導出行數據） */
const BACKUP_EXCLUDABLE_DATA_TABLES = new Set(['ay_syslog']);

/** 列出備份文件 (從 R2/S3 存儲) */
export async function handleListBackups(
  db: D1Database,
  kv: KVNamespace,
  s3Secrets?: S3Secrets,
): Promise<Response> {
  const s3Config = await getS3Config(db, kv, s3Secrets);
  if (!s3Config) {
    return okData([], '存儲未配置');
  }

  try {
    const result = await s3ListObjects(s3Config, BACKUP_PREFIX, 100, '');

    const backups = result.files
      .filter((f) => f.key.endsWith('.sql'))
      .map((f) => {
        const filename = f.key.replace(BACKUP_PREFIX, '');
        // 新格式: {siteId}_backup_YYYYMMDDHHmmss.sql
        const newMatch = f.key.match(/(\w+)_backup_(\d{14})\.sql$/);
        // 舊格式: backup_YYYYMMDDHHmmss.sql（向後兼容）
        const oldMatch = f.key.match(/backup_(\d{14})\.sql$/);

        let date = f.lastModified || '';
        let site = '';

        if (newMatch) {
          site = newMatch[1];
          const s = newMatch[2];
          date = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`;
        } else if (oldMatch) {
          site = '(舊格式)';
          const s = oldMatch[1];
          date = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`;
        }
        return {
          filename,
          key: f.key,
          size: f.size,
          date,
          site,
        };
      });

    return okData(backups, '成功');
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知錯誤';
    return err(`列出備份失敗: ${msg}`, 1005);
  }
}

/**
 * 導出單個數據庫的所有表為 SQL 語句
 * @param excludeLogData 為 true 時，ay_syslog 僅導出表結構（CREATE TABLE），不導出數據行
 * @returns SQL 字符串數組（不含事務包裝）
 */
async function dumpDatabaseTables(
  db: D1Database,
  siteId: string,
  excludeLogData = false,
): Promise<{ parts: string[]; tableCount: number; rowCount: number }> {
  const parts: string[] = [];
  parts.push('-- ============================================================');
  parts.push(`-- Site: ${siteId}`);
  if (excludeLogData) {
    parts.push('-- Note: Log data (ay_syslog) excluded — schema only');
  }
  parts.push('-- ============================================================');
  parts.push('');

  let tableCount = 0;
  let rowCount = 0;

  for (const table of BACKUP_TABLES) {
    // 從 sqlite_master 獲取 CREATE TABLE 語句
    const schemaRow = await db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .bind(table)
      .first<{ sql: string }>();

    // 表不存在則跳過（如 ay_booking_calendar 僅 smile 站點有）
    if (!schemaRow?.sql) continue;

    parts.push('-- ------------------------------------------------------------');
    parts.push(`-- Table: ${table}`);
    if (excludeLogData && BACKUP_EXCLUDABLE_DATA_TABLES.has(table)) {
      parts.push(`-- (schema only, data excluded)`);
    }
    parts.push('-- ------------------------------------------------------------');

    parts.push(`DROP TABLE IF EXISTS ${table};`);
    parts.push(schemaRow.sql + ';');
    parts.push('');

    // 排除日誌數據時，僅導出 schema，跳過 SELECT *
    if (excludeLogData && BACKUP_EXCLUDABLE_DATA_TABLES.has(table)) {
      continue;
    }

    // 查詢所有數據行
    const dataResult = await db.prepare(`SELECT * FROM "${table}"`).all();

    if (dataResult.results.length > 0) {
      tableCount++;
      rowCount += dataResult.results.length;
      const columns = Object.keys(dataResult.results[0] as Record<string, unknown>);
      for (const row of dataResult.results) {
        const record = row as Record<string, unknown>;
        const values = columns.map((c) => escapeSqlValue(record[c]));
        parts.push(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`,
        );
      }
      parts.push('');
    }
  }

  // 備份索引
  const indexResult = await db
    .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")
    .all<{ sql: string }>();

  if (indexResult.results.length > 0) {
    parts.push('-- ------------------------------------------------------------');
    parts.push(`-- Indexes (${siteId})`);
    parts.push('-- ------------------------------------------------------------');
    for (const idx of indexResult.results) {
      if (idx.sql) {
        parts.push(idx.sql + ';');
      }
    }
    parts.push('');
  }

  return { parts, tableCount, rowCount };
}

/** 創建數據庫備份 (僅導出當前站點數據庫為 SQL 並上傳到 R2) */
export async function handleCreateBackup(
  db: D1Database,
  kv: KVNamespace,
  siteId: string,
  s3Secrets?: S3Secrets,
  options?: { excludeLogData?: boolean },
): Promise<Response> {
  const s3Config = await getS3Config(db, kv, s3Secrets);
  if (!s3Config) {
    return err('S3 存儲未配置，請先在存儲設置中配置', 1005);
  }

  try {
    const now = nowStr();
    const timestamp = now.replace(/[: ]/g, '').replace(/[-]/g, '');
    // 格式: {siteId}_backup_YYYYMMDDHHmmss.sql（站點前綴區分不同站數據庫）
    const backupName = `${siteId}_backup_${timestamp}.sql`;
    const backupKey = BACKUP_PREFIX + backupName;

    const excludeLogData = options?.excludeLogData ?? false;

    // 生成 SQL 內容 — 僅導出當前站點
    const { parts: dumpParts, tableCount, rowCount } = await dumpDatabaseTables(db, siteId, excludeLogData);

    const parts: string[] = [];
    parts.push('-- ============================================================');
    parts.push('-- Cloudflare CMS Database Backup');
    parts.push(`-- Generated: ${now}`);
    parts.push(`-- Site: ${siteId}`);
    parts.push(`-- Tables: ${tableCount} (with data)`);
    if (excludeLogData) {
      parts.push('-- Log data (ay_syslog) excluded — schema only');
    }
    parts.push('-- ============================================================');
    parts.push('');
    parts.push('PRAGMA foreign_keys=OFF;');
    parts.push('BEGIN TRANSACTION;');
    parts.push('');
    parts.push(...dumpParts);
    parts.push('COMMIT;');
    parts.push('');

    const sqlContent = parts.join('\n');
    const encoded = new TextEncoder().encode(sqlContent);
    // 複製為獨立的 ArrayBuffer (避免 ArrayBufferLike 類型問題)
    const data = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;

    // 上傳到 R2/S3
    await s3PutObject(s3Config, backupKey, data, 'application/sql');

    // 記錄備份日誌（寫入當前站點庫）
    try {
      await db.prepare(
        'INSERT INTO ay_syslog (level, event, user_ip, create_time, username) VALUES (?, ?, ?, ?, ?)',
      ).bind('admin', `數據庫備份創建: ${backupName} (${(data.byteLength / 1024).toFixed(2)} KB, ${siteId} 站點, ${tableCount} 表, ${rowCount} 行${excludeLogData ? ', 排除日誌數據' : ''})`, '127.0.0.1', now, 'system').run();
    } catch { /* 日誌寫入失敗不影響主流程 */ }

    return okData(
      {
        filename: backupName,
        key: backupKey,
        size: data.byteLength,
        sizeKB: (data.byteLength / 1024).toFixed(2),
        createdAt: now,
        site: siteId,
        totalTables: tableCount,
        totalRows: rowCount,
        excludeLogData,
      },
      '備份創建成功',
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知錯誤';
    return err(`備份創建失敗: ${msg}`, 1005);
  }
}

// ============================================================================
// 定時備份排程 (v1.9.37)
// 配置存儲在 ay_config（每站點獨立），Cron 每 15 分鐘檢查是否到期
// ============================================================================

/** 定時備份配置 */
interface BackupScheduleConfig {
  enabled: string;       // '0' | '1'
  frequency: string;     // 'daily' | 'weekly'
  time: string;          // 'HH:mm'
  weekday: string;       // '0'-'6' (0=週日, 1=週一, ..., 6=週六)，weekly 時使用
  keep: number;          // 保留備份數量
  lastRun: string;       // 上次執行時間 'YYYY-MM-DD HH:mm:ss'
  excludeLogs: string;   // '0' | '1' 備份時排除日誌數據
  logRetentionDays: number; // 日誌保留天數（0 = 不自動清理）
  lastLogCleanup: string;   // 上次日誌清理時間
}

/** 讀取定時備份配置 */
async function getBackupScheduleConfig(db: D1Database, kv: KVNamespace): Promise<BackupScheduleConfig> {
  const [enabled, frequency, time, weekday, keep, lastRun, excludeLogs, logRetentionDays, lastLogCleanup] = await Promise.all([
    getConfig(db, kv, 'backup_schedule_enabled', '0'),
    getConfig(db, kv, 'backup_schedule_frequency', 'daily'),
    getConfig(db, kv, 'backup_schedule_time', '03:00'),
    getConfig(db, kv, 'backup_schedule_weekday', '1'),
    getConfig(db, kv, 'backup_schedule_keep', '7'),
    getConfig(db, kv, 'backup_last_run', ''),
    getConfig(db, kv, 'backup_exclude_logs', '0'),
    getConfig(db, kv, 'log_retention_days', '30'),
    getConfig(db, kv, 'log_last_cleanup', ''),
  ]);
  return {
    enabled,
    frequency,
    time,
    weekday,
    keep: parseInt(keep, 10) || 7,
    lastRun,
    excludeLogs,
    logRetentionDays: parseInt(logRetentionDays, 10) || 0,
    lastLogCleanup,
  };
}

/** 獲取定時備份配置（API 響應） */
export async function handleGetBackupSchedule(
  db: D1Database,
  kv: KVNamespace,
): Promise<Response> {
  const config = await getBackupScheduleConfig(db, kv);
  return okData(config, '成功');
}

/** 更新定時備份配置（API 響應） */
export async function handleUpdateBackupSchedule(
  db: D1Database,
  kv: KVNamespace,
  body: { enabled?: string; frequency?: string; time?: string; weekday?: string; keep?: number; excludeLogs?: string; logRetentionDays?: number },
): Promise<Response> {
  const updates: Array<{ name: string; value: string }> = [];

  if (body.enabled !== undefined) updates.push({ name: 'backup_schedule_enabled', value: body.enabled });
  if (body.frequency !== undefined) updates.push({ name: 'backup_schedule_frequency', value: body.frequency });
  if (body.time !== undefined) updates.push({ name: 'backup_schedule_time', value: body.time });
  if (body.weekday !== undefined) updates.push({ name: 'backup_schedule_weekday', value: body.weekday });
  if (body.keep !== undefined) updates.push({ name: 'backup_schedule_keep', value: String(body.keep) });
  if (body.excludeLogs !== undefined) updates.push({ name: 'backup_exclude_logs', value: body.excludeLogs });
  if (body.logRetentionDays !== undefined) updates.push({ name: 'log_retention_days', value: String(body.logRetentionDays) });

  if (updates.length === 0) {
    return err('沒有需要更新的字段', 1001);
  }

  for (const item of updates) {
    // 先檢查是否存在，存在則 UPDATE，不存在則 INSERT
    const existing = await db.prepare('SELECT id FROM ay_config WHERE name = ?').bind(item.name).first<{ id: number }>();
    if (existing) {
      await db.prepare('UPDATE ay_config SET value = ? WHERE name = ?').bind(item.value, item.name).run();
    } else {
      await db.prepare('INSERT INTO ay_config (name, value, type, sorting, description) VALUES (?, ?, ?, ?, ?)')
        .bind(item.name, item.value, '1', 90, '定時備份配置').run();
    }
  }

  // 清除配置緩存
  await kv.delete('config:all');

  return ok('定時備份配置更新成功');
}

/**
 * 清理過期備份（按站點獨立保留最近 N 個）
 * 新格式 {siteId}_backup_*.sql 按站點前綴分組，每站保留 keepCount 個
 * 舊格式 backup_*.sql（無站點前綴）單獨保留 keepCount 個
 */
async function applyBackupRetention(
  db: D1Database,
  kv: KVNamespace,
  s3Secrets: S3Secrets | undefined,
  keepCount: number,
  siteId: string,
): Promise<number> {
  if (keepCount <= 0) return 0;

  const s3Config = await getS3Config(db, kv, s3Secrets);
  if (!s3Config) return 0;

  try {
    const result = await s3ListObjects(s3Config, BACKUP_PREFIX, 200, '');
    const allFiles = result.files.filter((f) => f.key.endsWith('.sql'));

    // 按站點前綴分組：新格式 {siteId}_backup_*.sql
    const sitePrefix = `${siteId}_backup_`;
    const siteBackups = allFiles
      .filter((f) => f.key.includes(sitePrefix))
      .sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));

    // 舊格式 backup_*.sql（無站點前綴，向後兼容）
    const legacyBackups = allFiles
      .filter((f) => !f.key.includes('_backup_') && f.key.match(/backup_\d{14}\.sql/))
      .sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));

    let deletedCount = 0;

    // 當前站點超出保留數量的刪除
    const siteToDelete = siteBackups.slice(keepCount);
    for (const f of siteToDelete) {
      try {
        await s3DeleteObject(s3Config, f.key);
        deletedCount++;
      } catch { /* 刪除失敗不影響主流程 */ }
    }

    // 舊格式備份也按 keepCount 清理（避免歷史文件堆積）
    const legacyToDelete = legacyBackups.slice(keepCount);
    for (const f of legacyToDelete) {
      try {
        await s3DeleteObject(s3Config, f.key);
        deletedCount++;
      } catch { /* 刪除失敗不影響主流程 */ }
    }

    return deletedCount;
  } catch {
    return 0;
  }
}

/**
 * 定時備份檢查（由 Cron 每 15 分鐘調用）
 * 檢查當前站點是否需要執行定時備份，若到期則執行
 */
export async function handleScheduledBackup(
  db: D1Database,
  kv: KVNamespace,
  siteId: string,
  s3Secrets?: S3Secrets,
): Promise<void> {
  const config = await getBackupScheduleConfig(db, kv);
  if (config.enabled !== '1') return;

  // 當前香港時間
  const now = new Date();
  const hkStr = now.toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' });
  // 格式: YYYY-MM-DD HH:mm:ss
  const currentDate = hkStr.slice(0, 10);
  const currentHour = parseInt(hkStr.slice(11, 13), 10);
  const currentMinute = parseInt(hkStr.slice(14, 16), 10);

  // 解析排程時間
  const [schedHour, schedMinute] = config.time.split(':').map(Number);
  const isPastScheduledTime = currentHour > schedHour || (currentHour === schedHour && currentMinute >= schedMinute);

  let isDue = false;

  // 當前星期幾 (0=週日, 1=週一, ..., 6=週六)
  const currentDayOfWeek = now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', weekday: 'short' });
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const currentWeekday = dayMap[currentDayOfWeek] ?? 0;

  if (config.frequency === 'daily') {
    // 每日：當天尚未執行且已過排程時間
    const lastRunDate = config.lastRun.slice(0, 10);
    if (lastRunDate !== currentDate && isPastScheduledTime) {
      isDue = true;
    }
  } else if (config.frequency === 'weekly') {
    // 每週：指定星期幾 + 當天尚未執行 + 已過排程時間
    const schedWeekday = parseInt(config.weekday, 10) || 1;
    if (currentWeekday === schedWeekday && isPastScheduledTime) {
      const lastRunDate = config.lastRun.slice(0, 10);
      if (lastRunDate !== currentDate) {
        isDue = true;
      }
    }
  }

  if (!isDue) return;

  // 執行備份
  try {
    const s3Config = await getS3Config(db, kv, s3Secrets);
    if (!s3Config) {
      console.error(`[ScheduledBackup] ${siteId}: S3 存儲未配置，跳過`);
      return;
    }

    const nowHk = nowStr();
    const timestamp = nowHk.replace(/[: ]/g, '').replace(/[-]/g, '');
    // 格式: {siteId}_backup_YYYYMMDDHHmmss.sql（站點前綴區分不同站數據庫）
    const backupName = `${siteId}_backup_${timestamp}.sql`;
    const backupKey = BACKUP_PREFIX + backupName;

    const excludeLogData = config.excludeLogs === '1';
    const { parts: dumpParts, tableCount, rowCount } = await dumpDatabaseTables(db, siteId, excludeLogData);

    const parts: string[] = [];
    parts.push('-- ============================================================');
    parts.push('-- Cloudflare CMS Database Backup (Scheduled)');
    parts.push(`-- Generated: ${nowHk}`);
    parts.push(`-- Site: ${siteId}`);
    parts.push(`-- Tables: ${tableCount} (with data)`);
    if (excludeLogData) {
      parts.push('-- Log data (ay_syslog) excluded — schema only');
    }
    parts.push('-- ============================================================');
    parts.push('');
    parts.push('PRAGMA foreign_keys=OFF;');
    parts.push('BEGIN TRANSACTION;');
    parts.push('');
    parts.push(...dumpParts);
    parts.push('COMMIT;');
    parts.push('');

    const sqlContent = parts.join('\n');
    const encoded = new TextEncoder().encode(sqlContent);
    const data = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;

    await s3PutObject(s3Config, backupKey, data, 'application/sql');

    // 更新 last_run
    const existing = await db.prepare('SELECT id FROM ay_config WHERE name = ?').bind('backup_last_run').first<{ id: number }>();
    if (existing) {
      await db.prepare('UPDATE ay_config SET value = ? WHERE name = ?').bind(nowHk, 'backup_last_run').run();
    } else {
      await db.prepare('INSERT INTO ay_config (name, value, type, sorting, description) VALUES (?, ?, ?, ?, ?)')
        .bind('backup_last_run', nowHk, '1', 94, '上次定時備份執行時間').run();
    }
    await kv.delete('config:all');

    // 記錄日誌
    try {
      await db.prepare(
        'INSERT INTO ay_syslog (level, event, user_ip, create_time, username) VALUES (?, ?, ?, ?, ?)',
      ).bind('admin', `定時備份: ${backupName} (${(data.byteLength / 1024).toFixed(2)} KB, ${siteId}, ${tableCount} 表, ${rowCount} 行${excludeLogData ? ', 排除日誌數據' : ''})`, '127.0.0.1', nowHk, 'system').run();
    } catch { /* 日誌寫入失敗不影響主流程 */ }

    // 清理過期備份（按站點獨立保留）
    const deleted = await applyBackupRetention(db, kv, s3Secrets, config.keep, siteId);
    if (deleted > 0) {
      console.log(`[ScheduledBackup] ${siteId}: 清理了 ${deleted} 個過期備份`);
    }

    // 定時日誌清理（v1.9.45）：每天最多執行一次，保留最近 N 天日誌
    await handleScheduledLogCleanup(db, kv, config.logRetentionDays, siteId);
  } catch (e) {
    console.error(`[ScheduledBackup] ${siteId}: 備份失敗:`, e);
  }
}

// ============================================================================
// 日誌清理機制 (v1.9.45)
// 支持手動清理 + Cron 定時自動清理，保留最近 N 天日誌
// ============================================================================

/**
 * 手動清理舊日誌 (API 響應)
 * @param days 保留最近 N 天日誌，刪除更早的記錄
 */
export async function handleCleanupLogs(
  db: D1Database,
  kv: KVNamespace,
  days: number,
): Promise<Response> {
  if (!days || days < 1) {
    return err('保留天數必須大於 0', 1001);
  }
  if (days > 365) {
    return err('保留天數不能超過 365', 1001);
  }

  try {
    // 計算截止日期（香港時區）
    const now = new Date();
    const hkStr = now.toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' });
    const cutoff = new Date(hkStr);
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' });

    // 先查詢將要刪除的記錄數
    const countResult = await db
      .prepare('SELECT COUNT(*) as cnt FROM ay_syslog WHERE create_time < ?')
      .bind(cutoffStr)
      .first<{ cnt: number }>();
    const deleteCount = countResult?.cnt ?? 0;

    if (deleteCount === 0) {
      return okData({ deleted: 0, cutoff: cutoffStr }, '沒有需要清理的舊日誌');
    }

    // 執行刪除
    await db.prepare('DELETE FROM ay_syslog WHERE create_time < ?').bind(cutoffStr).run();

    // 記錄清理操作本身（使用當前時間）
    const nowHk = nowStr();
    try {
      await db.prepare(
        'INSERT INTO ay_syslog (level, event, user_ip, create_time, username) VALUES (?, ?, ?, ?, ?)',
      ).bind('admin', `日誌清理: 刪除 ${deleteCount} 條 ${days} 天前的舊日誌（截止 ${cutoffStr}）`, '127.0.0.1', nowHk, 'system').run();
    } catch { /* 日誌寫入失敗不影響主流程 */ }

    // 清除配置緩存
    await kv.delete('config:all');

    return okData({ deleted: deleteCount, cutoff: cutoffStr }, `成功清理 ${deleteCount} 條舊日誌`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知錯誤';
    return err(`日誌清理失敗: ${msg}`, 1005);
  }
}

/**
 * 獲取日誌統計信息 (API 響應)
 * 返回總日誌數、各級別數量、最早/最新記錄時間
 */
export async function handleGetLogStats(db: D1Database): Promise<Response> {
  try {
    const totalResult = await db.prepare('SELECT COUNT(*) as total FROM ay_syslog').first<{ total: number }>();

    // 分級別統計（單獨查詢避免 compound SELECT 過多）
    const levelResult = await db
      .prepare('SELECT level, COUNT(*) as cnt FROM ay_syslog GROUP BY level ORDER BY cnt DESC')
      .all<{ level: string; cnt: number }>();

    const earliestResult = await db
      .prepare('SELECT create_time FROM ay_syslog ORDER BY id ASC LIMIT 1')
      .first<{ create_time: string }>();

    const latestResult = await db
      .prepare('SELECT create_time FROM ay_syslog ORDER BY id DESC LIMIT 1')
      .first<{ create_time: string }>();

    return okData({
      total: totalResult?.total ?? 0,
      levels: levelResult.results,
      earliest: earliestResult?.create_time ?? '',
      latest: latestResult?.create_time ?? '',
    }, '成功');
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知錯誤';
    return err(`獲取日誌統計失敗: ${msg}`, 1005);
  }
}

/**
 * 定時日誌清理（Cron 調用，每天最多執行一次）
 * 在 handleScheduledBackup 之後調用，利用已有的定時備份觸發週期
 */
async function handleScheduledLogCleanup(
  db: D1Database,
  kv: KVNamespace,
  retentionDays: number,
  siteId: string,
): Promise<void> {
  // logRetentionDays = 0 表示不自動清理
  if (retentionDays <= 0) return;

  try {
    // 檢查今天是否已經清理過（每天最多一次）
    const now = new Date();
    const hkStr = now.toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' });
    const today = hkStr.slice(0, 10);

    // 讀取上次清理日期
    const lastCleanup = await getConfig(db, kv, 'log_last_cleanup', '');
    if (lastCleanup.slice(0, 10) === today) return; // 今天已清理

    // 計算截止日期
    const cutoff = new Date(hkStr);
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' });

    // 先查詢將要刪除的記錄數
    const countResult = await db
      .prepare('SELECT COUNT(*) as cnt FROM ay_syslog WHERE create_time < ?')
      .bind(cutoffStr)
      .first<{ cnt: number }>();
    const deleteCount = countResult?.cnt ?? 0;

    if (deleteCount === 0) {
      // 沒有需要清理的記錄，仍然更新 last_cleanup 避免重複查詢
      await updateLogCleanupTimestamp(db, kv, hkStr);
      return;
    }

    // 執行刪除
    await db.prepare('DELETE FROM ay_syslog WHERE create_time < ?').bind(cutoffStr).run();

    // 更新清理時間戳
    await updateLogCleanupTimestamp(db, kv, hkStr);

    // 記錄清理日誌
    try {
      await db.prepare(
        'INSERT INTO ay_syslog (level, event, user_ip, create_time, username) VALUES (?, ?, ?, ?, ?)',
      ).bind('admin', `定時日誌清理: 刪除 ${deleteCount} 條 ${retentionDays} 天前的舊日誌（${siteId} 站點）`, '127.0.0.1', hkStr, 'system').run();
    } catch { /* 日誌寫入失敗不影響主流程 */ }

    console.log(`[LogCleanup] ${siteId}: 清理了 ${deleteCount} 條舊日誌（保留 ${retentionDays} 天）`);
  } catch (e) {
    console.error(`[LogCleanup] ${siteId}: 日誌清理失敗:`, e);
  }
}

/** 更新日誌清理時間戳到 ay_config */
async function updateLogCleanupTimestamp(db: D1Database, kv: KVNamespace, timestamp: string): Promise<void> {
  const existing = await db.prepare('SELECT id FROM ay_config WHERE name = ?').bind('log_last_cleanup').first<{ id: number }>();
  if (existing) {
    await db.prepare('UPDATE ay_config SET value = ? WHERE name = ?').bind(timestamp, 'log_last_cleanup').run();
  } else {
    await db.prepare('INSERT INTO ay_config (name, value, type, sorting, description) VALUES (?, ?, ?, ?, ?)')
      .bind('log_last_cleanup', timestamp, '1', 95, '上次日誌清理執行時間').run();
  }
  await kv.delete('config:all');
}

/** 下載備份文件 (從 R2/S3 存儲) */
export async function handleDownloadBackup(
  db: D1Database,
  kv: KVNamespace,
  filename: string,
  s3Secrets?: S3Secrets,
): Promise<Response> {
  const safeFilename = sanitizeBackupFilename(filename);
  if (!safeFilename) {
    return err('無效的文件名', 1001);
  }

  const s3Config = await getS3Config(db, kv, s3Secrets);
  if (!s3Config) {
    return err('S3 存儲未配置', 1005);
  }

  const backupKey = BACKUP_PREFIX + safeFilename;

  try {
    const { data } = await s3GetObject(s3Config, backupKey);
    return new Response(data, {
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知錯誤';
    return err(`下載備份失敗: ${msg}`, 1004);
  }
}

/** 刪除備份文件 (從 R2/S3 存儲) */
export async function handleDeleteBackup(
  db: D1Database,
  kv: KVNamespace,
  filename: string,
  s3Secrets?: S3Secrets,
): Promise<Response> {
  const safeFilename = sanitizeBackupFilename(filename);
  if (!safeFilename) {
    return err('無效的文件名', 1001);
  }

  const s3Config = await getS3Config(db, kv, s3Secrets);
  if (!s3Config) {
    return err('S3 存儲未配置', 1005);
  }

  const backupKey = BACKUP_PREFIX + safeFilename;

  try {
    await s3DeleteObject(s3Config, backupKey);
    return ok('備份刪除成功');
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知錯誤';
    return err(`刪除備份失敗: ${msg}`, 1005);
  }
}
