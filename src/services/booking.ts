/**
 * 講座預約管理服務
 *
 * 兩個模塊：
 * 1. 日曆圖片 (ay_booking_calendar) — 月度日曆 WebP 圖片管理
 * 2. 預約排期 (ay_booking_schedule) — 可預約日期、時段、服務類型管理
 *
 * 僅 smile 站點使用。
 * 公開 API 僅提供 GET（外部廣告網站 https://smile.hkcmereye.com/ 拉取數據）。
 * POST/PUT/DELETE 僅限 Worker 內部管理操作（需 JWT 認證）。
 */

import type { D1Database } from '@cloudflare/workers-types';
import { ok, okData, okList, err } from '../utils/response';
import { nowStr } from '../utils/datetime';
import { fromQuery, offset } from '../utils/pagination';
import { createMeta } from '../utils/response';

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
    max_seats?: number;
    status?: string;
    sorting?: number;
  },
  acode: string = 'smile',
): Promise<Response> {
  const now = nowStr();
  const sorting = typeof body.sorting === 'number' ? body.sorting : 255;

  // 根據 service_type 自動推導 location（若未提供）
  let location = body.location || '';
  if (!location && body.service_type) {
    // '1'=Smile Pro旺角→旺角('1'), '2'=Smile Pro中環→中環('2'), '3'=Smile中環→中環('2')
    location = body.service_type === '1' ? '1' : '2';
  }

  const result = await db.prepare(
    `INSERT INTO ay_booking_schedule (acode, service_type, location, booking_date, time_slot, max_seats, status, sorting, create_time, update_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    acode,
    body.service_type || '1',
    location,
    body.booking_date || '',
    body.time_slot || '上午',
    typeof body.max_seats === 'number' ? body.max_seats : 10,
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
    max_seats?: number;
    status?: string;
  },
  acode: string = 'smile',
): Promise<Response> {
  if (!body.dates?.length || !body.time_slots?.length) {
    return err('日期和時段不能為空', 1001);
  }

  const now = nowStr();
  let location = body.location || '';
  if (!location && body.service_type) {
    location = body.service_type === '1' ? '1' : '2';
  }

  const maxSeats = typeof body.max_seats === 'number' ? body.max_seats : 10;
  const status = body.status || '1';

  // 構建批量 INSERT 語句
  const stmts = [];
  for (const date of body.dates) {
    for (const slot of body.time_slots) {
      stmts.push(
        db.prepare(
          `INSERT INTO ay_booking_schedule (acode, service_type, location, booking_date, time_slot, max_seats, status, sorting, create_time, update_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(acode, body.service_type, location, date, slot, maxSeats, status, 255, now, now),
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
  const allowedFields = ['service_type', 'location', 'booking_date', 'time_slot', 'max_seats', 'status', 'sorting'];

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

/** 公開預約排期列表（支持 service_type / location 篩選） */
export async function handleListBookingSchedules(
  db: D1Database,
  params: URLSearchParams,
): Promise<Response> {
  const serviceType = params.get('service_type') || '';
  const location = params.get('location') || '';

  const conditions = ["(status = '1' OR status IS NULL)"];
  const binds: (string | number)[] = [];

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
    `SELECT id, service_type, location, booking_date, time_slot, max_seats, status FROM ay_booking_schedule ${whereClause} ORDER BY booking_date ASC, sorting ASC, id ASC`,
  ).bind(...binds).all();

  return okData(result.results, '成功');
}
