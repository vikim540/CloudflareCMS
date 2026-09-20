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
  seo_title?: string
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
  const [copiedId, setCopiedId] = useState<number | null>(null)

  /** 載入專題欄目樹（僅過濾單頁/專題模型 mcode=1） */
  useEffect(() => {
    api
      .get<Category[]>('/admin/sorts/all?mcode=1')
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
        (s.seo_title && s.seo_title.toLowerCase().includes(q)) ||
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
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-sm font-medium shadow-sm whitespace-nowrap shrink-0"
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
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b bg-gray-50/70">
                  <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground w-16">ID</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground min-w-[200px]">專題名稱</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground min-w-[240px]">所屬目錄 / 訪問路徑</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground w-24">狀態</th>
                  <th className="px-5 py-3.5 text-right font-semibold text-muted-foreground w-52 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
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
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-5 py-4 text-muted-foreground font-mono text-xs">{item.id}</td>
                      <td className="px-5 py-4">
                        <Link
                          to={`/singles/${item.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors block"
                        >
                          <div className="font-semibold text-slate-900 line-clamp-1">{item.title}</div>
                          {item.seo_title && item.seo_title !== item.title && (
                            <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5" title={item.seo_title}>
                              SEO: {item.seo_title}
                            </div>
                          )}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isRoot ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-medium whitespace-nowrap">
                                <span>🌐</span>
                                <span>根目錄 (/)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 font-medium whitespace-nowrap">
                                <span>📁</span>
                                <span>{category ? category.name : `欄目 ${item.scode}`}</span>
                              </span>
                            )}
                            <code className="text-xs text-slate-600 font-mono font-medium">{fullPath}</code>
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => handleCopyApi(item)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-mono transition-colors inline-flex items-center gap-1"
                              title="點擊複製完整 API 調用地址"
                            >
                              <span>{copiedId === item.id ? '✅ 已複製端點' : '📋 API: /api/v1/singles/' + slug}</span>
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            'inline-block px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <Link
                            to={`/singles/${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200/70 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                            title="編輯此專題"
                          >
                            <span>✏️</span>
                            <span>編輯</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.id)}
                            disabled={copyingId === item.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200/70 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 shadow-2xs"
                            title="一鍵複製此專題"
                          >
                            <span>{copyingId === item.id ? '⏳' : '📑'}</span>
                            <span>複製</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            disabled={actionLoading === item.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg border border-red-200/70 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 shadow-2xs"
                            title="刪除此專題"
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
