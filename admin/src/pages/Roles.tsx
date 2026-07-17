import { useEffect, useState, useCallback } from 'react'
import { Plus, Edit, Trash2, X, Loader2, AlertCircle, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

/** 角色數據結構 */
interface Role {
  id: number
  name: string
  rcode: string
  description: string
  status: string
}

/** 角色詳情（含權限） */
interface RoleDetail {
  role: Role
  levels: string[]
}

/** 角色表單 */
interface RoleForm {
  name: string
  rcode: string
  description: string
  status: string
  levels: string[]
}

/** 空表單初始值 */
const EMPTY_FORM: RoleForm = {
  name: '',
  rcode: '',
  description: '',
  status: '1',
  levels: [],
}

/** 權限分組定義 */
interface PermissionGroup {
  title: string
  permissions: { value: string; label: string }[]
}

/** 權限分組配置 */
const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: '內容管理',
    permissions: [
      { value: 'content:index', label: '查看' },
      { value: 'content:add', label: '新增' },
      { value: 'content:mod', label: '修改' },
      { value: 'content:del', label: '刪除' },
      { value: 'content:trash', label: '回收站' },
      { value: 'content:restore', label: '還原' },
      { value: 'content:permanent_del', label: '永久刪除' },
    ],
  },
  {
    title: '欄目管理',
    permissions: [
      { value: 'sort:index', label: '查看' },
      { value: 'sort:add', label: '新增' },
      { value: 'sort:mod', label: '修改' },
      { value: 'sort:del', label: '刪除' },
    ],
  },
  {
    title: '模型管理',
    permissions: [
      { value: 'model:index', label: '查看模型' },
      { value: 'model:add', label: '新增模型' },
      { value: 'model:mod', label: '修改模型' },
      { value: 'model:del', label: '刪除模型' },
      { value: 'extfield:index', label: '查看欄位' },
      { value: 'extfield:add', label: '新增欄位' },
      { value: 'extfield:mod', label: '修改欄位' },
      { value: 'extfield:del', label: '刪除欄位' },
    ],
  },
  {
    title: '基礎內容',
    permissions: [
      { value: 'single:index', label: '查看單頁' },
      { value: 'single:add', label: '新增單頁' },
      { value: 'single:mod', label: '修改單頁' },
      { value: 'single:del', label: '刪除單頁' },
      { value: 'site:mod', label: '修改站點' },
      { value: 'company:mod', label: '修改公司' },
    ],
  },
  {
    title: '擴展內容',
    permissions: [
      { value: 'link:index', label: '查看連結' },
      { value: 'link:add', label: '新增連結' },
      { value: 'link:mod', label: '修改連結' },
      { value: 'link:del', label: '刪除連結' },
      { value: 'slide:index', label: '查看幻燈片' },
      { value: 'slide:add', label: '新增幻燈片' },
      { value: 'slide:mod', label: '修改幻燈片' },
      { value: 'slide:del', label: '刪除幻燈片' },
      { value: 'tag:index', label: '查看標籤' },
      { value: 'tag:add', label: '新增標籤' },
      { value: 'tag:mod', label: '修改標籤' },
      { value: 'tag:del', label: '刪除標籤' },
      { value: 'label:index', label: '查看自定義標籤' },
      { value: 'label:add', label: '新增自定義標籤' },
      { value: 'label:mod', label: '修改自定義標籤' },
      { value: 'label:del', label: '刪除自定義標籤' },
      { value: 'message:index', label: '查看留言' },
      { value: 'message:mod', label: '修改留言' },
      { value: 'message:del', label: '刪除留言' },
    ],
  },
  {
    title: '系統配置',
    permissions: [
      { value: 'config:mod', label: '修改配置' },
      { value: 'storage:mod', label: '修改存儲' },
    ],
  },
  {
    title: '系統管理',
    permissions: [
      { value: 'user:index', label: '查看用戶' },
      { value: 'user:add', label: '新增用戶' },
      { value: 'user:mod', label: '修改用戶' },
      { value: 'user:del', label: '刪除用戶' },
      { value: 'role:index', label: '查看角色' },
      { value: 'role:add', label: '新增角色' },
      { value: 'role:mod', label: '修改角色' },
      { value: 'role:del', label: '刪除角色' },
      { value: 'menu:index', label: '查看選單' },
      { value: 'menu:add', label: '新增選單' },
      { value: 'menu:mod', label: '修改選單' },
      { value: 'menu:del', label: '刪除選單' },
      { value: 'log:index', label: '查看日誌' },
      { value: 'log:clear', label: '清除日誌' },
      { value: 'db:backup', label: '資料庫備份' },
    ],
  },
]

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // 對話框狀態
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Role | null>(null)
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  // 權限分組展開狀態
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  /** 載入角色列表 */
  const fetchRoles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Role[]>('/admin/roles')
      setRoles(res.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  /** 切換權限分組展開 */
  const toggleGroup = (title: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  /** 切換權限選擇 */
  const togglePermission = (value: string) => {
    setForm((f) => ({
      ...f,
      levels: f.levels.includes(value)
        ? f.levels.filter((l) => l !== value)
        : [...f.levels, value],
    }))
  }

  /** 切換整組權限 */
  const toggleGroupPermissions = (group: PermissionGroup) => {
    const allSelected = group.permissions.every((p) => form.levels.includes(p.value))
    setForm((f) => {
      let next = [...f.levels]
      if (allSelected) {
        // 取消整組
        next = next.filter((l) => !group.permissions.some((p) => p.value === l))
      } else {
        // 選中整組
        for (const p of group.permissions) {
          if (!next.includes(p.value)) next.push(p.value)
        }
      }
      return { ...f, levels: next }
    })
  }

  /** 開啟新增對話框 */
  const openCreate = () => {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setCollapsedGroups(new Set())
    setActionError('')
    setModalOpen(true)
  }

  /** 開啟編輯對話框（需載入權限詳情） */
  const openEdit = async (item: Role) => {
    setEditTarget(item)
    setForm({
      name: item.name ?? '',
      rcode: item.rcode ?? '',
      description: item.description ?? '',
      status: item.status ?? '1',
      levels: [],
    })
    setCollapsedGroups(new Set())
    setActionError('')
    setModalOpen(true)
    setDetailLoading(true)
    try {
      const res = await api.get<RoleDetail>(`/admin/roles/${item.id}`)
      if (res.data?.levels) {
        setForm((f) => ({ ...f, levels: res.data!.levels }))
      }
    } catch {
      /* 忽略權限載入錯誤，使用空權限 */
    } finally {
      setDetailLoading(false)
    }
  }

  /** 提交表單 */
  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setActionError('角色名稱不能為空')
      return
    }
    if (!form.rcode.trim()) {
      setActionError('角色代碼不能為空')
      return
    }

    setSaving(true)
    setActionError('')
    try {
      const payload = {
        name: form.name.trim(),
        rcode: form.rcode.trim(),
        description: form.description,
        status: form.status,
        levels: form.levels,
      }
      if (editTarget) {
        await api.put(`/admin/roles/${editTarget.id}`, payload)
      } else {
        await api.post('/admin/roles', payload)
      }
      setModalOpen(false)
      await fetchRoles()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  /** 刪除角色 */
  const handleDelete = async (item: Role) => {
    if (!window.confirm(`確定要刪除角色「${item.name}」嗎?`)) return
    setActionLoading(item.id)
    try {
      await api.del(`/admin/roles/${item.id}`)
      await fetchRoles()
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
          <h1 className="text-2xl font-bold">角色管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理後台角色及其權限</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
        >
          <Plus className="w-4 h-4" />
          新增角色
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
      {!loading && roles.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ShieldCheck className="w-10 h-10 mb-3 opacity-50" />
          <p className="mb-3">尚未創建任何角色</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
          >
            <Plus className="w-4 h-4" />
            新增角色
          </button>
        </div>
      )}

      {/* 角色表格 */}
      {!loading && roles.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">角色名稱</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">代碼</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">描述</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">狀態</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b last:border-0 hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground">{item.id}</td>
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.rcode}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.description || '-'}</td>
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
                          disabled={actionLoading === item.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="刪除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 新增/編輯對話框 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">{editTarget ? '編輯角色' : '新增角色'}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* 角色名稱 + 代碼 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    角色名稱 <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="請輸入角色名稱"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    代碼 <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.rcode}
                    onChange={(e) => setForm((f) => ({ ...f, rcode: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                    placeholder="角色唯一代碼"
                    disabled={!!editTarget}
                  />
                </div>
              </div>
              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">描述</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="角色描述（可選）"
                />
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
              {/* 權限樹 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium">權限設置</label>
                  {detailLoading && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      載入權限中...
                    </span>
                  )}
                </div>
                <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
                  {PERMISSION_GROUPS.map((group) => {
                    const isCollapsed = collapsedGroups.has(group.title)
                    const allSelected = group.permissions.every((p) => form.levels.includes(p.value))
                    const someSelected = group.permissions.some((p) => form.levels.includes(p.value))
                    return (
                      <div key={group.title}>
                        {/* 分組標題 */}
                        <div className="flex items-center px-3 py-2 bg-secondary/30">
                          <button
                            onClick={() => toggleGroup(group.title)}
                            className="p-0.5 rounded hover:bg-accent transition-colors mr-1.5"
                            aria-label={isCollapsed ? '展開' : '收起'}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = !allSelected && someSelected
                              }}
                              onChange={() => toggleGroupPermissions(group)}
                              className="w-4 h-4 rounded border-input"
                            />
                            <span className="text-sm font-medium">{group.title}</span>
                          </label>
                          <span className="text-xs text-muted-foreground">
                            {group.permissions.filter((p) => form.levels.includes(p.value)).length}/
                            {group.permissions.length}
                          </span>
                        </div>
                        {/* 權限項 */}
                        {!isCollapsed && (
                          <div className="px-3 py-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {group.permissions.map((p) => (
                              <label
                                key={p.value}
                                className="flex items-center gap-2 cursor-pointer hover:bg-accent/50 px-2 py-1 rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={form.levels.includes(p.value)}
                                  onChange={() => togglePermission(p.value)}
                                  className="w-3.5 h-3.5 rounded border-input"
                                />
                                <span className="text-sm">{p.label}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
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
