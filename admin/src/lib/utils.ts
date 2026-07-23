import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 合併 Tailwind CSS class 名 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 格式化日期 */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '-'
  return date.replace('T', ' ').slice(0, 19)
}

// ============================================================================
// 共用欄目樹工具（多頁面複用，避免重複定義）
// ============================================================================

/** 欄目（分類）樹節點 — 全站統一接口 */
export interface Category {
  id: number
  name: string
  scode: string
  pcode: string
  status: string
  children?: Category[]
}

/** 將欄目樹扁平化為 scode -> name 的映射 */
export function flattenCategories(
  categories: Category[],
  map: Record<string, string> = {},
): Record<string, string> {
  for (const cat of categories) {
    map[cat.scode] = cat.name
    if (cat.children && cat.children.length > 0) {
      flattenCategories(cat.children, map)
    }
  }
  return map
}

/** 計算分頁頁碼（含省略號） */
export function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total]
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total]
  }
  return [1, '...', current - 1, current, current + 1, '...', total]
}
