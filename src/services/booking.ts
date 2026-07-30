/**
 * 講座預約管理服務
 *
 * 兩個模塊：
 * 1. 日曆圖片 (ay_booking_calendar) — 月度日曆 WebP 圖片管理
 * 2. 預約排期 (ay_booking_schedule) — 可預約日期、時段、服務類型、地點管理
 *
 * 僅 smile 站點使用。
 * 公開 API 僅提供 GET（外部廣告網站 https://smile.hkcmereye.com/ 拉取數據）。
 * POST/PUT/DELETE 僅限 Worker 內部管理操作（需 JWT 認證）。
 *
 * 服務類型與地點約束（對齊前端 Vue 組件 preaching-seat.vue）：
 *   '1' = SMILE Pro 2.0  → 旺角('1') + 中環('2')
 *   '2' = SMILE+ICL       → 僅中環('2')
 *   '3' = 老花矯視        → 僅旺角('1')
 *
 * 時段格式：'HH:mm-HH:mm'（如 '13:30-14:30'），非上午/下午
 */

import type { D1Database } from '@cloudflare/workers-types';
import { ok, okData, okList, err } from '../utils/response';
import { nowStr } from '../utils/datetime';
import { fromQuery, offset } from '../utils/pagination';
import { createMeta } from '../utils/response';

// ============================================================================
// 常量定義
// ============================================================================

/** 服務類型標籤 */
const SERVICE_TYPE_LABELS: Record<string, string> = {
  '1': 'SMILE Pro 2.0',
  '2': 'SMILE+ICL',
  '3': '老花矯視',
};

/** 地點標籤 */
const LOCATION_LABELS: Record<string, string> = {
  '1': '旺角',
  '2': '中環',
};

/**
 * 服務類型 → 允許的地點列表
 * SMILE Pro 2.0 支持旺角+中環，SMILE+ICL 僅中環，老花矯視僅旺角
 */
const SERVICE_LOCATION_CONSTRAINTS: Record<string, string[]> = {
  '1': ['1', '2'],  // SMILE Pro 2.0 → 旺角 + 中環
  '2': ['2'],       // SMILE+ICL → 中環
  '3': ['1'],       // 老花矯視 → 旺角
};

/**
 * 預設時段選項（對齊日曆圖片中的實際時段）
 * 格式：'HH:mm-HH:mm'
 */
const TIME_SLOT_PRESETS = [
  '13:30-14:30',
  '14:30-15:30',
  '15:30-16:30',
  '18:30-19:30',
];

/** 星期標籤（用於 API 響應，方便前端展示） */
const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

/**
 * 根據服務類型推導地點
 * Service 1 (SMILE Pro 2.0) 需用戶選擇，傳入 location 使用
 * Service 2 (SMILE+ICL) → 中環('2')
 * Service 3 (老花矯視) → 旺角('1')
 */
function deriveLocation(serviceType: string, explicitLocation?: string): string {
  const allowed = SERVICE_LOCATION_CONSTRAINTS[serviceType];
  if (!allowed) return '1';
  // 單一地點直接返回
  if (allowed.length === 1) return allowed[0];
  // 多地點：使用顯式傳入值，否則默認第一個
  if (explicitLocation && allowed.includes(explicitLocation)) return explicitLocation;
  return allowed[0];
}

/** 計算日期對應的星期 */
function getWeekday(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay();
    return WEEKDAY_LABELS[day] ?? '';
  } catch {
    return '';
  }
}

/**
 * 將 time_slot "13:30-14:30" 轉為 Vue 前端使用的顯示格式 "1:30 下午"
 * 僅取開始時間，12 小時制 + 上午/下午，對齊 preaching-seat.vue 的 morningOrAfternoon
 */
function formatTimeSlotDisplay(timeSlot: string): string {
  const start = timeSlot.split('-')[0];
  const match = start.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeSlot;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const period = h < 12 ? '上午' : '下午';
  const h12 = h === 0 ? 12 : (h <= 12 ? h : h - 12);
  return `${h12}:${m} ${period}`;
}

/**
 * 構建講座名稱（對齊 Vue preaching-seat.vue 的 getName() 返回值）
 * 正常場："{服務名} 講座-{地點}"，如 "SMILE Pro 2.0 講座-旺角"
 * 特別場："{服務名} 講座 ({特別場標籤})-{地點}"，如 "老花矯視講座 (LBV特別場)-旺角"
 */
function buildLectureName(serviceType: string, location: string, isSpecial: string, specialLabel: string): string {
  const serviceLabel = SERVICE_TYPE_LABELS[serviceType] ?? serviceType;
  const locLabel = LOCATION_LABELS[location] ?? location;
  if (isSpecial === '1' && specialLabel) {
    return `${serviceLabel} 講座 (${specialLabel})-${locLabel}`;
  }
  return `${serviceLabel} 講座-${locLabel}`;
}

// ============================================================================
// 模塊 1: 日曆圖片 (ay_booking_calendar)
// ============================================================================

/** 後台日曆圖片列表（分頁） */
export async function handleAdminListBookingCalendars(
  db: D1Database,
  params: URLSearchParams,
): Promise<Response> {
  const pagination = fromQuery(params);
  const status = params.get('status') || '';

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (status) {
    conditions.push('status = ?');
    binds.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const off = offset(pagination);

  const listSql = `SELECT * FROM ay_booking_calendar ${whereClause} ORDER BY sorting ASC, id ASC LIMIT ? OFFSET ?`;
  const listResult = await db.prepare(listSql).bind(...binds, pagination.pagesize, off).all();

  const countSql = `SELECT COUNT(*) as total FROM ay_booking_calendar ${whereClause}`;
  const countResult = await db.prepare(countSql).bind(...binds).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  return okList(listResult.results, createMeta(pagination.page, pagination.pagesize, total), '成功');
}

/** 新增日曆圖片 */
export async function handleCreateBookingCalendar(
  db: D1Database,
  body: { pic?: string; title?: string; sorting?: number; status?: string },
  acode: string = 'smile',
): Promise<Response> {
  const now = nowStr();
  const sorting = typeof body.sorting === 'number' ? body.sorting : 255;

  const result = await db.prepare(
    'INSERT INTO ay_booking_calendar (acode, pic, title, sorting, status, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    acode,
    body.pic || '',
    body.title || '',
    sorting,
    body.status || '1',
    now,
    now,
  ).run();

  if (result.meta.changes > 0) {
    return ok('日曆圖片創建成功');
  }
  return err('日曆圖片創建失敗', 1005);
}

/** 修改日曆圖片（白名單字段動態 UPDATE） */
export async function handleUpdateBookingCalendar(
  db: D1Database,
  id: number,
  body: Record<string, unknown>,
): Promise<Response> {
  const now = nowStr();
  const allowedFields = ['pic', 'title', 'sorting', 'status'];

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

  sets.push('update_time = ?');
  binds.push(now);
  binds.push(id);

  const sql = `UPDATE ay_booking_calendar SET ${sets.join(', ')} WHERE id = ?`;
  await db.prepare(sql).bind(...binds).run();

  return ok('日曆圖片更新成功');
}

/** 批量更新日曆圖片排序 */
export async function handleBatchUpdateCalendarSorting(
  db: D1Database,
  items: { id: number; sorting: number }[],
): Promise<Response> {
  if (!items.length) return err('沒有需要更新的項目', 1001);
  const stmts = items.map((item) =>
    db.prepare('UPDATE ay_booking_calendar SET sorting = ? WHERE id = ?').bind(item.sorting, item.id),
  );
  await db.batch(stmts);
  return ok('排序更新成功');
}

/** 刪除日曆圖片 */
export async function handleDeleteBookingCalendar(db: D1Database, id: number): Promise<Response> {
  await db.prepare('DELETE FROM ay_booking_calendar WHERE id = ?').bind(id).run();
  return ok('日曆圖片刪除成功');
}

/** 公開日曆圖片列表（僅返回 status='1' 的可見圖片） */
export async function handleListBookingCalendars(
  db: D1Database,
): Promise<Response> {
  const result = await db.prepare(
    `SELECT id, pic, title, sorting FROM ay_booking_calendar WHERE (status = '1' OR status IS NULL) ORDER BY sorting ASC, id ASC`,
  ).all();
  return okData(result.results, '成功');
}

// ============================================================================
// 模塊 2: 預約排期 (ay_booking_schedule)
// ============================================================================

/** 後台預約排期列表（分頁 + 篩選） */
export async function handleAdminListBookingSchedules(
  db: D1Database,
  params: URLSearchParams,
): Promise<Response> {
  const pagination = fromQuery(params);
  const serviceType = params.get('service_type') || '';
  const location = params.get('location') || '';
  const bookingDate = params.get('booking_date') || '';
  const dateFrom = params.get('date_from') || '';
  const dateTo = params.get('date_to') || '';
  const status = params.get('status') || '';

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (serviceType) {
    conditions.push('service_type = ?');
    binds.push(serviceType);
  }
  if (location) {
    conditions.push('location = ?');
    binds.push(location);
  }
  if (bookingDate) {
    conditions.push('booking_date = ?');
    binds.push(bookingDate);
  }
  if (dateFrom) {
    conditions.push('booking_date >= ?');
    binds.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('booking_date <= ?');
    binds.push(dateTo);
  }
  if (status) {
    conditions.push('status = ?');
    binds.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const off = offset(pagination);

  const listSql = `SELECT * FROM ay_booking_schedule ${whereClause} ORDER BY booking_date ASC, sorting ASC, id ASC LIMIT ? OFFSET ?`;
  const listResult = await db.prepare(listSql).bind(...binds, pagination.pagesize, off).all();

  const countSql = `SELECT COUNT(*) as total FROM ay_booking_schedule ${whereClause}`;
  const countResult = await db.prepare(countSql).bind(...binds).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  return okList(listResult.results, createMeta(pagination.page, pagination.pagesize, total), '成功');
}

/** 新增預約排期 */
export async function handleCreateBookingSchedule(
  db: D1Database,
  body: {
    service_type?: string;
    location?: string;
    booking_date?: string;
    time_slot?: string;
    is_special?: string;
    special_label?: string;
    status?: string;
    sorting?: number;
  },
  acode: string = 'smile',
): Promise<Response> {
  const now = nowStr();
  const sorting = typeof body.sorting === 'number' ? body.sorting : 255;
  const serviceType = body.service_type || '1';

  // 根據服務類型推導地點
  const location = deriveLocation(serviceType, body.location);

  const result = await db.prepare(
    `INSERT INTO ay_booking_schedule (acode, service_type, location, booking_date, time_slot, is_special, special_label, status, sorting, create_time, update_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    acode,
    serviceType,
    location,
    body.booking_date || '',
    body.time_slot || '13:30-14:30',
    body.is_special || '0',
    body.special_label || '',
    body.status || '1',
    sorting,
    now,
    now,
  ).run();

  if (result.meta.changes > 0) {
    return ok('排期創建成功');
  }
  return err('排期創建失敗', 1005);
}

/** 批量新增預約排期（批量框選日期+時段統一創建） */
export async function handleBatchCreateBookingSchedules(
  db: D1Database,
  body: {
    service_type: string;
    location?: string;
    dates: string[];
    time_slots: string[];
    is_special?: string;
    special_label?: string;
    status?: string;
  },
  acode: string = 'smile',
): Promise<Response> {
  if (!body.dates?.length || !body.time_slots?.length) {
    return err('日期和時段不能為空', 1001);
  }

  const now = nowStr();
  const serviceType = body.service_type || '1';
  const location = deriveLocation(serviceType, body.location);
  const isSpecial = body.is_special || '0';
  const specialLabel = body.special_label || '';
  const status = body.status || '1';

  // 構建批量 INSERT 語句
  const stmts = [];
  for (const date of body.dates) {
    for (const slot of body.time_slots) {
      stmts.push(
        db.prepare(
          `INSERT INTO ay_booking_schedule (acode, service_type, location, booking_date, time_slot, is_special, special_label, status, sorting, create_time, update_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(acode, serviceType, location, date, slot, isSpecial, specialLabel, status, 255, now, now),
      );
    }
  }

  await db.batch(stmts);
  return ok(`批量創建 ${stmts.length} 條排期成功`);
}

/** 修改預約排期（白名單字段動態 UPDATE） */
export async function handleUpdateBookingSchedule(
  db: D1Database,
  id: number,
  body: Record<string, unknown>,
): Promise<Response> {
  const now = nowStr();
  const allowedFields = ['service_type', 'location', 'booking_date', 'time_slot', 'is_special', 'special_label', 'status', 'sorting'];

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

  // 若更新了 service_type，自動校正 location
  if (body.service_type && !body.location) {
    const derived = deriveLocation(String(body.service_type));
    sets.push('location = ?');
    binds.push(derived);
  }

  sets.push('update_time = ?');
  binds.push(now);
  binds.push(id);

  const sql = `UPDATE ay_booking_schedule SET ${sets.join(', ')} WHERE id = ?`;
  await db.prepare(sql).bind(...binds).run();

  return ok('排期更新成功');
}

/** 批量更新排期排序 */
export async function handleBatchUpdateScheduleSorting(
  db: D1Database,
  items: { id: number; sorting: number }[],
): Promise<Response> {
  if (!items.length) return err('沒有需要更新的項目', 1001);
  const stmts = items.map((item) =>
    db.prepare('UPDATE ay_booking_schedule SET sorting = ? WHERE id = ?').bind(item.sorting, item.id),
  );
  await db.batch(stmts);
  return ok('排序更新成功');
}

/** 刪除預約排期 */
export async function handleDeleteBookingSchedule(db: D1Database, id: number): Promise<Response> {
  await db.prepare('DELETE FROM ay_booking_schedule WHERE id = ?').bind(id).run();
  return ok('排期刪除成功');
}

/** 批量刪除預約排期 */
export async function handleBatchDeleteBookingSchedules(
  db: D1Database,
  ids: number[],
): Promise<Response> {
  if (!ids.length) return err('沒有需要刪除的項目', 1001);
  const placeholders = ids.map(() => '?').join(',');
  await db.prepare(`DELETE FROM ay_booking_schedule WHERE id IN (${placeholders})`).bind(...ids).run();
  return ok(`已刪除 ${ids.length} 條排期`);
}

/**
 * 公開預約排期列表
 *
 * 支持篩選：service_type / location / date_from / date_to
 * 默認僅返回今天及之後的排期（外部網站不需要過期數據），可通過 date_from 覆蓋
 *
 * 響應中注入人類可讀標籤（service_type_label / location_label / weekday），
 * 外部前端開發者無需自行維護代碼對照表
 */
export async function handleListBookingSchedules(
  db: D1Database,
  params: URLSearchParams,
): Promise<Response> {
  const serviceType = params.get('service_type') || '';
  const location = params.get('location') || '';
  const dateFrom = params.get('date_from') || '';
  const dateTo = params.get('date_to') || '';

  const conditions = ["(status = '1' OR status IS NULL)"];
  const binds: (string | number)[] = [];

  // 默認僅返回今天及之後的排期（除非顯式傳入 date_from）
  if (dateFrom) {
    conditions.push('booking_date >= ?');
    binds.push(dateFrom);
  } else {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Hong_Kong' });
    conditions.push('booking_date >= ?');
    binds.push(today);
  }
  if (dateTo) {
    conditions.push('booking_date <= ?');
    binds.push(dateTo);
  }
  if (serviceType) {
    conditions.push('service_type = ?');
    binds.push(serviceType);
  }
  if (location) {
    conditions.push('location = ?');
    binds.push(location);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const result = await db.prepare(
    `SELECT id, service_type, location, booking_date, time_slot, is_special, special_label FROM ay_booking_schedule ${whereClause} ORDER BY booking_date ASC, sorting ASC, id ASC`,
  ).bind(...binds).all();

  // 注入人類可讀標籤 + 星期信息 + 講座名稱 + 時段顯示格式
  // 前端可直接使用 name 和 time_slot_display，無需自行維護代碼對照表
  const data = result.results.map((row) => {
    const r = row as Record<string, unknown>;
    const st = String(r.service_type ?? '');
    const loc = String(r.location ?? '');
    const dateStr = String(r.booking_date ?? '');
    const isSpecial = String(r.is_special ?? '0');
    const specialLabel = String(r.special_label ?? '');
    const timeSlot = String(r.time_slot ?? '');
    return {
      id: r.id,
      service_type: st,
      service_type_label: SERVICE_TYPE_LABELS[st] ?? st,
      location: loc,
      location_label: LOCATION_LABELS[loc] ?? loc,
      booking_date: dateStr,
      weekday: getWeekday(dateStr),
      time_slot: timeSlot,
      time_slot_display: formatTimeSlotDisplay(timeSlot),
      is_special: isSpecial,
      special_label: specialLabel,
      name: buildLectureName(st, loc, isSpecial, specialLabel),
    };
  });

  return okData(data, '成功');
}

/**
 * 公開服務列表（供前端動態構建下拉選單）
 *
 * 返回每個服務類型及其允許的地點列表，
 * 前端可據此動態渲染服務下拉和地點下拉（含聯動過濾）
 */
export async function handleListBookingServices(): Promise<Response> {
  const services = Object.entries(SERVICE_TYPE_LABELS).map(([type, label]) => ({
    service_type: type,
    service_type_label: label,
    locations: SERVICE_LOCATION_CONSTRAINTS[type].map((loc) => ({
      location: loc,
      location_label: LOCATION_LABELS[loc] ?? loc,
      name: `${label} 講座-${LOCATION_LABELS[loc] ?? loc}`,
    })),
  }));

  // 同時返回預設時段及其顯示格式，前端可用於時間展示和下拉選單
  return okData({
    services,
    time_slot_presets: TIME_SLOT_PRESETS.map((slot) => ({
      value: slot,
      label: formatTimeSlotDisplay(slot),
    })),
  }, '成功');
}
