/**
 * API 客戶端 - JWT 認證 + 統一錯誤處理
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1'

/** 從 localStorage 獲取 token */
export function getToken(): string | null {
  return localStorage.getItem('cms_token')
}

/** 保存 token */
export function setToken(token: string): void {
  localStorage.setItem('cms_token', token)
}

/** 清除 token */
export function clearToken(): void {
  localStorage.removeItem('cms_token')
}

/** 統一 API 響應格式 */
export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data?: T
  meta?: { page: number; pagesize: number; total: number }
}

/** API 請求封裝 */
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('登錄已過期,請重新登錄')
  }

  const json: ApiResponse<T> = await res.json()
  if (json.code !== 0) {
    throw new Error(json.msg || '請求失敗')
  }
  return json
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
