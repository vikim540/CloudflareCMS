import { useEffect, useState, useCallback } from 'react'
import { Plus, Edit, Trash2, X, Loader2, AlertCircle, Users as UsersIcon, Lock, Shield } from 'lucide-react'
import { api } from '../lib/api'
import { cn, formatDate } from '../lib/utils'

/** 系統用戶數據結構 */
interface User {
  id: number
  ucode: string
  username: string
  realname: string
  rcodes: string
  login_count: number
  last_login_ip: string
  lastlogintime: string
  status: string
}

/** 角色數據（用於多選） */
interface Role {
  id: number
  name: string
  rcode: string
}

/** 用戶表單 */
interface UserForm {
  username: string
  password: string
  realname: string
  rcodes: string[]
  status: string
}

/** 空表單初始值 */
const EMPTY_FORM: UserForm = {
  username: '',
  password: '',
  realname: '',
  rcodes: [],
  status: '1',
}

/** 超級管理員 ucode（不可刪除） */
const SUPER_ADMIN_UCODE = '10001'

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // 對話框狀態
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  /** 載入用戶列表 */
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<User[]>('/admin/users')
      setUsers(res.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  /** 載入角色列表（用於多選） */
  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.get<Role[]>('/admin/roles')
      setRoles(res.data ?? [])
    } catch {
      /* 忽略角色載入錯誤 */
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [fetchUsers, fetchRoles])

  /** 取得角色名稱（根據 rcodes 字串） */
  const getRoleNames = (rcodes: string): string => {
    if (!rcodes) return '-'
    const codeList = rcodes.split(',').map((s) => s.trim()).filter(Boolean)
    const names = codeList
      .map((code) => roles.find((r) => r.rcode === code)?.name ?? code)
    return names.join(', ') || '-'
  }

  /** 開啟新增對話框 */
  const openCreate = () => {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setActionError('')
    setModalOpen(true)
  }

  /** 開啟編輯對話框 */
  const openEdit = (item: User) => {
    setEditTarget(item)
    setForm({
      username: item.username ?? '',
      password: '', // 編輯時密碼留空表示不修改
      realname: item.realname ?? '',
      rcodes: item.rcodes ? item.rcodes.split(',').map((s) => s.trim()).filter(Boolean) : [],
      status: item.status ?? '1',
    })
    setActionError('')
    setModalOpen(true)
  }

  /** 切換角色選擇 */
  const toggleRole = (rcode: string) => {
    setForm((f) => ({
      ...f,
      rcodes: f.rcodes.includes(rcode)
        ? f.rcodes.filter((r) => r !== rcode)
        : [...f.rcodes, rcode],
    }))
  }

  /** 提交表單 */
  const handleSubmit = async () => {
    if (!editTarget && !form.username.trim()) {
      setActionError('用戶名不能為空')
      return
    }
    if (!editTarget && !form.password.trim()) {
      setActionError('密碼不能為空')
      return
    }

    setSaving(true)
    setActionError('')
    try {
      if (editTarget) {
        // 編輯：密碼可選
        const payload: Record<string, unknown> = {
          realname: form.realname,
          rcodes: form.rcodes.join(','),
          status: form.status,
        }
        if (form.password.trim()) {
          payload.password = form.password
        }
        await api.put(`/admin/users/${editTarget.id}`, payload)
      } else {
        // 新增
        const payload = {
          username: form.username.trim(),
          password: form.password,
          realname: form.realname,
          rcodes: form.rcodes.join(','),
          status: form.status,
        }
        await api.post('/admin/users', payload)
      }
      setModalOpen(false)
      await fetchUsers()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  /** 刪除用戶 */
  const handleDelete = async (item: User) => {
    if (item.ucode === SUPER_ADMIN_UCODE) return
    if (!window.confirm(`確定要刪除用戶「${item.username}」嗎?`)) return
    setActionLoading(item.id)
    try {
      await api.del(`/admin/users/${item.id}`)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="p-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">系統用戶</h1>
          <p className="text-sm text-muted-foreground mt-1">管理後台系統用戶帳號</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
        >
          <Plus className="w-4 h-4" />
          新增用戶
        </button>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive rounded-md text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 加載中 */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          載入中...
        </div>
      )}

      {/* 空狀態 */}
      {!loading && users.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <UsersIcon className="w-10 h-10 mb-3 opacity-50" />
          <p className="mb-3">尚未創建任何用戶</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
          >
            <Plus className="w-4 h-4" />
            新增用戶
          </button>
        </div>
      )}

      {/* 用戶表格 */}
      {!loading && users.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">用戶名</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">真實姓名</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">角色</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">登錄次數</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">最後登錄IP</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">最後登錄時間</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">狀態</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => {
                  const isSuperAdmin = item.ucode === SUPER_ADMIN_UCODE
                  return (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 hover:bg-accent/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground">{item.id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{item.username}</span>
                          {isSuperAdmin && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                              <Shield className="w-2.5 h-2.5" />
                              超管
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.realname || '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{getRoleNames(item.rcodes)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.login_count ?? 0}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.last_login_ip || '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(item.lastlogintime)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-block px-2 py-0.5 rounded text-xs font-medium',
                            item.status === '1'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500',
                          )}
                        >
                          {item.status === '1' ? '啟用' : '禁用'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="編輯"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={actionLoading === item.id || isSuperAdmin}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors disabled:opacity-50',
                              isSuperAdmin
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-red-600 hover:bg-red-50',
                            )}
                            title={isSuperAdmin ? '超級管理員不可刪除' : '刪除'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 新增/編輯對話框 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">{editTarget ? '編輯用戶' : '新增用戶'}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* 用戶名 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  用戶名 {!editTarget && <span className="text-destructive">*</span>}
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="請輸入用戶名"
                  disabled={!!editTarget}
                  autoFocus
                />
                {editTarget && (
                  <p className="text-xs text-muted-foreground mt-1">用戶名創建後不可修改</p>
                )}
              </div>
              {/* 密碼 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  密碼 {!editTarget && <span className="text-destructive">*</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={editTarget ? '留空表示不修改密碼' : '請輸入密碼'}
                />
                {editTarget && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    留空則保持原密碼不變
                  </p>
                )}
              </div>
              {/* 真實姓名 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">真實姓名</label>
                <input
                  type="text"
                  value={form.realname}
                  onChange={(e) => setForm((f) => ({ ...f, realname: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="請輸入真實姓名"
                />
              </div>
              {/* 角色（多選） */}
              <div>
                <label className="block text-sm font-medium mb-1.5">角色</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto border rounded-md p-3">
                  {roles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">暫無可選角色</p>
                  ) : (
                    roles.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-accent/50 px-2 py-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={form.rcodes.includes(role.rcode)}
                          onChange={() => toggleRole(role.rcode)}
                          className="w-4 h-4 rounded border-input"
                        />
                        <span className="text-sm">{role.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">({role.rcode})</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              {/* 狀態 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">狀態</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-white"
                >
                  <option value="1">啟用</option>
                  <option value="0">禁用</option>
                </select>
              </div>
              {actionError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  {actionError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
