import { Routes, Route, Navigate } from 'react-router-dom'
import { getToken } from './lib/api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Contents from './pages/Contents'
import ContentEdit from './pages/ContentEdit'
import Categories from './pages/Categories'
import Singles from './pages/Singles'
import SingleEdit from './pages/SingleEdit'
import Links from './pages/Links'
import Slides from './pages/Slides'
import Tags from './pages/Tags'
import Labels from './pages/Labels'
import Messages from './pages/Messages'
import SiteInfo from './pages/SiteInfo'
import Company from './pages/Company'
import Settings from './pages/Settings'
import Storage from './pages/Storage'
import MediaLibrary from './pages/MediaLibrary'
import Models from './pages/Models'
import ExtFields from './pages/ExtFields'
import Trash from './pages/Trash'
import Users from './pages/Users'
import Roles from './pages/Roles'
import Menus from './pages/Menus'
import Logs from './pages/Logs'
import Database from './pages/Database'

/** 路由守衛:未登錄跳轉到登錄頁 */
function Protected({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
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
        <Route path="contents" element={<Contents />} />
        <Route path="contents/new" element={<ContentEdit />} />
        <Route path="contents/:id" element={<ContentEdit />} />
        <Route path="categories" element={<Categories />} />
        <Route path="singles" element={<Singles />} />
        <Route path="singles/new" element={<SingleEdit />} />
        <Route path="singles/:id" element={<SingleEdit />} />
        <Route path="links" element={<Links />} />
        <Route path="slides" element={<Slides />} />
        <Route path="tags" element={<Tags />} />
        <Route path="labels" element={<Labels />} />
        <Route path="messages" element={<Messages />} />
        <Route path="site" element={<SiteInfo />} />
        <Route path="company" element={<Company />} />
        <Route path="media" element={<MediaLibrary />} />
        <Route path="settings" element={<Settings />} />
        <Route path="storage" element={<Storage />} />
        <Route path="models" element={<Models />} />
        <Route path="extfields" element={<ExtFields />} />
        <Route path="trash" element={<Trash />} />
        <Route path="users" element={<Users />} />
        <Route path="roles" element={<Roles />} />
        <Route path="menus" element={<Menus />} />
        <Route path="logs" element={<Logs />} />
        <Route path="database" element={<Database />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
