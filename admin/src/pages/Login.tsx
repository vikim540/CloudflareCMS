import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken, setUserInfo } from '../lib/api'

/** Turnstile 全局類型聲明 */
declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string
        callback: (token: string) => void
        'expired-callback'?: () => void
        'error-callback'?: () => void
        theme?: 'light' | 'dark' | 'auto'
        language?: string
      }) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
    }
  }
}

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** 動態載入 Turnstile 腳本（僅載入一次） */
function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve()
      return
    }
    // 已有 script 標籤但尚未載入完成
    const existing = document.getElementById('turnstile-script')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Turnstile 腳本載入失敗')))
      return
    }
    const script = document.createElement('script')
    script.id = 'turnstile-script'
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Turnstile 腳本載入失敗'))
    document.head.appendChild(script)
  })
}

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Turnstile 狀態
  const [turnstileEnabled, setTurnstileEnabled] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('')
  const [turnstileReady, setTurnstileReady] = useState(false)
  const turnstileTokenRef = useRef<string>('')
  const turnstileWidgetIdRef = useRef<string | null>(null)
  const turnstileContainerRef = useRef<HTMLDivElement>(null)

  /** 渲染 Turnstile widget */
  const renderTurnstile = useCallback(() => {
    if (!window.turnstile || !turnstileContainerRef.current || !turnstileSiteKey) return

    // 清除舊 widget
    if (turnstileWidgetIdRef.current) {
      try {
        window.turnstile.remove(turnstileWidgetIdRef.current)
      } catch {
        /* 靜默處理 */
      }
      turnstileWidgetIdRef.current = null
    }

    turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: turnstileSiteKey,
      callback: (token: string) => {
        turnstileTokenRef.current = token
        setTurnstileReady(true)
      },
      'expired-callback': () => {
        turnstileTokenRef.current = ''
        setTurnstileReady(false)
      },
      'error-callback': () => {
        turnstileTokenRef.current = ''
        setTurnstileReady(false)
      },
      theme: 'light',
      language: 'zh-HK',
    })
  }, [turnstileSiteKey])

  /** 掛載時獲取 Turnstile 配置 */
  useEffect(() => {
    let cancelled = false

    api
      .get<{ enabled: boolean; siteKey: string }>('/auth/turnstile-config')
      .then(async (res) => {
        if (cancelled || !res.data?.enabled || !res.data.siteKey) return
        setTurnstileEnabled(true)
        setTurnstileSiteKey(res.data.siteKey)
        // 載入 Turnstile 腳本
        await loadTurnstileScript()
        if (cancelled) return
        // 腳本載入完成後渲染 widget
        setTimeout(renderTurnstile, 100)
      })
      .catch(() => {
        // 獲取配置失敗時靜默處理（不阻止登錄）
      })

    return () => {
      cancelled = true
      // 清理 widget
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current)
        } catch {
          /* 靜默處理 */
        }
      }
    }
  }, [renderTurnstile])

  /** siteKey 變更時重新渲染 */
  useEffect(() => {
    if (turnstileSiteKey && window.turnstile) {
      renderTurnstile()
    }
  }, [turnstileSiteKey, renderTurnstile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Turnstile 開啟時必須驗證
    if (turnstileEnabled && !turnstileTokenRef.current) {
      setError('請完成人機驗證')
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await api.post<{
        token: string
        user: {
          id: number
          ucode: string
          username: string
          realname: string
          isSuper: boolean
          permissions: string[]
        }
      }>('/auth/login', {
        username,
        password,
        turnstileToken: turnstileTokenRef.current || undefined,
      })
      setToken(res.data!.token)
      // 緩存用戶信息（用於側邊欄權限過濾）
      setUserInfo({
        id: res.data!.user.id,
        ucode: res.data!.user.ucode,
        username: res.data!.user.username,
        realname: res.data!.user.realname || '',
        isSuper: res.data!.user.isSuper,
        permissions: res.data!.user.permissions || [],
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登錄失敗')
      // 登錄失敗時重置 Turnstile widget
      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetIdRef.current)
        turnstileTokenRef.current = ''
        setTurnstileReady(false)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-lg shadow-sm border p-8">
          <h1 className="text-2xl font-bold text-center mb-6">CMS 管理後台</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">用戶名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="admin"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="******"
                required
              />
            </div>
            {/* Cloudflare Turnstile 人機驗證 */}
            {turnstileEnabled && (
              <div className="flex justify-center">
                <div ref={turnstileContainerRef} className="min-h-[65px]" />
              </div>
            )}
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || (turnstileEnabled && !turnstileReady)}
              className="w-full py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? '登錄中...' : '登錄'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
