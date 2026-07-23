/**
 * 文章內鏈管理頁面（原 Tags.tsx，v1.9.20 重命名）
 *
 * 管理文章正文中的關鍵詞自動連結（ay_tags 表）。
 * API 路由從 /admin/tags 改為 /admin/internallinks，避免與文章標籤搜索 API 衝突。
 */
import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { LoadingState, EmptyState } from '../components/StateDisplay'

/** 內鏈數據結構（關鍵詞 → 超連結自動替換） */
interface LinkItem {
  id: number
  name: string
  link: string
  sorting: number
}

/** 表單數據 */
interface LinkForm {
  name: string
  link: string
  sorting: number
}

/** 空表單初始值 */
const EMPTY_FORM: LinkForm = {
  name: '',
  link: '',
  sorting: 1,
}

export default function InternalLinks() {
  const [links, setLinks] = useState<LinkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [sortSaving, setSortSaving] = useState<number | null>(null)

  // 對話框狀態
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<LinkItem | null>(null)
  const [form, setForm] = useState<LinkForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  /** 載入內鏈列表 */
  const fetchLinks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<LinkItem[]>('/admin/internallinks')
      setLinks(res.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  /** 開啟新增對話框 */
  const openCreate = () => {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setActionError('')
    setModalOpen(true)
  }

  /** 開啟編輯對話框 */
  const openEdit = (item: LinkItem) => {
    setEditTarget(item)
    setForm({
      name: item.name ?? '',
      link: item.link ?? '',
      sorting: item.sorting ?? 1,
    })
    setActionError('')
    setModalOpen(true)
  }

  /** 提交表單 */
  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setActionError('關鍵詞不能為空')
      return
    }

    setSaving(true)
    setActionError('')
    try {
      const payload = {
        name: form.name.trim(),
        link: form.link,
        sorting: form.sorting,
      }
      if (editTarget) {
        await api.put(`/admin/internallinks/${editTarget.id}`, payload)
      } else {
        await api.post('/admin/internallinks', payload)
      }
      setModalOpen(false)
      await fetchLinks()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  /** 刪除內鏈 */
  const handleDelete = async (id: number) => {
    if (!window.confirm('確定要刪除此內鏈關鍵詞嗎?')) return
    setActionLoading(id)
    try {
      await api.del(`/admin/internallinks/${id}`)
      await fetchLinks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    } finally {
      setActionLoading(null)
    }
  }

  /** inline 修改排序（失焦或 Enter 時保存） */
  const handleSortSave = async (id: number, value: number) => {
    setSortSaving(id)
    try {
      await api.put(`/admin/internallinks/${id}`, { sorting: value })
      await fetchLinks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '排序更新失敗')
    } finally {
      setSortSaving(null)
    }
  }

  return (
    <div className="p-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">文章內鏈</h1>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
        >
          <span className="mr-1">➕</span>
          新增關鍵詞
        </button>
      </div>
      {/* 功能說明 */}
      <div className="mb-6 flex items-start gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-md text-sm">
        <span className="shrink-0 mt-0.5">💡</span>
        <span>設置關鍵詞和對應連結，文章正文中的關鍵詞將自動替換為可點擊的超連結（每個關鍵詞最多替換次數可在「系統配置 → 基本配置」中調整）。</span>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive rounded-md text-sm">
          <span className="shrink-0">⚠️</span>
          {error}
        </div>
      )}

      {/* 加載中 */}
      {loading && <LoadingState text="載入中..." />}

      {/* 空狀態 */}
      {!loading && links.length === 0 && !error && (
        <>
          <EmptyState icon="🔗" text="尚未創建任何內鏈關鍵詞" />
          <div className="flex justify-center -mt-16 pb-8">
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
            >
              <span className="mr-1">➕</span>
              新增關鍵詞
            </button>
          </div>
        </>
      )}

      {/* 內鏈表格 */}
      {!loading && links.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">關鍵詞</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">連結</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">排序</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {links.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b last:border-0 hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground">{item.id}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span className="text-sm text-muted-foreground">🔗</span>
                        {item.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline truncate max-w-xs"
                        >
                          <span className="truncate">{item.link}</span>
                          <span className="text-xs shrink-0">↗</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        defaultValue={item.sorting ?? 1}
                        disabled={sortSaving === item.id}
                        onBlur={(e) => {
                          const val = Number(e.target.value)
                          if (val !== (item.sorting ?? 1)) handleSortSave(item.id, val)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                        className="w-16 px-2 py-1 border rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        title="數字越小越靠前"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="編輯"
                        >
                          <span className="text-sm">✏️</span>
                          編輯
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={actionLoading === item.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="刪除"
                        >
                          <span className="text-sm">🗑️</span>
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-lg font-semibold">{editTarget ? '編輯內鏈關鍵詞' : '新增內鏈關鍵詞'}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                ❌
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* 關鍵詞 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  關鍵詞 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="文章正文中需自動連結的關鍵詞"
                  autoFocus
                />
              </div>
              {/* 連結 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  連結 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={form.link}
                  onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="https://example.com（關鍵詞點擊後跳轉的 URL）"
                />
              </div>
              {/* 排序 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">排序</label>
                <input
                  type="number"
                  value={form.sorting}
                  onChange={(e) => setForm((f) => ({ ...f, sorting: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="數字越小越靠前"
                />
              </div>
              {actionError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <span className="mr-1">⚠️</span>
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
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving && <span className="animate-spin inline-block">🔄</span>}
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
