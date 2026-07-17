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
