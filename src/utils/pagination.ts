/**
 * 分頁工具
 */

export interface Pagination {
  page: number;
  pagesize: number;
}

/** 從 URL 查詢參數解析分頁 */
export function fromQuery(params: URLSearchParams): Pagination {
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const pagesize = Math.min(100, Math.max(1, parseInt(params.get('pagesize') || '20', 10) || 20));
  return { page, pagesize };
}

/** 計算 SQL OFFSET */
export function offset(p: Pagination): number {
  return (p.page - 1) * p.pagesize;
}

/** 計算總頁數 */
export function totalPages(total: number, pagesize: number): number {
  if (total === 0 || pagesize === 0) return 0;
  return Math.ceil(total / pagesize);
}
