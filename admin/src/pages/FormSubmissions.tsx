import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '../lib/api'
import { cn, formatDate } from '../lib/utils'
import { LoadingState, EmptyState, ErrorState } from '../components/StateDisplay'

/** 表單提交列表項 */
interface Submission {
  id: number
  form_key: string
  name: string
  tel: string
  email: string
  status: string
  status_label: string
  source_url: string
  create_time: string
  preview: string
}

/** 表單提交詳情 */
interface SubmissionDetail extends Submission {
  data: Record<string, unknown>
  user_ip: string
  user_os: string
  user_bs: string
  acode: string
}

/** 狀態篩選 */
const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: '0', label: '待處理', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: '1', label: '已處理', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: '2', label: '已封存', color: 'bg-gray-100 text-gray-500 border-gray-200' },
] as const

const STATUS_BADGES: Record<string, string> = {
  '0': 'bg-amber-100 text-amber-700 border-amber-200',
  '1': 'bg-green-100 text-green-700 border-green-200',
  '2': 'bg-gray-100 text-gray-500 border-gray-200',
}

const STATUS_DOT: Record<string, string> = {
  '0': 'bg-amber-500',
  '1': 'bg-green-500',
  '2': 'bg-gray-400',
}

/** 計算 ISO 週的起始日（週一）和結束日（週日） */
function getWeekRange(dateStr: string): { key: string; label: string; sortKey: number } {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return { key: 'unknown', label: '未知時間', sortKey: 0 }
  d.setHours(0, 0, 0, 0)
  // 週一作為一週的開始（getDay: 0=週日, 1=週一, ...）
  const dayOfWeek = d.getDay()
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // 回到週一
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const fmt = (dt: Date) => `${dt.getMonth() + 1}/${dt.getDate()}`
  const key = `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`
  const sortKey = monday.getTime()
  const label = `${fmt(monday)} ~ ${fmt(sunday)}`
  return { key, label, sortKey }
}

/** 格式化時間為簡短顯示 */
function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (isToday) return `${hh}:${mm}`
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

export default function FormSubmissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<SubmissionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [stats, setStats] = useState({ total: 0, pending: 0, processed: 0, archived: 0 })

  const PAGESIZE = 50

  /** 拉取列表 */
  const fetchSubmissions = useCallback(async (pageNum: number, append = false) => {
    if (pageNum === 1) setLoading(true)
    else setLoadingMore(true)
    setError('')
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        pagesize: String(PAGESIZE),
        sort: sortBy,
      })
      if (statusFilter) params.set('status', statusFilter)
      if (search.trim()) params.set('search', search.trim())

      const res = await api.get<Submission[]>('/admin/forms/submissions', params)
      const data = Array.isArray(res.data) ? res.data : []
      if (append) {
        setSubmissions((prev) => [...prev, ...data])
      } else {
        setSubmissions(data)
      }
      setTotal(res.meta?.total || 0)
      setHasMore(data.length === PAGESIZE && pageNum * PAGESIZE < (res.meta?.total || 0))
      setPage(pageNum)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加載失敗')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [search, statusFilter, sortBy])

  /** 拉取統計 */
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<{ total: number; pending: number; processed: number; archived: number }>(
        '/admin/forms/submissions/stats',
      )
      setStats(res.data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchSubmissions(1)
    fetchStats()
  }, [fetchSubmissions, fetchStats])

  /** 搜索/篩選變更時重新加載 */
  useEffect(() => {
    const timer = setTimeout(() => fetchSubmissions(1), 300)
    return () => clearTimeout(timer)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSubmissions(1)
  }, [statusFilter, sortBy]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 查看詳情 */
  const handleViewDetail = async (id: number) => {
    setDetailLoading(true)
    setSelectedDetail(null)
    try {
      const res = await api.get<SubmissionDetail>(`/admin/forms/submissions/${id}`)
      setSelectedDetail(res.data)
      // 如果是待處理，自動標記為已處理
      if (res.data.status === '0') {
        await api.put(`/admin/forms/submissions/${id}`, { status: '1' })
        setSubmissions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: '1', status_label: '已處理' } : s)),
        )
        fetchStats()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '獲取詳情失敗')
    } finally {
      setDetailLoading(false)
    }
  }

  /** 更新狀態 */
  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await api.put(`/admin/forms/submissions/${id}`, { status })
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, status, status_label: STATUS_FILTERS.find((f) => f.value === status)?.label || s.status_label }
            : s,
        ),
      )
      if (selectedDetail?.id === id) {
        setSelectedDetail({ ...selectedDetail, status, status_label: STATUS_FILTERS.find((f) => f.value === status)?.label || selectedDetail.status_label })
      }
      fetchStats()
    } catch (err) {
      setError(err instanceof Error ? err.message : '狀態更新失敗')
    }
  }

  /** 刪除 */
  const handleDelete = async (id: number) => {
    if (!confirm('確認刪除此表單記錄？此操作不可恢復。')) return
    try {
      await api.del(`/admin/forms/submissions/${id}`)
      setSubmissions((prev) => prev.filter((s) => s.id !== id))
      setSelectedDetail(null)
      fetchStats()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    }
  }

  /** 按週分組 */
  const groupedByWeek = useMemo(() => {
    const groups: { weekKey: string; weekLabel: string; sortKey: number; items: Submission[] }[] = []
    for (const sub of submissions) {
      const { key, label, sortKey } = getWeekRange(sub.create_time)
      let group = groups.find((g) => g.weekKey === key)
      if (!group) {
        group = { weekKey: key, weekLabel: label, sortKey, items: [] }
        groups.push(group)
      }
      group.items.push(sub)
    }
    // 按 sortKey 降序排列（最新的週在前）
    return groups.sort((a, b) => b.sortKey - a.sortKey)
  }, [submissions])

  if (loading) return <LoadingState message="載入表單列表..." />
  if (error && submissions.length === 0) return <ErrorState message={error} onRetry={() => fetchSubmissions(1)} />

  return (
    <div className="space-y-4">
      {/* 頁面標題 + 統計 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="text-2xl">📝</span>
          自定義表單
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            待處理 {stats.pending}
          </span>
          <span className="px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
            已處理 {stats.processed}
          </span>
          <span className="px-3 py-1 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
            已封存 {stats.archived}
          </span>
        </div>
      </div>

      {/* 工具欄 */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 搜索姓名 / 電話 / 郵箱..."
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                statusFilter === f.value
                  ? 'bg-white shadow-sm font-medium text-gray-900'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')}
          className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
        >
          <option value="newest">最新優先</option>
          <option value="oldest">最早優先</option>
        </select>
      </div>

      {error && (
        <div className="px-4 py-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      {/* 瀑布流列表 */}
      {submissions.length === 0 ? (
        <EmptyState icon="📭" message="暫無表單提交記錄" />
      ) : (
        <div className="space-y-6">
          {groupedByWeek.map((group) => (
            <div key={group.weekKey}>
              {/* 週分隔線 */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                <span className="text-xs font-medium text-gray-400 px-2">
                  {group.weekLabel}
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
              </div>
              {/* 卡片網格 */}
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                }}
              >
                {group.items.map((sub) => (
                  <SubmissionCard
                    key={sub.id}
                    submission={sub}
                    onClick={() => handleViewDetail(sub.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 載入更多 */}
      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            onClick={() => fetchSubmissions(page + 1, true)}
            disabled={loadingMore}
            className="px-6 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
          >
            {loadingMore ? '載入中...' : `載入更多（剩餘 ${total - submissions.length} 條）`}
          </button>
        </div>
      )}

      {/* 詳情對話框 */}
      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-8 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">載入詳情...</span>
          </div>
        </div>
      )}
      {selectedDetail && (
        <SubmissionDetailModal
          detail={selectedDetail}
          onClose={() => setSelectedDetail(null)}
          onUpdateStatus={(status) => handleUpdateStatus(selectedDetail.id, status)}
          onDelete={() => handleDelete(selectedDetail.id)}
        />
      )}
    </div>
  )
}

/** 表單卡片 */
function SubmissionCard({ submission, onClick }: { submission: Submission; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group"
    >
      {/* 頂部：姓名 + 狀態 */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[submission.status] || 'bg-gray-400')} />
          <span className="font-medium text-gray-900 truncate">
            {submission.name || '未署名'}
          </span>
        </div>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded border shrink-0',
          STATUS_BADGES[submission.status] || 'bg-gray-100 text-gray-500 border-gray-200',
        )}>
          {submission.status_label}
        </span>
      </div>
      {/* 預覽字段 */}
      <div className="space-y-1 text-xs text-gray-500">
        {submission.tel && (
          <div className="flex items-center gap-1">
            <span>📞</span>
            <span className="truncate">{submission.tel}</span>
          </div>
        )}
        {submission.email && (
          <div className="flex items-center gap-1">
            <span>📧</span>
            <span className="truncate">{submission.email}</span>
          </div>
        )}
        {submission.preview && (
          <div className="flex items-start gap-1">
            <span>📋</span>
            <span className="truncate text-gray-400 group-hover:text-gray-500 transition-colors">
              {submission.preview}
            </span>
          </div>
        )}
      </div>
      {/* 底部時間 */}
      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
        <span className="flex items-center gap-1">
          {submission.form_key !== 'general' && (
            <span className="px-1.5 py-0.5 bg-gray-50 rounded text-[10px]">{submission.form_key}</span>
          )}
        </span>
        <span>{formatTime(submission.create_time)}</span>
      </div>
    </div>
  )
}

/** 詳情對話框 */
function SubmissionDetailModal({
  detail,
  onClose,
  onUpdateStatus,
  onDelete,
}: {
  detail: SubmissionDetail
  onClose: () => void
  onUpdateStatus: (status: string) => void
  onDelete: () => void
}) {
  // 將 data 中的字段分為常用和擴展
  const dataEntries = useMemo(() => {
    return Object.entries(detail.data).filter(([, v]) => v !== undefined && v !== null && v !== '')
  }, [detail.data])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 頭部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-blue-50/50 to-transparent">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h2 className="font-bold text-gray-900">
              {detail.name || '未署名'}
            </h2>
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border',
              STATUS_BADGES[detail.status] || 'bg-gray-100 text-gray-500 border-gray-200',
            )}>
              {detail.status_label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* 表單數據 */}
        <div className="px-5 py-4 space-y-3">
          {detail.form_key !== 'general' && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>表單類型:</span>
              <span className="px-2 py-0.5 bg-gray-50 rounded font-mono">{detail.form_key}</span>
            </div>
          )}
          {dataEntries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">無數據</p>
          ) : (
            <div className="space-y-2">
              {dataEntries.map(([key, value]) => (
                <div key={key} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
                  <span className="text-xs font-medium text-gray-400 min-w-[80px] shrink-0 pt-0.5">{key}</span>
                  <span className="text-sm text-gray-900 break-all flex-1">
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 元數據 */}
        <div className="px-5 py-3 bg-gray-50/50 border-t text-xs text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>提交時間</span>
            <span className="text-gray-600">{formatDate(detail.create_time)}</span>
          </div>
          {detail.user_ip && (
            <div className="flex justify-between">
              <span>IP 位址</span>
              <span className="text-gray-600 font-mono">{detail.user_ip}</span>
            </div>
          )}
          {(detail.user_os || detail.user_bs) && (
            <div className="flex justify-between">
              <span>客戶端</span>
              <span className="text-gray-600">{detail.user_os} / {detail.user_bs}</span>
            </div>
          )}
          {detail.source_url && (
            <div className="flex justify-between gap-2">
              <span className="shrink-0">來源</span>
              <a
                href={detail.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline truncate"
              >
                {detail.source_url}
              </a>
            </div>
          )}
        </div>

        {/* 操作按鈕 */}
        <div className="flex items-center gap-2 px-5 py-3 border-t">
          {detail.status !== '0' && (
            <button
              onClick={() => onUpdateStatus('0')}
              className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
            >
              標記待處理
            </button>
          )}
          {detail.status !== '1' && (
            <button
              onClick={() => onUpdateStatus('1')}
              className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100"
            >
              標記已處理
            </button>
          )}
          {detail.status !== '2' && (
            <button
              onClick={() => onUpdateStatus('2')}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100"
            >
              封存
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
          >
            刪除
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
