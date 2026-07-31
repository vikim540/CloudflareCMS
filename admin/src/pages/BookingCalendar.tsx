import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import ImageCompressDialog from '../components/ImageCompressDialog'
import UploadProgressOverlay from '../components/UploadProgressOverlay'
import MediaPickerModal from '../components/MediaPickerModal'
import { useImageUpload } from '../hooks/useImageUpload'
import { LoadingState, EmptyState } from '../components/StateDisplay'

/** 日曆圖片數據結構 */
interface CalendarImage {
  id: number
  pic: string
  title: string
  sorting: number
  status: string
}

/** 表單數據 */
interface CalendarForm {
  pic: string
  title: string
  sorting: number
}

/** 空表單初始值 */
const EMPTY_FORM: CalendarForm = {
  pic: '',
  title: '',
  sorting: 1,
}

export default function BookingCalendar() {
  const [calendars, setCalendars] = useState<CalendarImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 對話框狀態
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CalendarImage | null>(null)
  const [form, setForm] = useState<CalendarForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  // 圖片上傳狀態
  const fileRef = useRef<HTMLInputElement>(null)
  // 壓縮對話框狀態：記錄待壓縮的圖片
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  // 媒體庫選擇器狀態
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)

  // ─── 拖拽排序狀態 ────────────────────────────────────────
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [sortingUpdate, setSortingUpdate] = useState(false)
  // 手動修改排序的 dirty 記錄（id → 新排序值），保存按鈕統一提交
  const [dirtySorts, setDirtySorts] = useState<Record<number, number>>({})

  // ─── 批量選擇狀態 ────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // ─── 刪除確認狀態 ────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<CalendarImage | null>(null)
  const [batchDeleteMode, setBatchDeleteMode] = useState(false)
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // ─── 上傳 hook（統一壓縮+上傳+進度+錯誤處理） ──────────
  // autoCompress=false：圖片已通過 ImageCompressDialog 壓縮
  const { uploading, progress, error: uploadError, uploadSingle, clearError } = useImageUpload({
    autoCompress: false,
  })

  /** 壓縮對話框確認後的上傳回調 */
  const handleCompressConfirm = async (compressedFiles: File[]) => {
    if (!pendingImage || compressedFiles.length === 0) {
      setPendingImage(null)
      return
    }
    const compressed = compressedFiles[0]
    setPendingImage(null)
    clearError()

    const url = await uploadSingle(compressed)
    if (url) {
      setForm((f) => ({ ...f, pic: url }))
    }
  }

  /** 圖片上傳 — 彈出壓縮對話框 */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileRef.current) fileRef.current.value = ''
    // 非圖片直接上傳，圖片走壓縮對話框
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      clearError()
      const url = await uploadSingle(file)
      if (url) setForm((f) => ({ ...f, pic: url }))
      return
    }
    setPendingImage(file)
  }

  /** 載入日曆圖片列表 */
  const fetchCalendars = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<CalendarImage[]>('/admin/booking/calendars')
      setCalendars(res.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCalendars()
  }, [fetchCalendars])

  // 按 sorting ASC 排序展示（拖到第一則顯示第一）
  const sortedCalendars = useMemo(() => {
    return [...calendars].sort((a, b) => (a.sorting ?? 1) - (b.sorting ?? 1))
  }, [calendars])

  // 全選 / 取消全選
  const allSelected = sortedCalendars.length > 0 && sortedCalendars.every((c) => selectedIds.has(c.id))
  const someSelected = selectedIds.size > 0 && !allSelected

  /** 切換單個選中 */
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  /** 全選 / 取消全選 */
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedCalendars.map((c) => c.id)))
    }
  }

  /** 開啟新增對話框 — 排序自增 */
  const openCreate = () => {
    setEditTarget(null)
    const maxSorting = calendars.length > 0
      ? Math.max(...calendars.map((c) => c.sorting ?? 1))
      : 0
    setForm({
      ...EMPTY_FORM,
      sorting: maxSorting + 1,
    })
    setActionError('')
    setModalOpen(true)
  }

  /** 開啟編輯對話框 */
  const openEdit = (item: CalendarImage) => {
    setEditTarget(item)
    setForm({
      pic: item.pic ?? '',
      title: item.title ?? '',
      sorting: item.sorting ?? 1,
    })
    setActionError('')
    setModalOpen(true)
  }

  /** 提交表單 */
  const handleSubmit = async () => {
    if (!form.pic.trim()) {
      setActionError('圖片網址不能為空')
      return
    }

    setSaving(true)
    setActionError('')
    try {
      const payload = {
        pic: form.pic.trim(),
        title: form.title,
        sorting: form.sorting,
      }
      if (editTarget) {
        await api.put(`/admin/booking/calendars/${editTarget.id}`, payload)
      } else {
        await api.post('/admin/booking/calendars', payload)
      }
      setModalOpen(false)
      await fetchCalendars()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  /** 切換顯示/隱藏 */
  const handleToggleVisibility = async (item: CalendarImage) => {
    const newStatus = item.status === '0' ? '1' : '0'
    // 本地即時更新
    setCalendars((prev) => prev.map((c) => c.id === item.id ? { ...c, status: newStatus } : c))
    try {
      await api.put(`/admin/booking/calendars/${item.id}`, { status: newStatus })
    } catch {
      // 失敗時回滾
      setCalendars((prev) => prev.map((c) => c.id === item.id ? { ...c, status: item.status } : c))
      setError('更新顯示狀態失敗')
    }
  }

  /** 拖拽開始 */
  const handleDragStart = (id: number) => {
    setDraggingId(id)
  }

  /** 拖拽經過某行 */
  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault()
    if (id !== draggingId) setDragOverId(id)
  }

  /** 拖拽放下 — 重新排序 */
  const handleDrop = async (targetId: number) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null)
      setDragOverId(null)
      return
    }
    // 取得當前列表的排序順序
    const ordered = [...sortedCalendars]
    const fromIdx = ordered.findIndex((c) => c.id === draggingId)
    const toIdx = ordered.findIndex((c) => c.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    // 移動元素
    const [moved] = ordered.splice(fromIdx, 1)
    ordered.splice(toIdx, 0, moved)
    // 重新分配 sorting 值（從 1 開始）
    const items = ordered.map((c, idx) => ({ id: c.id, sorting: idx + 1 }))
    // 先本地更新 UI
    setCalendars((prev) => {
      const updates = new Map(items.map((i) => [i.id, i.sorting]))
      return prev.map((c) =>
        updates.has(c.id) ? { ...c, sorting: updates.get(c.id)! } : c,
      )
    })
    setDraggingId(null)
    setDragOverId(null)
    // 異步更新後端
    setSortingUpdate(true)
    try {
      await api.put('/admin/booking/calendars/batch-sorting', { items })
    } catch {
      // 失敗時重新載入
      await fetchCalendars()
    } finally {
      setSortingUpdate(false)
    }
  }

  /** 手動修改排序值 — 僅標記 dirty，等待保存按鈕統一提交 */
  const handleSortingInput = (id: number, newSorting: number) => {
    // 更新本地顯示
    setCalendars((prev) =>
      prev.map((c) => (c.id === id ? { ...c, sorting: newSorting } : c)),
    )
    // 標記為 dirty（等待保存按鈕提交）
    setDirtySorts((prev) => ({ ...prev, [id]: newSorting }))
  }

  /** 批量保存所有修改的排序值 */
  const handleSaveSorts = async () => {
    const items = Object.entries(dirtySorts).map(([id, sorting]) => ({
      id: Number(id),
      sorting,
    }))
    if (items.length === 0) return

    setSortingUpdate(true)
    try {
      await api.put('/admin/booking/calendars/batch-sorting', { items })
      setDirtySorts({})
    } catch {
      // 失敗時重新載入以恢復正確狀態
      await fetchCalendars()
      setDirtySorts({})
    } finally {
      setSortingUpdate(false)
    }
  }

  /** 確認單條刪除 */
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api.del(`/admin/booking/calendars/${deleteTarget.id}`)
      setDeleteTarget(null)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteTarget.id)
        return next
      })
      await fetchCalendars()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '刪除失敗')
    } finally {
      setDeleting(false)
    }
  }

  /** 確認批量刪除 */
  const handleConfirmBatchDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setDeleting(true)
    setDeleteError('')
    let failed = 0
    for (const id of ids) {
      try {
        await api.del(`/admin/booking/calendars/${id}`)
      } catch {
        failed++
      }
    }
    setDeleting(false)
    if (failed > 0 && failed < ids.length) {
      // 部分失敗：顯示錯誤但仍關閉並刷新
      setError(`批量刪除完成，${failed} 項失敗`)
    } else if (failed === ids.length) {
      // 全部失敗：保持 Modal 開啟，用戶可重試
      setDeleteError('全部刪除失敗，請檢查網路後重試')
      return
    }
    setShowBatchDeleteConfirm(false)
    setBatchDeleteMode(false)
    setSelectedIds(new Set())
    await fetchCalendars()
  }

  return (
    <>
      {/* 操作按鈕 */}
      <div className="flex items-center justify-end gap-2 mb-4">
        {calendars.length > 0 && (
          <button
            onClick={() => {
              setBatchDeleteMode(!batchDeleteMode)
              setSelectedIds(new Set())
              setShowBatchDeleteConfirm(false)
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 border rounded-md transition-colors text-sm',
              batchDeleteMode
                ? 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100'
                : 'bg-white text-foreground border-border hover:bg-accent',
            )}
          >
            <span className="mr-1">{batchDeleteMode ? '✖️' : '🗑️'}</span>
            {batchDeleteMode ? '退出批量' : '批量管理'}
          </button>
        )}
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
        >
          <span className="mr-1">➕</span>
          新增日曆圖片
        </button>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* 批量操作工具欄 */}
      {batchDeleteMode && sortedCalendars.length > 0 && (
        <div className="mb-4 flex items-center gap-3 px-4 py-2.5 bg-blue-50 rounded-md text-sm">
          <span className="text-blue-700 font-medium">
            已選中 {selectedIds.size} / {sortedCalendars.length} 項
          </span>
          <button
            onClick={toggleSelectAll}
            className="px-2 py-1 text-xs border rounded hover:bg-white transition-colors"
          >
            {allSelected ? '取消全選' : '全選'}
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowBatchDeleteConfirm(true)}
              disabled={deleting}
              className="ml-auto inline-flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              🗑️ 批量刪除（{selectedIds.size}）
            </button>
          )}
        </div>
      )}

      {/* 加載中 */}
      {loading && <LoadingState text="載入中..." />}

      {/* 空狀態 */}
      {!loading && calendars.length === 0 && !error && (
        <>
          <EmptyState icon="📅" text="尚未創建任何日曆圖片" />
          <div className="flex justify-center -mt-16 pb-8">
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
            >
              <span className="mr-1">➕</span>
              新增日曆圖片
            </button>
          </div>
        </>
      )}

      {/* 日曆圖片表格 */}
      {!loading && sortedCalendars.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          {/* 排序更新提示 */}
          {sortingUpdate && (
            <div className="px-4 py-2 bg-blue-50 text-blue-600 text-xs flex items-center gap-2 border-b border-blue-100">
              <span className="animate-spin inline-block">🔄</span>
              正在更新排序...
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  {batchDeleteMode && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected
                        }}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded accent-primary cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-2 py-3 w-8"></th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">圖片</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">標題</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">排序</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">顯示</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedCalendars.map((item) => (
                  <tr
                    key={item.id}
                    draggable={!batchDeleteMode}
                    onDragStart={() => handleDragStart(item.id)}
                    onDragOver={(e) => handleDragOver(e, item.id)}
                    onDrop={() => handleDrop(item.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
                    className={cn(
                      'border-b last:border-0 hover:bg-accent/50 transition-colors',
                      draggingId === item.id && 'opacity-40',
                      dragOverId === item.id && 'bg-blue-50 border-t-2 border-t-blue-400',
                    )}
                  >
                    {batchDeleteMode && (
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 rounded accent-primary cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-2 py-3 text-center cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500" title="拖拽排序">
                      ⋮⋮
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.id}</td>
                    <td className="px-4 py-3">
                      {item.pic ? (
                        <img
                          src={item.pic}
                          alt={item.title || '日曆圖片'}
                          title={item.title || ''}
                          className="w-32 h-18 rounded border bg-gray-50 object-contain"
                          loading="lazy"
                          decoding="async"
                          style={{ maxHeight: '72px' }}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">無圖片</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{item.title || '-'}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        value={item.sorting ?? 1}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1
                          handleSortingInput(item.id, val)
                        }}
                        className={cn(
                          'w-14 px-1.5 py-1 text-center border rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 hover:border-blue-300',
                          dirtySorts[item.id] !== undefined
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-slate-200',
                        )}
                        title={dirtySorts[item.id] !== undefined ? '已修改，點擊「保存排序」提交' : '修改排序值'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleVisibility(item)}
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                          (item.status ?? '1') === '1' ? 'bg-primary' : 'bg-muted',
                        )}
                        title={(item.status ?? '1') === '1' ? '點擊隱藏' : '點擊顯示'}
                      >
                        <span className={cn(
                          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                          (item.status ?? '1') === '1' ? 'translate-x-5' : 'translate-x-1',
                        )} />
                      </button>
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
                          onClick={() => {
                            setDeleteTarget(item)
                            setDeleteError('')
                          }}
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
          <div className="px-4 py-2 bg-slate-50 text-xs text-muted-foreground border-t flex items-center gap-2 flex-wrap">
            <span>💡 提示：</span>
            <span>拖拽 <span className="font-mono text-slate-500">⋮⋮</span> 圖示可調整順序（即時生效）</span>
            <span className="text-slate-300">|</span>
            <span>修改排序輸入框後，點擊「保存排序」提交</span>
            {/* 有未保存的排序修改時顯示保存按鈕 */}
            {Object.keys(dirtySorts).length > 0 && (
              <button
                onClick={handleSaveSorts}
                disabled={sortingUpdate}
                className="ml-auto inline-flex items-center gap-1 px-3 py-1 bg-amber-500 text-white rounded text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {sortingUpdate ? '⏳ 保存中...' : `💾 保存排序（${Object.keys(dirtySorts).length} 項）`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 新增/編輯對話框 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">{editTarget ? '編輯日曆圖片' : '新增日曆圖片'}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                ❌
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* 圖片 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  日曆圖片 <span className="text-destructive">*</span>
                  <span className="ml-1 text-xs text-muted-foreground font-normal">（自動壓縮為 WebP）</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.pic}
                    onChange={(e) => setForm((f) => ({ ...f, pic: e.target.value }))}
                    className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    placeholder="圖片網址或點擊上傳"
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {uploading ? <span className="animate-spin">🔄</span> : <span>📷</span>}
                    {uploading ? '上傳中...' : '上傳'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaPickerOpen(true)}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
                  >
                    🖼️ 媒體庫
                  </button>
                </div>
                {form.pic && (
                  <div className="mt-2 rounded border bg-gray-50 p-2 flex items-center justify-center" style={{ maxHeight: '200px' }}>
                    <img
                      src={form.pic}
                      alt="預覽"
                      className="rounded object-contain"
                      loading="lazy"
                      decoding="async"
                      style={{ maxHeight: '190px', maxWidth: '100%' }}
                    />
                  </div>
                )}
              </div>
              {/* 標題 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  標題
                  <span className="ml-1 text-xs text-muted-foreground font-normal">（用作 alt / title 屬性）</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="日曆圖片標題"
                />
              </div>
              {/* 排序 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">排序</label>
                <input
                  type="number"
                  min={1}
                  value={form.sorting}
                  onChange={(e) => setForm((f) => ({ ...f, sorting: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {actionError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <span className="mr-1">⚠️</span>
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
                {saving && <span className="animate-spin inline-block">🔄</span>}
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 圖片壓縮對話框 ──────────────────────────────── */}
      {pendingImage && (
        <ImageCompressDialog
          files={[pendingImage]}
          onConfirm={handleCompressConfirm}
          onCancel={() => setPendingImage(null)}
        />
      )}

      {/* 上傳進度 + 錯誤（屏幕居中覆蓋層，統一組件） */}
      <UploadProgressOverlay
        uploading={uploading}
        progress={progress}
        error={uploadError}
        onClearError={clearError}
      />

      {/* 媒體庫選擇器（複用統一組件） */}
      <MediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(url) => {
          setForm((f) => ({ ...f, pic: url }))
          setMediaPickerOpen(false)
        }}
      />

      {/* 單條刪除確認對話框 */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span>🗑️</span>
                刪除確認
              </h2>
              {!deleting && (
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="text-muted-foreground hover:text-foreground text-xl leading-none"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="flex items-start gap-2 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">
                <span className="shrink-0 text-base">⚠️</span>
                <span>刪除後無法恢復，確定要刪除此日曆圖片嗎？</span>
              </div>
              {deleteTarget.pic && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <img
                    src={deleteTarget.pic}
                    alt={deleteTarget.title || '日曆圖片'}
                    className="w-16 h-16 rounded border bg-white object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="text-sm">
                    <div className="font-medium">{deleteTarget.title || '(無標題)'}</div>
                    <div className="text-muted-foreground text-xs">ID: {deleteTarget.id}</div>
                  </div>
                </div>
              )}
              {deleteError && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-md text-sm">
                  <span className="shrink-0">⚠️</span>
                  {deleteError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
                    刪除中...
                  </>
                ) : (
                  <>
                    <span>🗑️</span>
                    確認刪除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量刪除確認對話框 */}
      {showBatchDeleteConfirm && selectedIds.size > 0 && !deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !deleting && setShowBatchDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span>🗑️</span>
                批量刪除確認（{selectedIds.size} 項）
              </h2>
              {!deleting && (
                <button
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  className="text-muted-foreground hover:text-foreground text-xl leading-none"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="flex items-start gap-2 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">
                <span className="shrink-0 text-base">⚠️</span>
                <div className="space-y-1">
                  <div>即將刪除 {selectedIds.size} 項日曆圖片，刪除後無法恢復。</div>
                  <div className="text-xs text-red-600">將逐條刪除，如遇網路問題部分項可能失敗。</div>
                </div>
              </div>
              {/* 待刪除列表預覽 */}
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                {sortedCalendars
                  .filter((c) => selectedIds.has(c.id))
                  .map((item) => (
                    <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      {item.pic ? (
                        <img
                          src={item.pic}
                          alt={item.title || ''}
                          className="w-8 h-8 rounded border bg-gray-50 object-contain shrink-0"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="w-8 h-8 rounded border bg-gray-50 flex items-center justify-center text-xs shrink-0">🖼️</span>
                      )}
                      <span className="text-muted-foreground w-12 shrink-0">#{item.id}</span>
                      <span className="font-medium truncate">{item.title || '(無標題)'}</span>
                    </div>
                  ))}
              </div>
              {deleteError && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-md text-sm">
                  <span className="shrink-0">⚠️</span>
                  {deleteError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
              <button
                onClick={() => setShowBatchDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmBatchDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
                    刪除中...
                  </>
                ) : (
                  <>
                    <span>🗑️</span>
                    確認批量刪除（{selectedIds.size} 項）
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
