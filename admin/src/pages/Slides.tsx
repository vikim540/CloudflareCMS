import { useEffect, useState, useCallback } from 'react'
import { Plus, Edit, Trash2, X, Loader2, AlertCircle, Image as ImageIcon, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'

/** 幻燈片數據結構 */
interface Slide {
  id: number
  gid: string
  pic: string
  pic_mobile: string
  link: string
  title: string
  subtitle: string
  button_text: string
  sorting: number
}

/** 表單數據 */
interface SlideForm {
  gid: string
  pic: string
  pic_mobile: string
  link: string
  title: string
  subtitle: string
  button_text: string
  sorting: number
}

/** 空表單初始值 */
const EMPTY_FORM: SlideForm = {
  gid: '0',
  pic: '',
  pic_mobile: '',
  link: '',
  title: '',
  subtitle: '',
  button_text: '',
  sorting: 0,
}

export default function Slides() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // 對話框狀態
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Slide | null>(null)
  const [form, setForm] = useState<SlideForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  /** 載入幻燈片列表 */
  const fetchSlides = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Slide[]>('/admin/slides')
      setSlides(res.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSlides()
  }, [fetchSlides])

  /** 開啟新增對話框 */
  const openCreate = () => {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setActionError('')
    setModalOpen(true)
  }

  /** 開啟編輯對話框 */
  const openEdit = (item: Slide) => {
    setEditTarget(item)
    setForm({
      gid: item.gid ?? '0',
      pic: item.pic ?? '',
      pic_mobile: item.pic_mobile ?? '',
      link: item.link ?? '',
      title: item.title ?? '',
      subtitle: item.subtitle ?? '',
      button_text: item.button_text ?? '',
      sorting: item.sorting ?? 0,
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
        gid: form.gid,
        pic: form.pic.trim(),
        pic_mobile: form.pic_mobile,
        link: form.link,
        title: form.title,
        subtitle: form.subtitle,
        button_text: form.button_text,
        sorting: form.sorting,
      }
      if (editTarget) {
        await api.put(`/admin/slides/${editTarget.id}`, payload)
      } else {
        await api.post('/admin/slides', payload)
      }
      setModalOpen(false)
      await fetchSlides()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  /** 刪除幻燈片 */
  const handleDelete = async (id: number) => {
    if (!window.confirm('確定要刪除此幻燈片嗎?')) return
    setActionLoading(id)
    try {
      await api.del(`/admin/slides/${id}`)
      await fetchSlides()
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
        <h1 className="text-2xl font-bold">幻燈片管理</h1>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
        >
          <Plus className="w-4 h-4" />
          新增幻燈片
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
      {!loading && slides.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ImageIcon className="w-10 h-10 mb-3 opacity-50" />
          <p className="mb-3">尚未創建任何幻燈片</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
          >
            <Plus className="w-4 h-4" />
            新增幻燈片
          </button>
        </div>
      )}

      {/* 幻燈片表格 */}
      {!loading && slides.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">圖片</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">標題</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">副標題</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">連結</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">排序</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {slides.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b last:border-0 hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground">{item.id}</td>
                    <td className="px-4 py-3">
                      {item.pic ? (
                        <img
                          src={item.pic}
                          alt={item.title || '幻燈片'}
                          className="w-24 h-14 rounded object-cover border"
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">無圖片</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{item.title || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.subtitle || '-'}</td>
                    <td className="px-4 py-3">
                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline truncate max-w-[160px]"
                        >
                          <span className="truncate">{item.link}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.sorting ?? 0}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 新增/編輯對話框 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">{editTarget ? '編輯幻燈片' : '新增幻燈片'}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* 桌面版圖片 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  圖片網址 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={form.pic}
                  onChange={(e) => setForm((f) => ({ ...f, pic: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="桌面版圖片網址"
                  autoFocus
                />
                {form.pic && (
                  <img
                    src={form.pic}
                    alt="預覽"
                    className="mt-2 w-full h-32 rounded object-cover border"
                  />
                )}
              </div>
              {/* 手機版圖片 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">手機版圖片網址</label>
                <input
                  type="text"
                  value={form.pic_mobile}
                  onChange={(e) => setForm((f) => ({ ...f, pic_mobile: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="手機版圖片網址（可選）"
                />
              </div>
              {/* 標題 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">標題</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="幻燈片標題"
                />
              </div>
              {/* 副標題 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">副標題</label>
                <input
                  type="text"
                  value={form.subtitle}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="幻燈片副標題"
                />
              </div>
              {/* 連結 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">連結</label>
                <input
                  type="text"
                  value={form.link}
                  onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="點擊跳轉連結"
                />
              </div>
              {/* 按鈕文字 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">按鈕文字</label>
                <input
                  type="text"
                  value={form.button_text}
                  onChange={(e) => setForm((f) => ({ ...f, button_text: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="如：了解更多"
                />
              </div>
              {/* 分組 + 排序 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">分組</label>
                  <input
                    type="text"
                    value={form.gid}
                    onChange={(e) => setForm((f) => ({ ...f, gid: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="分組 ID"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">排序</label>
                  <input
                    type="number"
                    value={form.sorting}
                    onChange={(e) => setForm((f) => ({ ...f, sorting: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  />
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
