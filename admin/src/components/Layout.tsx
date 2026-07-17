import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { clearToken } from '../lib/api'
import { cn } from '../lib/utils'

/** 導航項目 */
interface NavItem {
  to: string
  label: string
  icon: typeof FileText
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
      { to: '/contents', label: '內容列表', icon: FileText },
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
  // 預設所有分組展開
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

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
          {NAV_GROUPS.map((group) => {
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
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 pl-10 pr-6 py-2 text-sm transition-colors',
                            isActive
                              ? 'bg-secondary text-foreground font-medium'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )
                        }
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </NavLink>
                    ))}
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
