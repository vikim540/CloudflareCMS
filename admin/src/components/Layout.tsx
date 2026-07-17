import { useState, useEffect, useMemo } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  FolderTree,
  Settings,
  HardDrive,
  Image as ImageIcon,
  LogOut,
  Link as LinkIcon,
  Tag,
  Bookmark,
  MessageSquare,
  Globe,
  Building,
  Boxes,
  Shield,
  Server,
  Database as DatabaseIcon,
  ChevronDown,
  ChevronRight,
  Trash2,
  Users,
  ShieldCheck,
  Menu as MenuIcon,
  ScrollText,
  Puzzle,
  SlidersHorizontal,
  Newspaper,
} from 'lucide-react'
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
  icon: typeof FileText
  /** 內容模型項目的 mcode，用於帶 query 參數時的 active 判斷 */
  mcode?: string
}

/** 導航分組 */
interface NavGroup {
  title: string
  icon: typeof FileText
  items: NavItem[]
}

/** 側邊欄分組配置（與 Go CMS 結構對齊） */
const NAV_GROUPS: NavGroup[] = [
  {
    title: '全局配置',
    icon: Settings,
    items: [
      { to: '/settings', label: '配置參數', icon: SlidersHorizontal },
      { to: '/models', label: '模型管理', icon: Boxes },
      { to: '/extfields', label: '模型欄位', icon: Puzzle },
    ],
  },
  {
    title: '基礎內容',
    icon: DatabaseIcon,
    items: [
      { to: '/site', label: '站點信息', icon: Globe },
      { to: '/company', label: '公司信息', icon: Building },
      { to: '/categories', label: '內容欄目', icon: FolderTree },
    ],
  },
  {
    title: '文章內容',
    icon: FileText,
    items: [
      // 列表型模型子菜單在組件中動態注入（見 navGroups）
      { to: '/trash', label: '回收站', icon: Trash2 },
    ],
  },
  {
    title: '擴展內容',
    icon: Boxes,
    items: [
      { to: '/singles', label: '單頁管理', icon: FileText },
      { to: '/links', label: '友情連結', icon: LinkIcon },
      { to: '/slides', label: '幻燈片', icon: ImageIcon },
      { to: '/tags', label: '標籤管理', icon: Tag },
      { to: '/labels', label: '自定義標籤', icon: Bookmark },
      { to: '/messages', label: '留言管理', icon: MessageSquare },
      { to: '/media', label: '媒體庫', icon: ImageIcon },
    ],
  },
  {
    title: '系統管理',
    icon: Shield,
    items: [
      { to: '/users', label: '系統用戶', icon: Users },
      { to: '/roles', label: '角色管理', icon: ShieldCheck },
      { to: '/menus', label: '選單管理', icon: MenuIcon },
      { to: '/logs', label: '系統日誌', icon: ScrollText },
      { to: '/database', label: '資料庫管理', icon: Server },
      { to: '/storage', label: '存儲設置', icon: HardDrive },
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
        icon: Newspaper,
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
            <LayoutDashboard className="w-4 h-4" />
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
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <group.icon className="w-3.5 h-3.5 shrink-0" />
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
                          <item.icon className="w-4 h-4" />
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
            <LogOut className="w-4 h-4" />
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
