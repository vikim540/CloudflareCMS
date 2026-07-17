import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, X, Loader2, AlertCircle, Bookmark, Save, CheckCircle2 } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

/** 自定義標籤數據結構 */
interface Label {
  id: number
  name: string
  value: string
  type: string // "1" = 文字, "2" = 圖片/URL, "3" = 文本域
  description: string
  sorting: number
}

/** 新增表單數據 */
interface CreateForm {
  name: string
  value: string
  type: string
  description: string
}

/** 類型選項 */
const TYPE_OPTIONS = [
  { value: '1', label: '文字' },
  { value: '2', label: '圖片/URL' },
  { value: '3', label: '文本域' },
]

/** 取得類型顯示名稱 */
function getTypeLabel(type: string): string {
  return TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? '文字'
}

export default function Labels() {
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // 本地變更記錄: id -> newValue
  const [changes, setChanges] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // 新增對話框狀態
  const [modalOpen, setModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>({
    name: '',
    value: '',
    type: '1',
    description: '',
  })
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState('')

  /** 載入標籤列表 */
  const fetchLabels = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Label[]>('/admin/labels')
      setLabels(res.data ?? [])
      setChanges({})
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLabels()
  }, [fetchLabels])

  /** 取得某標籤的當前顯示值（優先取本地變更） */
  const currentValue = (label: Label): string => {
    return label.id in changes ? changes[label.id] : label.value
  }

  /** 更新本地變更 */
  const updateValue = (id: number, value: string) => {
    setChanges((prev) => {
      const next = { ...prev }
      const original = labels.find((l) => l.id === id)?.value ?? ''
      if (value === original) {
        delete next[id]
      } else {
        next[id] = value
      }
      return next
    })
    setSaveSuccess(false)
  }

  /** 批量保存 */
  const handleBatchSave = async () => {
    const changedEntries = Object.entries(changes)
    if (changedEntries.length === 0) return

    setSaving(true)
    setSaveSuccess(false)
    setError('')
    try {
      await api.put('/admin/labels/batch', {
        labels: changedEntries.map(([id, value]) => ({ id: Number(id), value })),
      })
      await fetchLabels()
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  /** 放棄所有變更 */
  const handleReset = () => {
    setChanges({})
    setSaveSuccess(false)
  }

  /** 開啟新增對話框 */
  const openCreate = () => {
    setCreateForm({ name: '', value: '', type: '1', description: '' })
    setActionError('')
    setModalOpen(true)
  }

  /** 提交新增 */
  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      setActionError('標籤名稱不能為空')
      return
    }

    setCreating(true)
    setActionError('')
    try {
      await api.post('/admin/labels', {
        name: createForm.name.trim(),
        value: createForm.value,
        type: createForm.type,
        description: createForm.description,
      })
      setModalOpen(false)
      await fetchLabels()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '創建失敗')
    } finally {
      setCreating(false)
    }
  }

  /** 刪除標籤 */
  const handleDelete = async (id: number) => {
    if (!window.confirm('確定要刪除此自定義標籤嗎?')) return
    setActionLoading(id)
    try {
      await api.del(`/admin/labels/${id}`)
      await fetchLabels()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    } finally {
      setActionLoading(null)
    }
  }

  const changedCount = Object.keys(changes).length

  return (
    <div className="p-6 pb-24">
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">自定義標籤</h1>
          <p className="text-sm text-muted-foreground mt-1">管理模板中可用的自定義標籤變量</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
        >
          <Plus className="w-4 h-4" />
          新增標籤
        </button>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive rounded-md text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 成功提示 */}
      {saveSuccess && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 rounded-md text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          標籤已成功保存
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
      {!loading && labels.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Bookmark className="w-10 h-10 mb-3 opacity-50" />
          <p className="mb-3">尚未創建任何自定義標籤</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
          >
            <Plus className="w-4 h-4" />
            新增標籤
          </button>
        </div>
      )}

      {/* 標籤表格（內聯編輯） */}
      {!loading && labels.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">名稱</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">值</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">類型</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">描述</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((item) => {
                  const hasChange = item.id in changes
                  const isTextarea = item.type === '3'
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        'border-b last:border-0 transition-colors',
                        hasChange ? 'bg-amber-50/50' : 'hover:bg-accent/50',
                      )}
                    >
                      <td className="px-4 py-3 text-muted-foreground">{item.id}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium font-mono text-xs">{item.name}</span>
                      </td>
                      <td className="px-4 py-3 min-w-[200px]">
                        {isTextarea ? (
                          <textarea
                            value={currentValue(item)}
                            onChange={(e) => updateValue(item.id, e.target.value)}
                            rows={2}
                            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                          />
                        ) : (
                          <input
                            type="text"
                            value={currentValue(item)}
                            onChange={(e) => updateValue(item.id, e.target.value)}
                            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        )}
                        {hasChange && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-200 text-amber-800">
                            已修改
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {getTypeLabel(item.type)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.description || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDelete(item.id)}
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
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 底部固定操作列 */}
      {!loading && labels.length > 0 && (
        <div className="fixed bottom-0 left-56 right-0 bg-white border-t px-6 py-3 flex items-center justify-between z-30">
          <div className="text-sm text-muted-foreground">
            {changedCount > 0 ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-xs font-bold">
                  {changedCount}
                </span>
                項標籤已修改，待保存
              </span>
            ) : (
              <span>無未保存的變更</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {changedCount > 0 && (
              <button
                onClick={handleReset}
                disabled={saving}
                className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
              >
                放棄變更
              </button>
            )}
            <button
              onClick={handleBatchSave}
              disabled={saving || changedCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? '保存中...' : `批量保存${changedCount > 0 ? ` (${changedCount})` : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* 新增對話框 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-lg font-semibold">新增自定義標籤</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* 名稱 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  名稱 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono text-sm"
                  placeholder="如：site_phone"
                  autoFocus
                />
              </div>
              {/* 值 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">值</label>
                <input
                  type="text"
                  value={createForm.value}
                  onChange={(e) => setCreateForm((f) => ({ ...f, value: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="標籤的預設值"
                />
              </div>
              {/* 類型 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">類型</label>
                <select
                  value={createForm.type}
                  onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-white"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">描述</label>
                <input
                  type="text"
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="標籤用途說明"
                />
              </div>
              {actionError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  {actionError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                {creating ? '創建中...' : '確認新增'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
