import { useState, useEffect, useMemo } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { api, clearToken } from '../lib/api'
import { cn } from '../lib/utils'

/** 模型數據結構 */
interface Model {
  id: number
  name: string
  mcode: string
  type: string // "1"=單頁, "2"=列表
  urlname: string
  status: string // "1"=啟用, "0"=禁用
  issystem: string
}

/** 導航項目 */
interface NavItem {
  to: string
  label: string
  icon: string // emoji 圖標
  /** 內容模型項目的 mcode，用於帶 query 參數時的 active 判斷 */
  mcode?: string
}

/** 導航分組 */
interface NavGroup {
  title: string
  icon: string // emoji 圖標
  items: NavItem[]
}

/** 側邊欄分組配置（與 Go CMS 結構對齊） */
const NAV_GROUPS: NavGroup[] = [
  {
    title: '全局配置',
    icon: '⚙️',
    items: [
      { to: '/settings', label: '配置參數', icon: '🎛️' },
      { to: '/models', label: '模型管理', icon: '📦' },
      { to: '/extfields', label: '模型欄位', icon: '🧩' },
    ],
  },
  {
    title: '基礎內容',
    icon: '🗄️',
    items: [
      { to: '/site', label: '站點信息', icon: '🌐' },
      { to: '/company', label: '公司信息', icon: '🏢' },
      { to: '/categories', label: '內容欄目', icon: '🗂️' },
    ],
  },
  {
    title: '文章內容',
    icon: '📄',
    items: [
      // 列表型模型子菜單在組件中動態注入（見 navGroups）
      { to: '/trash', label: '回收站', icon: '🗑️' },
    ],
  },
  {
    title: '擴展內容',
    icon: '📦',
    items: [
      { to: '/singles', label: '單頁管理', icon: '📄' },
      { to: '/links', label: '友情連結', icon: '🔗' },
      { to: '/slides', label: '幻燈片', icon: '🖼️' },
      { to: '/tags', label: '標籤管理', icon: '🏷️' },
      { to: '/labels', label: '自定義標籤', icon: '📑' },
      { to: '/messages', label: '留言管理', icon: '💬' },
      { to: '/media', label: '媒體庫', icon: '🖼️' },
    ],
  },
  {
    title: '系統管理',
    icon: '🛡️',
    items: [
      { to: '/users', label: '系統用戶', icon: '👥' },
      { to: '/roles', label: '角色管理', icon: '🔐' },
      { to: '/menus', label: '選單管理', icon: '📋' },
      { to: '/logs', label: '系統日誌', icon: '📜' },
      { to: '/database', label: '資料庫管理', icon: '🖥️' },
      { to: '/storage', label: '存儲設置', icon: '💾' },
    ],
  },
]

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  // 預設所有分組展開
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  // 模型列表（掛載時載入一次）
  const [models, setModels] = useState<Model[]>([])

  // 載入模型列表
  useEffect(() => {
    api
      .get<Model[]>('/admin/models/all')
      .then((res) => setModels(res.data ?? []))
      .catch(() => {
        /* 載入失敗時靜默處理，側邊欄僅顯示回收站 */
      })
  }, [])

  // 構建導航分組（將動態模型注入「文章內容」分組前端，回收站保留末尾）
  const navGroups = useMemo<NavGroup[]>(() => {
    const contentModelItems: NavItem[] = models
      .filter((m) => m.type === '2' && m.status === '1')
      .map((m) => ({
        to: `/contents?mcode=${encodeURIComponent(m.mcode)}`,
        label: `${m.name}列表`,
        icon: '📰',
        mcode: m.mcode,
      }))
    return NAV_GROUPS.map((group) =>
      group.title === '文章內容'
        ? { ...group, items: [...contentModelItems, ...group.items] }
        : group,
    )
  }, [models])

  /** 判斷帶 mcode 的內容項目是否當前活躍（基於 query 參數比對） */
  const isContentItemActive = (itemMcode: string): boolean => {
    if (location.pathname !== '/contents') return false
    const params = new URLSearchParams(location.search)
    return (params.get('mcode') || '') === itemMcode
  }

  const handleLogout = async () => {
    try {
      await fetch(`${import.meta.env.VITE_API_BASE || '/api/v1'}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('cms_token')}` },
      })
    } catch {
      /* ignore */
    }
    clearToken()
    navigate('/login')
  }

  /** 切換分組展開/收起 */
  const toggleGroup = (title: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  return (
    <div className="flex h-screen">
      {/* 側邊欄 */}
      <aside className="w-56 bg-white border-r flex flex-col">
        <div className="h-14 flex items-center px-6 border-b">
          <span className="font-bold text-lg">CMS 管理後台</span>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {/* 儀表板（置頂，獨立項目） */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-6 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-secondary text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )
            }
          >
            <span className="text-base">📊</span>
            儀表板
          </NavLink>

          {/* 分組導航 */}
          {navGroups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.title)
            return (
              <div key={group.title} className="mt-1">
                {/* 分組標題（可點擊展開/收起） */}
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="w-full flex items-center gap-2 px-6 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="text-xs shrink-0">{isCollapsed ? '➡️' : '⬇️'}</span>
                  <span className="text-sm shrink-0">{group.icon}</span>
                  <span>{group.title}</span>
                </button>

                {/* 子項目 */}
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isContentItem = item.mcode !== undefined
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/'}
                          className={({ isActive }) => {
                            // 帶 mcode 的內容項目使用自定義 active 判斷（基於 query 參數）
                            const active = isContentItem
                              ? isContentItemActive(item.mcode!)
                              : isActive
                            return cn(
                              'flex items-center gap-3 pl-10 pr-6 py-2 text-sm transition-colors',
                              active
                                ? 'bg-secondary text-foreground font-medium'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                            )
                          }}
                        >
                          <span className="text-base">{item.icon}</span>
                          {item.label}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <div className="p-4 border-t">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
          >
            <span className="text-base">🚪</span>
            退出登錄
          </button>
        </div>
      </aside>

      {/* 主內容區 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
