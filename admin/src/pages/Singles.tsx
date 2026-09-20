import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { cn, type Category } from '../lib/utils'
import { LoadingState, EmptyState } from '../components/StateDisplay'

/** 單頁狀態: '1'=已發布, '0'=草稿 */
type SingleStatus = '1' | '0'

/** 單頁數據結構 */
interface Single {
  id: number
  title: string
  scode: string
  filename?: string
  content: string
  keywords: string
  description: string
  status: SingleStatus
  sorting: number
  createtime?: string
  updatetime?: string
}

/** 根據狀態取得徽章樣式 */
function getStatusBadge(status: SingleStatus): { label: string; className: string } {
  switch (status) {
    case '1':
      return { label: '已發布', className: 'bg-emerald-100 text-emerald-700' }
    case '0':
      return { label: '草稿', className: 'bg-gray-100 text-gray-600' }
    default:
      return { label: '未知', className: 'bg-gray-100 text-gray-600' }
  }
}

/** 遞歸構建欄目字典 */
function buildCategoryDict(categories: Category[]): Record<string, Category> {
  const dict: Record<string, Category> = {}
  function traverse(list: Category[]) {
    for (const item of list) {
      dict[item.scode] = item
      if (item.children && item.children.length > 0) {
        traverse(item.children)
      }
    }
  }
  traverse(categories)
  return dict
}

export default function Singles() {
  const [singles, setSingles] = useState<Single[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [copyingId, setCopyingId] = useState<number | null>(null)
  const [sortSaving, setSortSaving] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  /** 載入欄目樹（使用白名單端點 /all） */
  useEffect(() => {
    api
      .get<Category[]>('/admin/sorts/all')
      .then((res) => setCategories(res.data ?? []))
      .catch(() => {})
  }, [])

  /** 載入單頁列表 */
  const fetchSingles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Single[]>('/admin/singles?pagesize=100')
      setSingles(res.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSingles()
  }, [fetchSingles])

  const categoryDict = useMemo(() => buildCategoryDict(categories), [categories])

  /** 複製單頁 (一鍵克隆為草稿副本) */
  const handleCopy = async (id: number) => {
    setCopyingId(id)
    try {
      await api.post(`/admin/singles/${id}/copy`, {})
      await fetchSingles()
    } catch (err) {
      setError(err instanceof Error ? err.message : '複製失敗')
    } finally {
      setCopyingId(null)
    }
  }

  /** 刪除單頁 */
  const handleDelete = async (id: number) => {
    if (!window.confirm('確定要刪除此專題頁面嗎？')) return
    setActionLoading(id)
    try {
      await api.del(`/admin/singles/${id}`)
      await fetchSingles()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    } finally {
      setActionLoading(null)
    }
  }

  /** inline 修改排序 */
  const handleSortSave = async (id: number, value: number) => {
    setSortSaving(id)
    try {
      await api.put(`/admin/singles/${id}`, { sorting: value })
      await fetchSingles()
    } catch (err) {
      setError(err instanceof Error ? err.message : '排序更新失敗')
    } finally {
      setSortSaving(null)
    }
  }

  /** 複製 API 連結 */
  const handleCopyApi = (single: Single) => {
    const slug = single.filename ? single.filename : String(single.id)
    const url = `${window.location.origin}/api/v1/singles/${slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(single.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  /** 篩選後的單頁列表 */
  const filteredSingles = useMemo(() => {
    if (!searchKeyword.trim()) return singles
    const q = searchKeyword.trim().toLowerCase()
    return singles.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.filename && s.filename.toLowerCase().includes(q)) ||
        (s.scode && s.scode.includes(q))
    )
  }, [singles, searchKeyword])

  return (
    <div className="p-6">
      {/* 頁首 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">單頁 / 專題落地頁管理</h1>
          <p className="text-xs text-muted-foreground mt-1">
            管理宣傳專題、促銷落地頁及獨立單頁，支援根目錄與子欄目掛載
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜尋標題 / 別名..."
            className="px-3 py-1.5 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 w-48 sm:w-60 shadow-sm"
          />
          <Link
            to="/singles/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-sm font-medium shadow-sm"
          >
            <span>➕</span>
            <span>新增專題</span>
          </Link>
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* 加載中 */}
      {loading && <LoadingState text="載入中..." />}

      {/* 空狀態 */}
      {!loading && singles.length === 0 && !error && (
        <div className="flex flex-col items-center">
          <EmptyState icon="📄" text="尚未創建任何專題頁面" />
          <Link
            to="/singles/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-sm -mt-10"
          >
            <span>➕</span>
            <span>立即創建第一篇專題</span>
          </Link>
        </div>
      )}

      {/* 單頁表格 */}
      {!loading && singles.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/70">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-16">ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">專題標題</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">所屬目錄 / 訪問路徑</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-20">排序</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-24">狀態</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground w-44">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredSingles.map((item) => {
                  const badge = getStatusBadge(item.status)
                  const isRoot = !item.scode || item.scode === '0'
                  const category = categoryDict[item.scode]
                  const catFolder = isRoot ? '' : (category?.filename || `cat-${item.scode}`)
                  const slug = item.filename ? item.filename : String(item.id)
                  const fullPath = isRoot ? `/${slug}` : `/${catFolder}/${slug}`

                  return (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.id}</td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/singles/${item.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors line-clamp-1"
                        >
                          {item.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {isRoot ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-medium">
                                <span>🌐</span>
                                <span>根目錄 (/)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 font-medium">
                                <span>📁</span>
                                <span>{category ? category.name : `欄目 ${item.scode}`}</span>
                              </span>
                            )}
                            <code className="text-xs text-slate-500 font-mono">{fullPath}</code>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => handleCopyApi(item)}
                              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-mono transition-colors"
                              title="複製 API 端點"
                            >
                              <span>{copiedId === item.id ? '✅ 已複製' : '📋 API: /api/v1/singles/' + slug}</span>
                            </button>
                          </div>
                        </div>
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
                          className="w-16 px-2 py-1 border rounded-md text-xs text-center focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                          title="數字越小越靠前"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-block px-2.5 py-0.5 rounded-full text-xs font-medium',
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/singles/${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="編輯"
                          >
                            <span>✏️</span>
                            <span>編輯</span>
                          </Link>
                          <button
                            onClick={() => handleCopy(item.id)}
                            disabled={copyingId === item.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-50"
                            title="一鍵複製此專題"
                          >
                            <span>{copyingId === item.id ? '⏳' : '📑'}</span>
                            <span>複製</span>
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={actionLoading === item.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                            title="刪除"
                          >
                            <span>🗑️</span>
                            <span>刪除</span>
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
    </div>
  )
}
