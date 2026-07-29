import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { cn, getPageNumbers } from '../lib/utils'
import { LoadingState, EmptyState } from '../components/StateDisplay'

/** 預約排期數據結構 */
interface BookingSchedule {
  id: number
  service_type: string
  location: string
  booking_date: string
  time_slot: string
  max_seats: number
  status: string
  sorting: number
}

/** 行內編輯表單 */
interface EditForm {
  service_type: string
  location: string
  booking_date: string
  time_slot: string
  max_seats: number
  status: string
}

/** 批量新增表單 */
interface BatchForm {
  service_type: string
  dates: string[]
  time_slots: string[]
  max_seats: number
}

/** 服務類型選項 */
const SERVICE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: 'Smile Pro旺角' },
  { value: '2', label: 'Smile Pro中環' },
  { value: '3', label: 'Smile中環' },
]

/** 地點標籤映射 */
const LOCATION_LABELS: Record<string, string> = {
  '1': '旺角',
  '2': '中環',
}

/** 時段選項 */
const TIME_SLOT_OPTIONS = ['上午', '下午']

/** 狀態標籤映射 */
const STATUS_LABELS: Record<string, string> = {
  '1': '可用',
  '0': '停用',
}

/** 根據服務類型推導地點：type '1' → 旺角(1), type '2'/'3' → 中環(2) */
function deriveLocation(serviceType: string): string {
  return serviceType === '1' ? '1' : '2'
}

/** 取得服務類型標籤 */
function getServiceTypeLabel(type: string): string {
  return SERVICE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

const PAGE_SIZE = 20

export default function BookingSchedule() {
  // ─── 列表狀態 ──────────────────────────────────────────
  const [schedules, setSchedules] = useState<BookingSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // ─── 篩選狀態 ──────────────────────────────────────────
  const [filterServiceType, setFilterServiceType] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // ─── 分頁狀態 ──────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ─── 批量選擇 ──────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // ─── 批量新增對話框 ────────────────────────────────────
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchForm, setBatchForm] = useState<BatchForm>({
    service_type: '1',
    dates: [],
    time_slots: ['上午', '下午'],
    max_seats: 10,
  })
  const [batchDateInput, setBatchDateInput] = useState('')
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchError, setBatchError] = useState('')

  // ─── 行內編輯 ──────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // ─── 重新載入觸發器 ────────────────────────────────────
  const [refreshCounter, setRefreshCounter] = useState(0)
  const refresh = useCallback(() => setRefreshCounter((c) => c + 1), [])

  /** 載入排期列表（依賴篩選、分頁、refreshCounter） */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('pagesize', String(PAGE_SIZE))
        if (filterServiceType !== 'all') {
          params.set('service_type', filterServiceType)
          params.set('location', deriveLocation(filterServiceType))
        }
        if (filterDateFrom) params.set('date_from', filterDateFrom)
        if (filterDateTo) params.set('date_to', filterDateTo)
        const res = await api.get<BookingSchedule[]>(
          `/admin/booking/schedules?${params.toString()}`,
        )
        if (!cancelled) {
          setSchedules(res.data ?? [])
          setTotal(res.meta?.total ?? 0)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '載入失敗')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page, filterServiceType, filterDateFrom, filterDateTo, refreshCounter])

  /** 重置篩選 */
  const handleResetFilter = () => {
    setFilterServiceType('all')
    setFilterDateFrom('')
    setFilterDateTo('')
    setPage(1)
    setSelectedIds(new Set())
  }

  // ─── 批量選擇處理 ──────────────────────────────────────
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(schedules.map((s) => s.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  // ─── 批量新增處理 ──────────────────────────────────────
  const openBatch = () => {
    setBatchForm({
      service_type: '1',
      dates: [],
      time_slots: ['上午', '下午'],
      max_seats: 10,
    })
    setBatchDateInput('')
    setBatchError('')
    setBatchOpen(true)
  }

  const handleAddBatchDate = () => {
    if (!batchDateInput) return
    if (batchForm.dates.includes(batchDateInput)) {
      setBatchError('此日期已添加')
      return
    }
    setBatchForm((f) => ({ ...f, dates: [...f.dates, batchDateInput].sort() }))
    setBatchDateInput('')
    setBatchError('')
  }

  const handleRemoveBatchDate = (date: string) => {
    setBatchForm((f) => ({ ...f, dates: f.dates.filter((d) => d !== date) }))
  }

  const handleToggleTimeSlot = (slot: string) => {
    setBatchForm((f) => {
      const has = f.time_slots.includes(slot)
      return {
        ...f,
        time_slots: has
          ? f.time_slots.filter((s) => s !== slot)
          : [...f.time_slots, slot],
      }
    })
  }

  const handleBatchCreate = async () => {
    if (batchForm.dates.length === 0) {
      setBatchError('請至少選擇一個日期')
      return
    }
    if (batchForm.time_slots.length === 0) {
      setBatchError('請至少選擇一個時段')
      return
    }
    if (batchForm.max_seats < 1) {
      setBatchError('最大座位數必須大於 0')
      return
    }
    setBatchSaving(true)
    setBatchError('')
    try {
      await api.post('/admin/booking/schedules/batch', {
        service_type: batchForm.service_type,
        dates: batchForm.dates,
        time_slots: batchForm.time_slots,
        max_seats: batchForm.max_seats,
      })
      setBatchOpen(false)
      setPage(1)
      refresh()
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : '批量新增失敗')
    } finally {
      setBatchSaving(false)
    }
  }

  // ─── 行內編輯處理 ──────────────────────────────────────
  const openEdit = (item: BookingSchedule) => {
    setEditingId(item.id)
    setEditForm({
      service_type: item.service_type,
      location: item.location,
      booking_date: item.booking_date,
      time_slot: item.time_slot,
      max_seats: item.max_seats,
      status: item.status,
    })
    setEditError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(null)
    setEditError('')
  }

  /** 編輯時切換服務類型，自動推導地點 */
  const handleEditServiceTypeChange = (st: string) => {
    setEditForm((f) => (f ? { ...f, service_type: st, location: deriveLocation(st) } : f))
  }

  const handleSaveEdit = async () => {
    if (!editForm || editingId === null) return
    if (!editForm.booking_date) {
      setEditError('請選擇日期')
      return
    }
    if (editForm.max_seats < 1) {
      setEditError('最大座位數必須大於 0')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      await api.put(`/admin/booking/schedules/${editingId}`, {
        service_type: editForm.service_type,
        location: editForm.location,
        booking_date: editForm.booking_date,
        time_slot: editForm.time_slot,
        max_seats: editForm.max_seats,
        status: editForm.status,
      })
      cancelEdit()
      refresh()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setEditSaving(false)
    }
  }

  // ─── 狀態切換（表格中直接切換） ────────────────────────
  const handleToggleStatus = async (item: BookingSchedule) => {
    const newStatus = item.status === '1' ? '0' : '1'
    // 樂觀更新
    setSchedules((prev) =>
      prev.map((s) => (s.id === item.id ? { ...s, status: newStatus } : s)),
    )
    try {
      await api.put(`/admin/booking/schedules/${item.id}`, { status: newStatus })
    } catch {
      // 失敗時回滾
      setSchedules((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, status: item.status } : s)),
      )
      setError('更新狀態失敗')
    }
  }

  // ─── 刪除處理 ──────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!window.confirm('確定要刪除此排期嗎？')) return
    setActionLoading(id)
    try {
      await api.del(`/admin/booking/schedules/${id}`)
      // 從選中集合中移除
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`確定要刪除選中的 ${selectedIds.size} 條排期嗎？`)) return
    setActionLoading(-1)
    try {
      const ids = Array.from(selectedIds)
      await api.del(`/admin/booking/schedules/batch?ids=${ids.join(',')}`)
      setSelectedIds(new Set())
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量刪除失敗')
    } finally {
      setActionLoading(null)
    }
  }

  // ─── 衍生變量 ──────────────────────────────────────────
  const allSelected = schedules.length > 0 && schedules.every((s) => selectedIds.has(s.id))
  const someSelected = selectedIds.size > 0 && !allSelected
  const batchPreviewCount = batchForm.dates.length * batchForm.time_slots.length

  return (
    <div className="p-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">預約排期管理</h1>
        <button
          onClick={openBatch}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
        >
          <span className="mr-1">➕</span>
          批量新增排期
        </button>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive rounded-md text-sm">
          <span className="shrink-0">⚠️</span>
          {error}
        </div>
      )}

      {/* 篩選欄 */}
      <div className="mb-4 flex items-center gap-3 flex-wrap p-4 bg-white rounded-lg border">
        {/* 服務類型篩選 */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">服務類型</label>
          <select
            value={filterServiceType}
            onChange={(e) => {
              setFilterServiceType(e.target.value)
              setPage(1)
              setSelectedIds(new Set())
            }}
            className="px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm bg-white"
          >
            <option value="all">全部</option>
            {SERVICE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* 日期範圍篩選 */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">日期範圍</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => {
              setFilterDateFrom(e.target.value)
              setPage(1)
            }}
            className="px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
          <span className="text-muted-foreground">~</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => {
              setFilterDateTo(e.target.value)
              setPage(1)
            }}
            className="px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>

        {/* 重置 */}
        <button
          onClick={handleResetFilter}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
        >
          🔄 重置
        </button>

        {/* 批量刪除 */}
        {selectedIds.size > 0 && (
          <button
            onClick={handleBatchDelete}
            disabled={actionLoading === -1}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 ml-auto"
          >
            {actionLoading === -1 ? (
              <>
                <span className="animate-spin inline-block">🔄</span>
                刪除中...
              </>
            ) : (
              <>
                <span>🗑️</span>
                批量刪除（{selectedIds.size}）
              </>
            )}
          </button>
        )}
      </div>

      {/* 加載中 */}
      {loading && <LoadingState text="載入中..." />}

      {/* 空狀態 */}
      {!loading && schedules.length === 0 && !error && (
        <>
          <EmptyState icon="📅" text="尚未創建任何預約排期" hint="點擊「批量新增排期」創建時段" />
          <div className="flex justify-center -mt-16 pb-8">
            <button
              onClick={openBatch}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
            >
              <span className="mr-1">➕</span>
              批量新增排期
            </button>
          </div>
        </>
      )}

      {/* 排期表格 */}
      {!loading && schedules.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">日期</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">時段</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">服務類型</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">地點</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">最大座位數</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">狀態</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((item) => {
                  const isEditing = editingId === item.id

                  if (isEditing && editForm) {
                    return (
                      <tr key={item.id} className="border-b last:border-0 bg-blue-50/40">
                        {/* checkbox（編輯時禁用） */}
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            disabled
                            className="w-4 h-4 rounded opacity-40"
                          />
                        </td>
                        {/* 日期 */}
                        <td className="px-4 py-3">
                          <input
                            type="date"
                            value={editForm.booking_date}
                            onChange={(e) =>
                              setEditForm((f) => (f ? { ...f, booking_date: e.target.value } : f))
                            }
                            className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                        </td>
                        {/* 時段 */}
                        <td className="px-4 py-3">
                          <select
                            value={editForm.time_slot}
                            onChange={(e) =>
                              setEditForm((f) => (f ? { ...f, time_slot: e.target.value } : f))
                            }
                            className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                          >
                            {TIME_SLOT_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* 服務類型 */}
                        <td className="px-4 py-3">
                          <select
                            value={editForm.service_type}
                            onChange={(e) => handleEditServiceTypeChange(e.target.value)}
                            className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                          >
                            {SERVICE_TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* 地點（自動推導，只讀） */}
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                            {LOCATION_LABELS[editForm.location] ?? editForm.location}
                          </span>
                        </td>
                        {/* 最大座位數 */}
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={1}
                            value={editForm.max_seats}
                            onChange={(e) =>
                              setEditForm((f) =>
                                f ? { ...f, max_seats: Number(e.target.value) || 0 } : f,
                              )
                            }
                            className="w-20 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                        </td>
                        {/* 狀態 */}
                        <td className="px-4 py-3">
                          <select
                            value={editForm.status}
                            onChange={(e) =>
                              setEditForm((f) => (f ? { ...f, status: e.target.value } : f))
                            }
                            className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                          >
                            <option value="1">可用</option>
                            <option value="0">停用</option>
                          </select>
                        </td>
                        {/* 操作：保存 / 取消 */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={handleSaveEdit}
                              disabled={editSaving}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                            >
                              {editSaving ? (
                                <span className="animate-spin inline-block">🔄</span>
                              ) : (
                                <span className="text-sm">💾</span>
                              )}
                              保存
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={editSaving}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-accent rounded transition-colors disabled:opacity-50"
                            >
                              <span className="text-sm">❌</span>
                              取消
                            </button>
                          </div>
                          {editError && (
                            <p className="text-xs text-destructive mt-1 text-right">{editError}</p>
                          )}
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        'border-b last:border-0 hover:bg-accent/50 transition-colors',
                        selectedIds.has(item.id) && 'bg-blue-50/40',
                      )}
                    >
                      {/* checkbox */}
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => handleSelectRow(item.id, e.target.checked)}
                          className="w-4 h-4 rounded accent-primary cursor-pointer"
                        />
                      </td>
                      {/* 日期 */}
                      <td className="px-4 py-3 font-medium">{item.booking_date || '-'}</td>
                      {/* 時段 */}
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600">
                          {item.time_slot || '-'}
                        </span>
                      </td>
                      {/* 服務類型 */}
                      <td className="px-4 py-3 text-muted-foreground">
                        {getServiceTypeLabel(item.service_type)}
                      </td>
                      {/* 地點 */}
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                          {LOCATION_LABELS[item.location] ?? item.location}
                        </span>
                      </td>
                      {/* 最大座位數 */}
                      <td className="px-4 py-3 text-muted-foreground">{item.max_seats}</td>
                      {/* 狀態 */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleStatus(item)}
                          className={cn(
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                            item.status === '1' ? 'bg-primary' : 'bg-muted',
                          )}
                          title={item.status === '1' ? '點擊停用' : '點擊啟用'}
                        >
                          <span
                            className={cn(
                              'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                              item.status === '1' ? 'translate-x-5' : 'translate-x-1',
                            )}
                          />
                        </button>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {STATUS_LABELS[item.status] ?? item.status}
                        </span>
                      </td>
                      {/* 操作 */}
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
                            {actionLoading === item.id ? (
                              <span className="animate-spin inline-block text-sm">🔄</span>
                            ) : (
                              <span className="text-sm">🗑️</span>
                            )}
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

          {/* 分頁 */}
          <div className="px-4 py-3 bg-slate-50 border-t flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              共 {total} 條，第 {page}/{totalPages} 頁
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  ⬅️ 上一頁
                </button>
                {getPageNumbers(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="px-2 text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'px-3 py-1.5 text-sm border rounded-md transition-colors',
                        p === page
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent',
                      )}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  下一頁 ➡️
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 批量新增對話框 ──────────────────────────────── */}
      {batchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">📅 批量新增排期</h2>
              <button
                onClick={() => !batchSaving && setBatchOpen(false)}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                ❌
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* 服務類型 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  服務類型 <span className="text-destructive">*</span>
                </label>
                <select
                  value={batchForm.service_type}
                  onChange={(e) =>
                    setBatchForm((f) => ({ ...f, service_type: e.target.value }))
                  }
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm bg-white"
                >
                  {SERVICE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  地點將自動推導為：
                  <span className="font-medium text-foreground">
                    {LOCATION_LABELS[deriveLocation(batchForm.service_type)]}
                  </span>
                </p>
              </div>

              {/* 日期選擇（多選） */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  日期 <span className="text-destructive">*</span>
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    （可選擇多個日期）
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={batchDateInput}
                    onChange={(e) => setBatchDateInput(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddBatchDate}
                    disabled={!batchDateInput}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    ➕ 新增日期
                  </button>
                </div>
                {/* 已選日期列表 */}
                {batchForm.dates.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {batchForm.dates.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium"
                      >
                        {d}
                        <button
                          type="button"
                          onClick={() => handleRemoveBatchDate(d)}
                          className="hover:text-red-600 transition-colors"
                          title="移除"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 時段選擇（多選） */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  時段 <span className="text-destructive">*</span>
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    （可勾選多個）
                  </span>
                </label>
                <div className="flex gap-4">
                  {TIME_SLOT_OPTIONS.map((slot) => {
                    const checked = batchForm.time_slots.includes(slot)
                    return (
                      <label
                        key={slot}
                        className={cn(
                          'inline-flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer transition-colors text-sm',
                          checked
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'hover:bg-accent',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleTimeSlot(slot)}
                          className="w-4 h-4 rounded accent-primary"
                        />
                        {slot}
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* 最大座位數 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">最大座位數</label>
                <input
                  type="number"
                  min={1}
                  value={batchForm.max_seats}
                  onChange={(e) =>
                    setBatchForm((f) => ({
                      ...f,
                      max_seats: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                />
              </div>

              {/* 預覽 */}
              {batchPreviewCount > 0 && (
                <div className="px-4 py-3 bg-blue-50 text-blue-700 rounded-lg text-sm flex items-center gap-2">
                  <span>💡</span>
                  將創建 <span className="font-bold">{batchPreviewCount}</span> 條排期
                  <span className="text-blue-500 text-xs">
                    （{batchForm.dates.length} 個日期 × {batchForm.time_slots.length} 個時段）
                  </span>
                </div>
              )}

              {/* 錯誤提示 */}
              {batchError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <span className="mr-1">⚠️</span>
                  {batchError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button
                onClick={() => setBatchOpen(false)}
                disabled={batchSaving}
                className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleBatchCreate}
                disabled={batchSaving || batchPreviewCount === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {batchSaving && <span className="animate-spin inline-block">🔄</span>}
                {batchSaving ? '創建中...' : `確認新增（${batchPreviewCount} 條）`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
