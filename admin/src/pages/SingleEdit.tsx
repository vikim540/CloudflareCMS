import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { cn, type Category } from '../lib/utils'
import { LoadingState, ErrorState } from '../components/StateDisplay'
import { showGlobalError } from '../components/GlobalErrorToast'
import ImageCompressDialog from '../components/ImageCompressDialog'
import MediaPickerModal from '../components/MediaPickerModal'
import { useImageUpload } from '../hooks/useImageUpload'
import { RichTextEditor, type RichTextEditorRef } from '../components/RichTextEditor'

/** 套餐價目項目 */
interface PackageItem {
  id: string
  name: string
  price: string
}

/** 安全去除首尾空白（容錯 Array、Number、Null 等非 String 類型，徹底杜絕 .trim is not a function） */
function safeTrim(val: unknown): string {
  if (typeof val === 'string') return val.trim()
  if (Array.isArray(val)) {
    return val.map((item) => String(item ?? '').trim()).filter(Boolean).join('\n')
  }
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

/** 單頁數據結構 */
interface Single {
  id: number
  title: string
  seo_title?: string
  scode: string
  content: string
  keywords: string
  description: string
  status: '1' | '0'
  sorting: number
  filename?: string
  banner_pc?: string
  banner_mb?: string
  banner_alt?: string
  banner_title?: string
  whatsapp_phone?: string
  whatsapp_text?: string
  whatsapp_btn?: string
  packages?: string
  terms?: string
}

/** 從可能已編譯的 HTML 中提取純正文介紹，防止遞歸嵌套落地頁模組 */
function extractCleanIntro(html: string): string {
  if (!html) return ''
  // 1. 若匹配到 compileFullHtml 生成的 text-intro 容器，提取其內部 HTML
  const introMatch = html.match(/<div class="text-intro[^"]*">([\s\S]*?)<\/div>/i)
  if (introMatch && introMatch[1]) {
    let inner = introMatch[1].trim()
    const nested = inner.match(/<div class="text-intro[^"]*">([\s\S]*?)<\/div>/i)
    if (nested && nested[1]) inner = nested[1].trim()
    return inner.replace(/<section class="mb-10 lg:mb-20">[\s\S]*?<\/section>/gi, '').trim()
  }
  return html
}

/** 表單數據結構 */
interface FormData {
  title: string
  seo_title: string
  scode: string
  filename: string
  content: string
  keywords: string
  description: string
  status: '1' | '0'
  sorting: number
  // 落地頁結構化字段
  banner_pc: string
  banner_mb: string
  banner_alt: string
  banner_title: string
  whatsapp_phone: string
  whatsapp_text: string
  whatsapp_btn: string
  package_title: string
  package_col1: string
  package_col2: string
  packages: PackageItem[]
  terms: string
}

const EMPTY_FORM: FormData = {
  title: '',
  seo_title: '',
  scode: '0',
  filename: '',
  content: '',
  keywords: '',
  description: '',
  status: '1',
  sorting: 255,
  banner_pc: '',
  banner_mb: '',
  banner_alt: '',
  banner_title: '',
  whatsapp_phone: '',
  whatsapp_text: '',
  whatsapp_btn: '立即預約查詢',
  package_title: '',
  package_col1: '項目',
  package_col2: '二人同行',
  packages: [],
  terms: '',
}

/** 樹狀遞歸渲染欄目選項 */
function renderCategoryOptions(categories: Category[], depth = 0): React.ReactNode[] {
  const options: React.ReactNode[] = []
  for (const cat of categories) {
    const prefix = depth > 0 ? '  ' + '└─ '.repeat(depth) : '📁 '
    const folderInfo = cat.filename ? ` (/${cat.filename})` : ''
    options.push(
      <option key={cat.scode} value={cat.scode}>
        {prefix}{cat.name}{folderInfo}
      </option>
    )
    if (cat.children && cat.children.length > 0) {
      options.push(...renderCategoryOptions(cat.children, depth + 1))
    }
  }
  return options
}

/** 遞歸扁平化獲取欄目字典 */
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

export default function SingleEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'basic' | 'visual' | 'seo'>('basic')
  const [copied, setCopied] = useState(false)

  // WhatsApp 轉化按鈕開關（預設關閉，摺疊不渲染數據）
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)

  // 媒體庫選擇器開關
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'quill' | 'banner_pc' | 'banner_mb' | null>(null)

  // 富文本公共組件引用
  const richEditorRef = useRef<RichTextEditorRef>(null)

  // 圖片壓縮上傳 Hook
  const { uploadSingle, clearError: clearImgError } = useImageUpload({ autoCompress: false })
  const [pendingImageUpload, setPendingImageUpload] = useState<{
    files: File[]
    callback: (urls: (string | null)[]) => void
  } | null>(null)

  const categoryDict = useMemo(() => buildCategoryDict(categories), [categories])

  /** 上傳圖片包裝器（支持壓縮） */
  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    clearImgError()
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return await uploadSingle(file)
    }
    return new Promise<string | null>((resolve) => {
      setPendingImageUpload({
        files: [file],
        callback: (urls) => resolve(urls[0] ?? null),
      })
    })
  }, [uploadSingle, clearImgError])

  /** 載入專題欄目樹（僅過濾單頁/專題模型 mcode=1） */
  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get<Category[]>('/admin/sorts/all?mcode=1')
      setCategories(res.data ?? [])
    } catch {
      /* 忽略欄目載入錯誤 */
    }
  }, [])

  /** 載入單頁詳情 */
  const fetchSingle = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Single>(`/admin/singles/${id}`)
      const data = res.data
      if (data) {
        let parsedPackages: PackageItem[] = []
        let parsedTitle = ''
        let parsedCol1 = '項目'
        let parsedCol2 = '二人同行'

        if (data.packages) {
          try {
            const raw = JSON.parse(data.packages)
            if (Array.isArray(raw)) {
              parsedPackages = raw.map((p, idx) => ({
                id: (p && p.id) ? String(p.id) : `pkg_${idx}_${Date.now()}`,
                name: String(p.name ?? ''),
                price: String(p.price ?? ''),
              }))
            } else if (raw && typeof raw === 'object') {
              parsedTitle = String(raw.title ?? '')
              parsedCol1 = String(raw.col1 || '項目')
              parsedCol2 = String(raw.col2 || '二人同行')
              if (Array.isArray(raw.items)) {
                parsedPackages = raw.items.map((p, idx) => ({
                  id: (p && p.id) ? String(p.id) : `pkg_${idx}_${Date.now()}`,
                  name: String(p.name ?? ''),
                  price: String(p.price ?? ''),
                }))
              }
            }
          } catch {
            /* 忽略 JSON 解析異常 */
          }
        }

        // 容錯 terms：支援 string、string[]、terms_info.items 或 null
        let parsedTerms = ''
        if (typeof data.terms === 'string') {
          parsedTerms = data.terms
        } else if (Array.isArray(data.terms)) {
          parsedTerms = (data.terms as unknown[]).map((t) => String(t ?? '').trim()).filter(Boolean).join('\n')
        } else if (data.terms_info && typeof data.terms_info === 'object' && Array.isArray((data.terms_info as { items?: unknown[] }).items)) {
          parsedTerms = ((data.terms_info as { items: unknown[] }).items).map((t) => String(t ?? '').trim()).filter(Boolean).join('\n')
        }

        setForm({
          title: safeTrim(data.title),
          seo_title: safeTrim(data.seo_title),
          scode: data.scode ?? '0',
          filename: safeTrim(data.filename),
          content: cleanIntro,
          keywords: safeTrim(data.keywords),
          description: safeTrim(data.description),
          status: data.status === '1' ? '1' : '0',
          sorting: data.sorting ?? 255,
          banner_pc: safeTrim(data.banner_pc),
          banner_mb: safeTrim(data.banner_mb),
          banner_alt: safeTrim(data.banner_alt),
          banner_title: safeTrim(data.banner_title),
          whatsapp_phone: safeTrim(data.whatsapp_phone),
          whatsapp_text: safeTrim(data.whatsapp_text),
          whatsapp_btn: safeTrim(data.whatsapp_btn) || '立即預約查詢',
          package_title: parsedTitle || safeTrim(data.title),
          package_col1: parsedCol1,
          package_col2: parsedCol2,
          packages: parsedPackages,
          terms: parsedTerms,
        })

        // 若原數據有 WhatsApp 號碼則自動開啟 Switch，否則預設保持關閉摺疊
        const phoneStr = safeTrim(data.whatsapp_phone)
        setWhatsappEnabled(Boolean(phoneStr))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '載入單頁失敗'
      setError(msg)
      showGlobalError('單頁載入失敗', msg, err instanceof Error ? err.stack : undefined)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    if (isEdit) {
      fetchSingle()
    }
  }, [isEdit, fetchSingle])

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // 套餐項目操作
  const addPackageItem = () => {
    const newItem: PackageItem = {
      id: `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: '',
      price: '',
    }
    setForm((prev) => ({ ...prev, packages: [...prev.packages, newItem] }))
  }

  const updatePackageItem = (id: string, field: 'name' | 'price', value: string) => {
    setForm((prev) => ({
      ...prev,
      packages: prev.packages.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }))
  }

  const removePackageItem = (id: string) => {
    setForm((prev) => ({
      ...prev,
      packages: prev.packages.filter((item) => item.id !== id),
    }))
  }

  /** 計算訪問路徑與 API 端點 */
  const pathInfo = useMemo(() => {
    const isRoot = !form.scode || form.scode === '0'
    const category = categoryDict[form.scode]
    const catFolder = isRoot ? '' : (category?.filename || `cat-${form.scode}`)
    const slug = form.filename.trim() || (id ? String(id) : 'new')

    const pagePath = isRoot ? `/${slug}` : `/${catFolder}/${slug}`
    const apiEndpoint = `/api/v1/singles/${slug}`
    const fullApiUrl = `${window.location.origin}${apiEndpoint}`

    return {
      isRoot,
      catName: isRoot ? '根目錄 (/)' : (category?.name || `欄目 ${form.scode}`),
      catFolder,
      slug,
      pagePath,
      apiEndpoint,
      fullApiUrl,
    }
  }, [form.scode, form.filename, id, categoryDict])

  /** 複製 API 地址 */
  const handleCopyApiUrl = () => {
    navigator.clipboard.writeText(pathInfo.fullApiUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  /** 提交表單 */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanTitle = safeTrim(form.title)
    if (!cleanTitle) {
      setError('請輸入單頁標題')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        title: cleanTitle,
        seo_title: safeTrim(form.seo_title),
        scode: form.scode || '0',
        filename: safeTrim(form.filename),
        content: safeTrim(form.content),
        keywords: safeTrim(form.keywords),
        description: safeTrim(form.description),
        status: form.status,
        sorting: Number(form.sorting) || 255,
        banner_pc: safeTrim(form.banner_pc),
        banner_mb: safeTrim(form.banner_mb),
        banner_alt: safeTrim(form.banner_alt),
        banner_title: safeTrim(form.banner_title),
        whatsapp_phone: whatsappEnabled ? safeTrim(form.whatsapp_phone) : '',
        whatsapp_text: whatsappEnabled ? safeTrim(form.whatsapp_text) : '',
        whatsapp_btn: whatsappEnabled ? (safeTrim(form.whatsapp_btn) || '立即預約查詢') : '',
        packages: JSON.stringify({
          title: safeTrim(form.package_title),
          col1: safeTrim(form.package_col1) || '項目',
          col2: safeTrim(form.package_col2) || '二人同行',
          items: Array.isArray(form.packages)
            ? form.packages
                .map((p) => ({
                  id: p.id,
                  name: safeTrim(p.name),
                  price: safeTrim(p.price),
                }))
                .filter((p) => p.name || p.price)
            : [],
        }),
        terms: safeTrim(form.terms),
      }

      if (isEdit) {
        await api.put(`/admin/singles/${id}`, payload)
      } else {
        await api.post('/admin/singles', payload)
      }
      navigate('/singles')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失敗'
      setError(msg)
      showGlobalError('專題落地頁保存失敗', msg, err instanceof Error ? err.stack : undefined)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <LoadingState text="載入中..." />
      </div>
    )
  }

  if (error && !form.title && isEdit) {
    return (
      <div className="p-6 max-w-5xl">
        <ErrorState message={error} onRetry={fetchSingle} />
      </div>
    )
  }

  // 檢查當前 scode 是否在欄目樹中（若為歷史編碼如 101，單獨在下拉頂部顯示兼容選項）
  const isLegacyScode = form.scode && form.scode !== '0' && !categoryDict[form.scode]

  return (
    <div className="p-6 max-w-5xl">
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/singles')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>⬅️</span>
            <span>返回列表</span>
          </button>
          <h1 className="text-2xl font-bold">{isEdit ? '編輯專題落地頁' : '新增專題落地頁'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyApiUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg bg-white hover:bg-accent transition-colors shadow-sm"
            title="複製前端 API 接口地址"
          >
            <span>{copied ? '✅' : '🔗'}</span>
            <span>{copied ? '已複製 API 地址' : '複製 API 地址'}</span>
          </button>
          <a
            href={pathInfo.fullApiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-lg bg-white hover:bg-accent text-blue-600 transition-colors shadow-sm"
          >
            <span>↗️</span>
            <span>測試端點</span>
          </a>
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* 表單容器 */}
      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
        {/* Tab 切換欄 */}
        <div className="flex gap-2 border-b border-gray-200 pb-px">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={cn(
              'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all duration-200',
              activeTab === 'basic'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
            )}
          >
            📝 基本與目錄
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('visual')}
            className={cn(
              'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all duration-200',
              activeTab === 'visual'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
            )}
          >
            🎨 落地頁視覺與內容
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('seo')}
            className={cn(
              'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all duration-200',
              activeTab === 'seo'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
            )}
          >
            🔍 SEO 設置 (TDK)
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* Tab 1: 📝 基本與目錄 */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: activeTab === 'basic' ? 'block' : 'none' }} className="space-y-5">
          {/* 標題 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              專題管理名稱（內部標題） <span className="text-destructive">*</span>
              <span className="text-xs font-normal text-muted-foreground ml-2">用於後台列表管理與辨識，建議簡潔好記</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:bg-white"
              placeholder="例如：二人同行"
              required
            />
          </div>

          {/* 目錄歸屬 + 頁面別名 Slug */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                所屬目錄 / 欄目 <span className="text-destructive">*</span>
                <span className="text-xs font-normal text-muted-foreground ml-2">支援根目錄或歸屬指定專題欄目</span>
              </label>
              <select
                value={form.scode}
                onChange={(e) => updateField('scode', e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 cursor-pointer"
              >
                <option value="0">🌐 根目錄 / (直接作為頂級頁面)</option>
                {isLegacyScode && (
                  <option value={form.scode}>⚠️ 原有編碼: {form.scode} (歷史未關聯欄目)</option>
                )}
                {renderCategoryOptions(categories)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                頁面路徑別名 (Slug)
                <span className="text-xs font-normal text-muted-foreground ml-2">留空自動採用自增 ID</span>
              </label>
              <div className="flex items-center">
                <span className="px-3 py-2.5 bg-gray-100 border border-r-0 rounded-l-lg text-xs text-muted-foreground select-none">
                  {pathInfo.isRoot ? '/' : `/${pathInfo.catFolder}/`}
                </span>
                <input
                  type="text"
                  value={form.filename}
                  onChange={(e) => updateField('filename', e.target.value)}
                  className="flex-1 px-4 py-2.5 text-sm bg-gray-50/50 border rounded-r-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:bg-white font-mono"
                  placeholder="如: twoperson_discount"
                />
              </div>
            </div>
          </div>

          {/* 前端接收地址預覽卡片 */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>🌐</span>
                <span>前端整合與預計訪問路徑</span>
              </span>
              <button
                type="button"
                onClick={handleCopyApiUrl}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {copied ? '已複製！' : '複製 API 連結'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-lg border">
                <span className="text-muted-foreground block mb-0.5">預期前台頁面訪問路徑：</span>
                <code className="text-blue-700 font-mono font-semibold">{pathInfo.pagePath}</code>
              </div>
              <div className="bg-white p-2.5 rounded-lg border">
                <span className="text-muted-foreground block mb-0.5">公開 JSON API 端點：</span>
                <code className="text-emerald-700 font-mono font-semibold">{pathInfo.apiEndpoint}</code>
              </div>
            </div>
          </div>

          {/* 狀態與排序 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">狀態</label>
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value as '1' | '0')}
                className="w-full px-4 py-2.5 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="1">🟢 已發布</option>
                <option value="0">⚪ 草稿（不發佈）</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                排序權重
                <span className="text-xs font-normal text-muted-foreground ml-2">預設 255（若同目錄下有多個專題需排序時手動調整）</span>
              </label>
              <input
                type="number"
                value={form.sorting}
                onChange={(e) => updateField('sorting', Number(e.target.value))}
                className="w-full px-4 py-2.5 text-sm bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:bg-white"
                placeholder="255"
              />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* Tab 2: 🎨 落地頁視覺與內容 */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: activeTab === 'visual' ? 'block' : 'none' }} className="space-y-6">
          {/* 1. 雙端 Banner 首圖 */}
          <div className="border border-blue-100 bg-blue-50/20 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-blue-100/80 pb-2.5">
              <h3 className="text-sm font-bold text-blue-950 flex items-center gap-2">
                <span>🖼️</span>
                <span>雙端響應式首圖 Banner (自動轉 WebP &lt;picture&gt;)</span>
              </h3>
              <span className="text-xs text-blue-600 font-normal">留空則不展示首圖</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* PC 端 Banner */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  電腦端寬屏 Banner (PC, 建議寬度 1920px)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.banner_pc}
                    onChange={(e) => updateField('banner_pc', e.target.value)}
                    placeholder="https://.../banner-pc.webp"
                    className="flex-1 px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                  <button
                    type="button"
                    onClick={() => setMediaPickerTarget('banner_pc')}
                    className="px-3 py-2 text-xs bg-white border rounded-lg hover:bg-accent font-medium transition-colors"
                  >
                    媒體庫
                  </button>
                </div>
                {form.banner_pc && (
                  <div className="relative aspect-[40/15] max-h-32 rounded-lg border overflow-hidden bg-slate-100">
                    <img src={form.banner_pc} alt="PC Banner 預覽" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* 手機端 Banner */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  手機端豎屏 Banner (Mobile, 建議寬度 750px)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.banner_mb}
                    onChange={(e) => updateField('banner_mb', e.target.value)}
                    placeholder="https://.../banner-mb.webp"
                    className="flex-1 px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                  <button
                    type="button"
                    onClick={() => setMediaPickerTarget('banner_mb')}
                    className="px-3 py-2 text-xs bg-white border rounded-lg hover:bg-accent font-medium transition-colors"
                  >
                    媒體庫
                  </button>
                </div>
                {form.banner_mb && (
                  <div className="relative aspect-[40/27] max-h-32 rounded-lg border overflow-hidden bg-slate-100">
                    <img src={form.banner_mb} alt="Mobile Banner 預覽" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            {/* Banner SEO 屬性：alt 與 title */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-blue-100/80">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Banner 圖片 Alt（替代文字）
                  <span className="text-xs font-normal text-muted-foreground ml-1.5">SEO 與螢幕閱讀器友好</span>
                </label>
                <input
                  type="text"
                  value={form.banner_alt}
                  onChange={(e) => updateField('banner_alt', e.target.value)}
                  placeholder={`留空預設：${form.seo_title || form.title || '頁面標題'}`}
                  className="w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Banner 圖片 Title（懸停提示文字）
                  <span className="text-xs font-normal text-muted-foreground ml-1.5">滑鼠停留展示文字</span>
                </label>
                <input
                  type="text"
                  value={form.banner_title}
                  onChange={(e) => updateField('banner_title', e.target.value)}
                  placeholder={`留空預設：${form.seo_title || form.title || '頁面標題'}`}
                  className="w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </div>
          </div>

          {/* 2. 引言與介紹 (Quill 2.0 公共組件) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">
                專題介紹 / 促銷引言正文
                <span className="text-xs font-normal text-muted-foreground ml-2">支援富文本、段落排版、多圖與視頻</span>
              </label>
            </div>
            <RichTextEditor
              ref={richEditorRef}
              value={form.content}
              onChange={(html) => updateField('content', html)}
              onOpenMediaPicker={() => setMediaPickerTarget('quill')}
              placeholder="請在此輸入專題介紹或正文內容..."
              minHeightClass="min-h-[220px]"
            />
          </div>

          {/* 3. 套餐價目表 (動態管理) */}
          <div className="border border-emerald-100 bg-emerald-50/20 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-100/80 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                  <span>💰</span>
                  <span>套餐項目價目清單 (自動生成精緻漸變圓角卡片)</span>
                </h3>
                <p className="text-xs text-emerald-700 mt-0.5">點擊添加項目，前台將自動排版，無需手寫任何 Table 代碼</p>
              </div>
              <button
                type="button"
                onClick={addPackageItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-medium transition-colors shadow-sm"
              >
                <span>➕</span>
                <span>添加檢查項目</span>
              </button>
            </div>

            {/* 價目表主標題與兩欄欄位自定義標題 */}
            <div className="bg-white/80 p-3.5 rounded-lg border border-emerald-200/80 space-y-2">
              <span className="text-xs font-bold text-emerald-900 block">
                🏷️ 價目表標題與欄位名稱自定義
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    價目表主標題
                  </label>
                  <input
                    type="text"
                    value={form.package_title}
                    onChange={(e) => updateField('package_title', e.target.value)}
                    placeholder={`留空預設：${form.title || '二人同行'}`}
                    className="w-full px-3 py-1.5 text-xs bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    左欄標題 (預設: 項目)
                  </label>
                  <input
                    type="text"
                    value={form.package_col1}
                    onChange={(e) => updateField('package_col1', e.target.value)}
                    placeholder="項目"
                    className="w-full px-3 py-1.5 text-xs bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    右欄標題 (預設: 二人同行)
                  </label>
                  <input
                    type="text"
                    value={form.package_col2}
                    onChange={(e) => updateField('package_col2', e.target.value)}
                    placeholder="二人同行 (或: 優惠價 / 三人同行)"
                    className="w-full px-3 py-1.5 text-xs bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
            </div>

            {form.packages.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground bg-white/60 rounded-lg border border-dashed border-emerald-200">
                尚未添加價目項目。若本專題無價格對比表，可直接留空。
              </div>
            ) : (
              <div className="space-y-2.5">
                {form.packages.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                    <span className="text-xs font-mono text-emerald-600 font-bold w-6 text-center">{idx + 1}.</span>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updatePackageItem(item.id, 'name', e.target.value)}
                      placeholder="項目名稱 (如: 胃鏡檢查)"
                      className="flex-1 px-3 py-1.5 text-xs bg-gray-50 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                    />
                    <input
                      type="text"
                      value={item.price}
                      onChange={(e) => updatePackageItem(item.id, 'price', e.target.value)}
                      placeholder="價格文案 (如: HK$13,200 ($6,600/人))"
                      className="flex-1 px-3 py-1.5 text-xs bg-gray-50 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removePackageItem(item.id)}
                      className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 text-sm"
                      title="刪除此項"
                    >
                      ❌
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. WhatsApp 諮詢轉化按鈕配置 */}
          <div className="border border-indigo-100 bg-indigo-50/20 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">💬</span>
                <div>
                  <h3 className="text-sm font-bold text-indigo-950">
                    WhatsApp 預約轉化按鈕配置
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {whatsappEnabled
                      ? '已開啟：前台將渲染預約諮詢按鈕'
                      : '已關閉：前台不會渲染 WhatsApp 轉化按鈕及代碼'}
                  </p>
                </div>
              </div>

              {/* 控制 Switch */}
              <div className="flex items-center gap-2.5">
                <span className={cn('text-xs font-medium transition-colors', whatsappEnabled ? 'text-indigo-600 font-semibold' : 'text-muted-foreground')}>
                  {whatsappEnabled ? '開啟' : '關閉'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={whatsappEnabled}
                  onClick={() => setWhatsappEnabled(!whatsappEnabled)}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                    whatsappEnabled ? 'bg-indigo-600' : 'bg-gray-300'
                  )}
                  title={whatsappEnabled ? '點擊關閉 WhatsApp 按鈕' : '點擊開啟 WhatsApp 按鈕'}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                      whatsappEnabled ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>
            </div>

            {/* 折疊區域：僅在開啟時展開渲染數據 */}
            {whatsappEnabled && (
              <div className="space-y-4 pt-3 border-t border-indigo-100/80">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      WhatsApp 號碼 <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.whatsapp_phone}
                      onChange={(e) => updateField('whatsapp_phone', e.target.value)}
                      placeholder="如: 85267462547"
                      className="w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">預填諮詢文字 (用戶點擊時自動帶出)</label>
                    <input
                      type="text"
                      value={form.whatsapp_text}
                      onChange={(e) => updateField('whatsapp_text', e.target.value)}
                      placeholder={`如: 你好，我想查詢【${form.title || '二人同行腸胃鏡檢查'}】`}
                      className="w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">按鈕顯示文案</label>
                    <input
                      type="text"
                      value={form.whatsapp_btn}
                      onChange={(e) => updateField('whatsapp_btn', e.target.value)}
                      placeholder="立即預約查詢"
                      className="w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center pt-5">
                    <span className="text-xs text-muted-foreground">
                      💡 提示：用戶點擊按鈕將透過 WhatsApp 直達客服，並自動代入上方預填文字。
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. 條款及細則 (T&C) */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              條款及細則 (Terms & Conditions)
              <span className="text-xs font-normal text-muted-foreground ml-2">每行輸入一條，前台自動渲染序號 1 2 3...</span>
            </label>
            <textarea
              value={form.terms}
              onChange={(e) => updateField('terms', e.target.value)}
              rows={5}
              placeholder={`例如：\n有效期由即日起至2026年9月30日。\n所有檢查須先經醫生進行初步評估。\n本中心保留最終決定權。`}
              className="w-full px-4 py-2.5 text-xs bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:bg-white resize-y font-mono"
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* Tab 3: 🔍 SEO 設置 (TDK) */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: activeTab === 'seo' ? 'block' : 'none' }} className="space-y-6">
          {/* Google SERP 搜尋結果預覽卡片 */}
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm space-y-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <span>🔍</span>
              <span>Google 搜尋引擎展示效果預覽 (SERP Preview)</span>
            </span>
            <div className="space-y-1 max-w-xl">
              <div className="text-xs text-emerald-800 truncate font-mono">
                {pathInfo.fullApiUrl}
              </div>
              <div className="text-lg text-blue-800 font-medium hover:underline cursor-pointer line-clamp-1">
                {form.seo_title || form.title || '頁面標題預覽'}
              </div>
              <div className="text-xs text-gray-600 line-clamp-2">
                {form.description || '請輸入頁面描述，這段內容將顯示在 Google 搜尋結果摘要中，幫助吸引用戶點擊...'}
              </div>
            </div>
          </div>

          {/* SEO 頁面標題 (Title) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">
                SEO 頁面標題 (Title)
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  前台網頁 &lt;title&gt; 與搜尋引擎展示標題，留空自動使用專題管理名稱
                </span>
              </label>
              <span className={cn('text-xs font-mono', form.seo_title.length > 60 ? 'text-amber-600 font-bold' : 'text-muted-foreground')}>
                {form.seo_title.length > 0 ? `當前: ${form.seo_title.length} 字` : '使用管理名稱'}
              </span>
            </div>
            <input
              type="text"
              value={form.seo_title}
              onChange={(e) => updateField('seo_title', e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:bg-white"
              placeholder="例如：二人同行腸胃鏡檢查計劃｜胃鏡及大腸鏡檢查 - 香港內視鏡中心"
            />
          </div>

          {/* SEO 關鍵字 (Keywords) */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              SEO 關鍵字 (Keywords)
              <span className="text-xs font-normal text-muted-foreground ml-2">多個關鍵字以逗號隔開</span>
            </label>
            <input
              type="text"
              value={form.keywords}
              onChange={(e) => updateField('keywords', e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:bg-white"
              placeholder="例如：二人同行腸胃鏡, 胃鏡檢查, 大腸鏡檢查, 香港內視鏡中心"
            />
          </div>

          {/* SEO 描述 (Description) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">
                SEO 頁面描述 (Description)
                <span className="text-xs font-normal text-muted-foreground ml-2">建議 80 - 160 字元</span>
              </label>
              <span className={cn('text-xs font-mono', form.description.length > 160 ? 'text-amber-600 font-bold' : 'text-muted-foreground')}>
                當前: {form.description.length} 字
              </span>
            </div>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={4}
              className="w-full px-4 py-2.5 text-sm bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:bg-white resize-y"
              placeholder="請簡要描述活動專題亮點，向搜尋引擎傳達頁面核心價值..."
            />
          </div>
        </div>

        {/* 表單操作按鈕 */}
        <div className="flex items-center justify-between pt-6 border-t">
          <div className="text-xs text-muted-foreground">
            {isEdit ? `正在編輯專題 ID: ${id}` : '新建專題落地頁'}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/singles')}
              className="px-5 py-2.5 border rounded-lg hover:bg-accent text-sm transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm font-medium transition-opacity disabled:opacity-50 shadow-sm"
            >
              {saving ? <span className="animate-spin inline-block">🔄</span> : <span>💾</span>}
              <span>{saving ? '保存中...' : '保存發布'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* 媒體庫選擇器 Modal */}
      <MediaPickerModal
        open={mediaPickerTarget !== null}
        onClose={() => setMediaPickerTarget(null)}
        onSelect={(url) => {
          if (mediaPickerTarget === 'banner_pc') {
            updateField('banner_pc', url)
          } else if (mediaPickerTarget === 'banner_mb') {
            updateField('banner_mb', url)
          } else if (mediaPickerTarget === 'quill') {
            richEditorRef.current?.insertImage(url)
          }
          setMediaPickerTarget(null)
        }}
        onUpload={async (files) => {
          const urls: (string | null)[] = []
          for (const f of files) {
            urls.push(await uploadImage(f))
          }
          return urls
        }}
      />

      {/* 圖片壓縮對話框 */}
      {pendingImageUpload && (
        <ImageCompressDialog
          open={true}
          file={pendingImageUpload.files[0]}
          onConfirm={async (compressed) => {
            const fileToUpload = compressed || pendingImageUpload.files[0]
            const url = await uploadSingle(fileToUpload)
            pendingImageUpload.callback([url])
            setPendingImageUpload(null)
          }}
          onCancel={() => {
            pendingImageUpload.callback([null])
            setPendingImageUpload(null)
          }}
        />
      )}
    </div>
  )
}
