import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { getToken, getUserInfo } from './lib/api'
import Layout from './components/Layout'
import Login from './pages/Login'
import ErrorBoundary from './components/ErrorBoundary'
import GlobalErrorToast from './components/GlobalErrorToast'

// P0-6: 路由級懶加載，減少首屏 bundle 體積，按需加載頁面組件
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Contents = lazy(() => import('./pages/Contents'))
const ContentEdit = lazy(() => import('./pages/ContentEdit'))
const Categories = lazy(() => import('./pages/Categories'))
const Singles = lazy(() => import('./pages/Singles'))
const SingleEdit = lazy(() => import('./pages/SingleEdit'))
const Links = lazy(() => import('./pages/Links'))
const Slides = lazy(() => import('./pages/Slides'))
const Booking = lazy(() => import('./pages/Booking'))
const InternalLinks = lazy(() => import('./pages/InternalLinks'))
const FormSubmissions = lazy(() => import('./pages/FormSubmissions'))
const FormManager = lazy(() => import('./pages/FormManager'))
const SiteInfo = lazy(() => import('./pages/SiteInfo'))
const Company = lazy(() => import('./pages/Company'))
const Settings = lazy(() => import('./pages/Settings'))
const MediaLibrary = lazy(() => import('./pages/MediaLibrary'))
const Models = lazy(() => import('./pages/Models'))
const ExtFields = lazy(() => import('./pages/ExtFields'))
const Trash = lazy(() => import('./pages/Trash'))
const Users = lazy(() => import('./pages/Users'))
const Roles = lazy(() => import('./pages/Roles'))
const Menus = lazy(() => import('./pages/Menus'))
const Logs = lazy(() => import('./pages/Logs'))
const Database = lazy(() => import('./pages/Database'))
const Sites = lazy(() => import('./pages/Sites'))

/** 懶加載fallback：簡潔的加載動畫 */
function PageLoading() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
        <span className="text-sm text-slate-400">載入中…</span>
      </div>
    </div>
  )
}

/** 路由守衛:未登錄跳轉到登錄頁 */
function Protected({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** 權限守衛：檢查用戶是否有指定 mcode 權限，無權限顯示提示頁 */
function RequirePermission({
  mcode,
  children,
}: {
  mcode: string | string[]
  children: React.ReactNode
}) {
  const user = getUserInfo()
  // 超管放行
  if (user?.isSuper) return <>{children}</>
  // 檢查權限
  const codes = Array.isArray(mcode) ? mcode : [mcode]
  const hasPermission = user?.permissions?.some((p) => codes.includes(p))
  if (!hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <span className="text-6xl mb-4">🔒</span>
        <h2 className="text-xl font-bold text-slate-700 mb-2">無權限訪問</h2>
        <p className="text-sm text-slate-500">
          當前角色沒有此功能的訪問權限，請聯繫管理員開通。
        </p>
      </div>
    )
  }
  return <>{children}</>
}

export default function App() {
  const navigate = useNavigate()

  // 監聽 api.ts 發布的 unauthorized 事件，使用 React Router 的 navigate 跳轉
  // 比 window.location.href 更平滑，不會整頁刷新，且保留路由狀態
  useEffect(() => {
    const handleUnauthorized = () => {
      navigate('/login', { replace: true })
    }
    window.addEventListener('unauthorized', handleUnauthorized)
    return () => window.removeEventListener('unauthorized', handleUnauthorized)
  }, [navigate])

  return (
    <>
      {/* ErrorBoundary 包裹整個路由，捕獲子組件渲染錯誤，防止整個應用白屏崩潰 */}
      <ErrorBoundary>
        {/* Suspense 包裹懶加載路由，頁面 chunk 載入期間顯示 PageLoading fallback */}
        <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="contents" element={<RequirePermission mcode="M201"><Contents /></RequirePermission>} />
            <Route path="contents/new" element={<RequirePermission mcode="M201"><ContentEdit /></RequirePermission>} />
            <Route path="contents/:id" element={<RequirePermission mcode="M201"><ContentEdit /></RequirePermission>} />
            <Route path="categories" element={<RequirePermission mcode="M202"><Categories /></RequirePermission>} />
            <Route path="singles" element={<RequirePermission mcode="M203"><Singles /></RequirePermission>} />
            <Route path="singles/new" element={<RequirePermission mcode="M203"><SingleEdit /></RequirePermission>} />
            <Route path="singles/:id" element={<RequirePermission mcode="M203"><SingleEdit /></RequirePermission>} />
            <Route path="links" element={<RequirePermission mcode="M401"><Links /></RequirePermission>} />
            <Route path="slides" element={<RequirePermission mcode="M402"><Slides /></RequirePermission>} />
            <Route path="booking" element={<RequirePermission mcode="M302"><Booking /></RequirePermission>} />
            <Route path="internallinks" element={<RequirePermission mcode="M403"><InternalLinks /></RequirePermission>} />
            <Route path="forms" element={<RequirePermission mcode="M210"><FormManager /></RequirePermission>} />
            <Route path="forms/submissions" element={<RequirePermission mcode="M204"><FormSubmissions /></RequirePermission>} />
            <Route path="site" element={<RequirePermission mcode="M501"><SiteInfo /></RequirePermission>} />
            <Route path="company" element={<RequirePermission mcode="M502"><Company /></RequirePermission>} />
            <Route path="media" element={<RequirePermission mcode="M301"><MediaLibrary /></RequirePermission>} />
            <Route path="settings" element={<RequirePermission mcode="M503"><Settings /></RequirePermission>} />
            <Route path="models" element={<RequirePermission mcode="M207"><Models /></RequirePermission>} />
            <Route path="extfields" element={<RequirePermission mcode="M206"><ExtFields /></RequirePermission>} />
            <Route path="trash" element={<RequirePermission mcode="M208"><Trash /></RequirePermission>} />
            {/* 以下為超管專用路由，無 mcode 映射，僅超管可訪問 */}
            <Route path="users" element={<RequirePermission mcode="M504"><Users /></RequirePermission>} />
            <Route path="roles" element={<RequirePermission mcode="M505"><Roles /></RequirePermission>} />
            <Route path="menus" element={<RequirePermission mcode="M506"><Menus /></RequirePermission>} />
            <Route path="logs" element={<RequirePermission mcode="M507"><Logs /></RequirePermission>} />
            <Route path="database" element={<RequirePermission mcode="__super__"><Database /></RequirePermission>} />
            <Route path="sites" element={<RequirePermission mcode="M508"><Sites /></RequirePermission>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </ErrorBoundary>
      {/* GlobalErrorToast 放在所有路由之外，確保始終可見，不受路由切換影響 */}
      <GlobalErrorToast />
    </>
  )
}
