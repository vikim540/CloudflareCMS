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

/** 用戶信息（登錄後緩存，用於側邊欄權限過濾） */
export interface UserInfo {
  id: number
  ucode: string
  username: string
  realname: string
  isSuper: boolean
  permissions: string[]
}

/** 保存用戶信息 */
export function setUserInfo(info: UserInfo): void {
  localStorage.setItem('cms_user', JSON.stringify(info))
}

/** 獲取用戶信息 */
export function getUserInfo(): UserInfo | null {
  const raw = localStorage.getItem('cms_user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserInfo
  } catch {
    return null
  }
}

/** 清除用戶信息 */
export function clearUserInfo(): void {
  localStorage.removeItem('cms_user')
}

/** 站點信息（多站點管理） */
export interface SiteInfo {
  siteId: string
  name: string
  binding: string
  databaseId: string
  databaseName: string
  domain: string
  region: string
  accessType: string
  status: string
  isPrimary: boolean
  sorting: number
}

const SITE_ID_KEY = 'cms_site_id'
const SITE_NAME_KEY = 'cms_site_name'
const SITES_KEY = 'cms_sites'

/** 獲取當前選中的站點 ID */
export function getCurrentSiteId(): string {
  return localStorage.getItem(SITE_ID_KEY) || 'endoscopy'
}

/** 獲取當前站點名稱 */
export function getCurrentSiteName(): string {
  return localStorage.getItem(SITE_NAME_KEY) || 'Endoscopy CMS'
}

/** 設置當前站點 */
export function setCurrentSite(siteId: string, siteName: string): void {
  localStorage.setItem(SITE_ID_KEY, siteId)
  localStorage.setItem(SITE_NAME_KEY, siteName)
}

/** 清除站點選擇 */
export function clearCurrentSite(): void {
  localStorage.removeItem(SITE_ID_KEY)
  localStorage.removeItem(SITE_NAME_KEY)
  localStorage.removeItem(SITES_KEY)
}

/** 緩存用戶可訪問的站點列表 */
export function setCachedSites(sites: SiteInfo[]): void {
  localStorage.setItem(SITES_KEY, JSON.stringify(sites))
}

/** 獲取緩存的站點列表 */
export function getCachedSites(): SiteInfo[] {
  const raw = localStorage.getItem(SITES_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as SiteInfo[]
  } catch {
    return []
  }
}

/** 統一 API 響應格式 */
export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data?: T
  meta?: { page: number; pagesize: number; total: number }
}

/** 全局重定向鎖 — 防止多個並發 401 同時觸發重定向導致無限刷新 */
let isRedirectingToLogin = false

/** 全局權限錯誤回調（由 Layout 設置，用於在頁面上顯示提示而非控制台報錯） */
let permissionDeniedCallback: ((msg: string) => void) | null = null

/** 設置全局權限錯誤回調 */
export function setPermissionDeniedCallback(cb: ((msg: string) => void) | null): void {
  permissionDeniedCallback = cb
}

/** API 請求封裝 */
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Site-Id': getCurrentSiteId(),
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  // 401 = 未認證/token過期 → 清除登入狀態並重定向到 login
  if (res.status === 401) {
    clearToken()
    clearUserInfo()
    const onLoginPage = window.location.pathname.replace(/\/+$/, '') === '/login'
    if (!onLoginPage && !isRedirectingToLogin) {
      isRedirectingToLogin = true
      window.location.href = '/login'
    }
    throw new Error('登錄已過期,請重新登錄')
  }

  // 403 = 權限拒絕 → 不登出，僅提示無權限
  if (res.status === 403) {
    const json: ApiResponse<T> = await res.json()
    const msg = json.msg || '無權限訪問此功能'
    // 觸發全局回調（Layout 會顯示 toast 提示）
    if (permissionDeniedCallback) {
      permissionDeniedCallback(msg)
    }
    throw new Error(msg)
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
