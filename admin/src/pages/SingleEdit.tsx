import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { cn, type Category } from '../lib/utils'
import { LoadingState } from '../components/StateDisplay'
import ImageCompressDialog from '../components/ImageCompressDialog'
import MediaPickerModal from '../components/MediaPickerModal'
import { useImageUpload } from '../hooks/useImageUpload'
import { registerFaqPlugin, matchFaqElement, faqPluginCSS } from '../lib/quill/faqPlugin'
import { registerVideoPlugin, matchVideoIframe } from '../lib/quill/videoPlugin'
import { registerListPlugin, listPluginCSS } from '../lib/quill/listPlugin'
import { cleanupQuillHtml, toolbarButtonCSS } from '../lib/quill/htmlCleanup'

/** Quill 全局聲明 */
declare global {
  interface Window {
    Quill?: {
      new (container: HTMLElement | string, options?: Record<string, unknown>): QuillInstance
      import: (path: string) => unknown
      register: (blot: unknown, register?: boolean) => void
    }
  }
}

const QUILL_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/quill/2.0.2/quill.min.js'
const QUILL_CSS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/quill/2.0.2/quill.snow.min.css'

interface QuillInstance {
  root: HTMLElement
  getText: () => string
  getContents: () => unknown
  setContents: (delta: unknown) => void
  getSelection: (focus?: boolean) => { index: number; length: number } | null
  getLength: () => number
  getIndex: (blot: unknown) => number
  insertEmbed: (index: number, type: string, value: string | Record<string, string>) => void
  on: (event: string, callback: () => void) => void
  clipboard: {
    dangerouslyPasteHTML: (html: string | number, index?: number, source?: string) => void
    addMatcher: (selector: number | string, callback: (node: Node, delta: unknown, source: string) => unknown) => void
  }
}

let quillLoaded = false
let quillLoading: Promise<void> | null = null

function loadQuill(): Promise<void> {
  if (window.Quill) { quillLoaded = true; return Promise.resolve() }
  if (quillLoading) return quillLoading

  quillLoading = new Promise<void>((resolve, reject) => {
    if (!document.querySelector(`link[href="${QUILL_CSS_URL}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = QUILL_CSS_URL
      document.head.appendChild(link)
    }

    let script = document.getElementById('quill-script') as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = 'quill-script'
      script.src = QUILL_JS_URL
      script.async = true
      document.head.appendChild(script)
    }

    script.addEventListener('load', () => { quillLoaded = true; quillLoading = null; resolve() })
    script.addEventListener('error', () => { quillLoading = null; reject(new Error('Quill 腳本載入失敗')) })

    let attempts = 0
    const poll = setInterval(() => {
      attempts++
      if (window.Quill) {
        clearInterval(poll)
        quillLoaded = true
        quillLoading = null
        resolve()
      } else if (attempts >= 50) {
        clearInterval(poll)
        quillLoading = null
        reject(new Error('Quill 載入超時'))
      }
    }, 100)
  })

  return quillLoading
}

/** 套餐價目項目 */
interface PackageItem {
  id: string
  name: string
  price: string
}

/** 單頁數據結構 */
interface Single {
  id: number
  title: string
  scode: string
  content: string
  keywords: string
  description: string
  status: '1' | '0'
  sorting: number
  filename?: string
  banner_pc?: string
  banner_mb?: string
  whatsapp_phone?: string
  whatsapp_text?: string
  packages?: string
  terms?: string
}

/** 表單數據結構 */
interface FormData {
  title: string
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
  whatsapp_phone: string
  whatsapp_text: string
  whatsapp_btn: string
  packages: PackageItem[]
  terms: string
}

const EMPTY_FORM: FormData = {
  title: '',
  scode: '0',
  filename: '',
  content: '',
  keywords: '',
  description: '',
  status: '1',
  sorting: 1,
  banner_pc: '',
  banner_mb: '',
  banner_alt: '',
  whatsapp_phone: '',
  whatsapp_text: '',
  whatsapp_btn: '立即預約查詢',
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

  // 媒體庫選擇器開關
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'quill' | 'banner_pc' | 'banner_mb' | null>(null)

  // Quill 相關引用
  const editorRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<QuillInstance | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [htmlMode, setHtmlMode] = useState(false)
  const [htmlSource, setHtmlSource] = useState('')

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

  /** 載入欄目樹（使用白名單端點 /all） */
  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get<Category[]>('/admin/sorts/all')
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
        if (data.packages) {
          try {
            const raw = JSON.parse(data.packages)
            if (Array.isArray(raw)) {
              parsedPackages = raw.map((p, idx) => ({
                id: `pkg_${idx}_${Date.now()}`,
                name: String(p.name ?? ''),
                price: String(p.price ?? ''),
              }))
            }
          } catch {
            /* 忽略 JSON 解析異常 */
          }
        }

        setForm({
          title: data.title ?? '',
          scode: data.scode ?? '0',
          filename: data.filename ?? '',
          content: data.content ?? '',
          keywords: data.keywords ?? '',
          description: data.description ?? '',
          status: data.status === '1' ? '1' : '0',
          sorting: data.sorting ?? 1,
          banner_pc: data.banner_pc ?? '',
          banner_mb: data.banner_mb ?? '',
          banner_alt: data.title ?? '',
          whatsapp_phone: data.whatsapp_phone ?? '',
          whatsapp_text: data.whatsapp_text ?? '',
          whatsapp_btn: '立即預約查詢',
          packages: parsedPackages,
          terms: data.terms ?? '',
        })

        // 若 Quill 已初始化，填充內容
        if (quillRef.current && data.content) {
          quillRef.current.clipboard.dangerouslyPasteHTML(data.content)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入單頁失敗')
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

  /** 初始化 Quill 編輯器 */
  useEffect(() => {
    if (loading) return
    let cancelled = false

    const initEditor = async () => {
      try {
        await loadQuill()
        if (cancelled || !window.Quill || !editorRef.current) return

        if (quillRef.current) {
          editorRef.current.innerHTML = ''
        }

        const editorContainer = document.createElement('div')
        editorRef.current.appendChild(editorContainer)

        const quill = new window.Quill(editorContainer, {
          theme: 'snow',
          readOnly: false,
          placeholder: '請在此輸入專題介紹或正文內容...',
          modules: {
            toolbar: {
              container: [
                [{ header: [1, 2, 3, 4, 5, 6, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ color: [] }, { background: [] }],
                [{ align: [] }],
                ['blockquote', 'code-block'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['link', 'image', 'video-picker', 'faq-picker'],
                ['clean'],
                ['html-source'],
              ],
              handlers: {
                image: function () {
                  setMediaPickerTarget('quill')
                },
                'html-source': function () {
                  if (!htmlMode && quillRef.current) {
                    setHtmlSource(quillRef.current.root.innerHTML)
                  }
                  setHtmlMode(!htmlMode)
                },
              },
            },
            clipboard: { matchVisual: false },
          },
        })

        quillRef.current = quill

        registerFaqPlugin()
        registerVideoPlugin()
        registerListPlugin()

        quill.clipboard.addMatcher(Node.ELEMENT_NODE, (node: Node, delta: unknown) => {
          const el = node as HTMLElement
          const faqOps = matchFaqElement(el)
          if (faqOps) {
            const Delta = window.Quill!.import('delta') as unknown as { new (ops?: unknown[]): unknown }
            return new Delta(faqOps)
          }
          const videoOps = matchVideoIframe(el)
          if (videoOps) {
            const Delta = window.Quill!.import('delta') as unknown as { new (ops?: unknown[]): unknown }
            return new Delta(videoOps)
          }
          return delta
        })

        const styleEl = document.createElement('style')
        styleEl.textContent = listPluginCSS + faqPluginCSS + toolbarButtonCSS
        editorContainer.appendChild(styleEl)

        if (form.content) {
          quill.clipboard.dangerouslyPasteHTML(form.content)
        }

        quill.on('text-change', () => {
          if (quillRef.current) {
            setForm((prev) => ({ ...prev, content: quillRef.current!.root.innerHTML }))
          }
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : '編輯器初始化失敗')
      }
    }

    const timer = setTimeout(initEditor, 100)
    return () => {
      cancelled = true
      clearTimeout(timer)
      if (editorRef.current) editorRef.current.innerHTML = ''
      quillRef.current = null
    }
  }, [loading])

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

  /** 將結構化字段組裝為現代化 HTML */
  const compileFullHtml = (rawIntro: string): string => {
    const hasLandingElements =
      form.banner_pc || form.banner_mb || form.packages.length > 0 || form.whatsapp_phone || form.terms.trim()

    // 如果沒有使用任何落地頁組件，直接返回純富文本
    if (!hasLandingElements) {
      return cleanupQuillHtml(rawIntro)
    }

    const bannerHtml = (form.banner_pc || form.banner_mb)
      ? `<section class="mb-10 lg:mb-20"><div class="banner-wrapper lg:wrapper"><picture>${
          form.banner_pc ? `<source media="(min-width: 1024px)" srcset="${form.banner_pc}">` : ''
        }<img src="${form.banner_mb || form.banner_pc}" alt="${form.title}" title="Banner" class="banner w-full aspect-[40/27] lg:aspect-auto max-h-[480px] md:max-h-72 xl:max-h-[480px] object-cover lg:rounded-4xl"></picture></div></section>`
      : ''

    const packagesHtml = form.packages.length > 0
      ? `<div class="flex w-full justify-center mb-2 lg:mb-5"><h2 class="w-fit relative font-bold text-2xl lg:text-4xl pb-4 text-primary text-center">${form.title}</h2></div><div class="text-center text-lg lg:text-3xl rounded-t-3xl max-w-6xl mx-auto mb-5 lg:mb-10"><div class="bg-gradient-to-b from-primary from-30% via-primary to-primary/0 rounded-2xl lg:rounded-4xl overflow-hidden"><div class="flex text-white pt-3 pb-2 lg:pt-7 lg:pb-4"><div class="mx-6 w-25 md:w-[236px] lg:w-[calc(35%-64px)]">項目</div><div class="flex-1">二人同行</div></div><ol class="shadow-md bg-white py-5 lg:py-10 rounded-2xl lg:rounded-4xl relative before:content-[''] before:h-full before:w-[136px] md:before:w-[268px] lg:before:w-[35%] before:bg-bg-soft before:rounded-2xl lg:before:rounded-4xl before:absolute before:left-0 before:top-0 before:shadow-md">${
          form.packages.map((pkg) => `<li class="flex items-stretch relative z-10 text-lg sm:text-xl lg:text-3xl font-bold tracking-wider"><h3 class="border-b border-[#A4A4A4] w-[104px] md:w-[236px] lg:w-[calc(35%-64px)] text-desc mx-4 lg:mx-8 py-4 flex justify-center items-center">${pkg.name}</h3><div class="border-b border-[#A4A4A4] flex-1 flex mx-4 lg:mx-8 flex items-center justify-center py-4"><div class="text-center text-desc w-full">${pkg.price}</div></div></li>`).join('')
        }</ol></div></div>`
      : ''

    const whatsappHtml = form.whatsapp_phone.trim()
      ? `<div class="text-center mb-5 lg:mb-10"><a href="https://api.whatsapp.com/send/?phone=${form.whatsapp_phone.trim()}&text=${encodeURIComponent(form.whatsapp_text.trim() || `你好，我想查詢【${form.title}】`)}" class="text-white w-fit mx-auto rounded-xl lg:rounded-2xl py-1 px-6 lg:py-2 lg:px-11 gap-2 lg:gap-3 flex items-center justify-center" style="background-color:#1b407a;"><span class="iconify i-ic:baseline-whatsapp size-5 lg:size-7" aria-hidden="true"></span><span class="text-base lg:text-xl font-medium">${form.whatsapp_btn.trim() || '立即預約查詢'}</span></a></div>`
      : ''

    const termsHtml = form.terms.trim()
      ? `<div class="flex w-full justify-start mb-2 lg:mb-5"><h3 class="w-fit relative font-bold text-2xl lg:text-4xl pb-4 text-primary">條款及細則：</h3></div><ul class="text-intro list-decimal list-inside text-normal">${
          form.terms.split('\n').map((line) => line.trim()).filter(Boolean).map((t) => `<li>${t.replace(/^\d+[\.、\s]*/, '')}</li>`).join('')
        }</ul>`
      : ''

    const cleanedIntro = cleanupQuillHtml(rawIntro)

    return `${bannerHtml}<section class="wrapper mb-15 lg:mb-25"><div class="flex w-full justify-center mb-2 lg:mb-5"><h2 class="w-fit relative font-bold text-2xl lg:text-4xl pb-8 text-primary before:content-[''] before:absolute before:bg-accent before:h-1 before:w-20 before:bottom-4 before:left-1/2 before:-translate-x-1/2">${form.title}</h2></div><div class="text-intro text-justify space-y-1 lg:space-y-2 mb-10 lg:mb-15">${cleanedIntro}</div>${packagesHtml}${whatsappHtml}${termsHtml}</section>`
  }

  /** 提交表單 */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('請輸入單頁標題')
      return
    }

    let editorHtml = form.content
    if (htmlMode && htmlSource) {
      editorHtml = htmlSource
    } else if (quillRef.current) {
      editorHtml = quillRef.current.root.innerHTML
    }

    const finalContent = compileFullHtml(editorHtml)

    setSaving(true)
    setError('')
    try {
      const payload = {
        title: form.title.trim(),
        scode: form.scode || '0',
        filename: form.filename.trim(),
        content: finalContent,
        keywords: form.keywords.trim(),
        description: form.description.trim(),
        status: form.status,
        sorting: Number(form.sorting) || 1,
        banner_pc: form.banner_pc.trim(),
        banner_mb: form.banner_mb.trim(),
        whatsapp_phone: form.whatsapp_phone.trim(),
        whatsapp_text: form.whatsapp_text.trim(),
        packages: JSON.stringify(form.packages),
        terms: form.terms.trim(),
      }

      if (isEdit) {
        await api.put(`/admin/singles/${id}`, payload)
      } else {
        await api.post('/admin/singles', payload)
      }
      navigate('/singles')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失敗')
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
              專題標題 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:bg-white"
              placeholder="例如：二人同行腸胃鏡檢查計劃｜胃鏡及大腸鏡檢查"
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
                <span className="text-xs font-normal text-muted-foreground ml-2">數字越小越靠前</span>
              </label>
              <input
                type="number"
                value={form.sorting}
                onChange={(e) => updateField('sorting', Number(e.target.value))}
                className="w-full px-4 py-2.5 text-sm bg-gray-50/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:bg-white"
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
          </div>

          {/* 2. 引言與介紹 (Quill 2.0) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">
                專題介紹 / 促銷引言正文
                <span className="text-xs font-normal text-muted-foreground ml-2">支援富文本、段落排版、多圖與視頻</span>
              </label>
            </div>
            {/* HTML 源碼模式切換 */}
            {htmlMode ? (
              <textarea
                value={htmlSource}
                onChange={(e) => setHtmlSource(e.target.value)}
                rows={12}
                className="w-full px-4 py-3 font-mono text-sm bg-slate-900 text-slate-100 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="在此直接編寫/修改 HTML 源碼..."
              />
            ) : (
              <div ref={editorRef} className="rounded-xl overflow-hidden border border-input shadow-sm min-h-[220px]" />
            )}
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
            <div className="flex items-center justify-between border-b border-indigo-100/80 pb-2.5">
              <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <span>💬</span>
                <span>WhatsApp 預約轉化按鈕配置</span>
              </h3>
              <span className="text-xs text-indigo-600">留空號碼則不渲染預約按鈕</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp 號碼</label>
                <input
                  type="text"
                  value={form.whatsapp_phone}
                  onChange={(e) => updateField('whatsapp_phone', e.target.value)}
                  placeholder="如: 85267462547"
                  className="w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                {form.title || '頁面標題預覽'}
              </div>
              <div className="text-xs text-gray-600 line-clamp-2">
                {form.description || '請輸入頁面描述，這段內容將顯示在 Google 搜尋結果摘要中，幫助吸引用戶點擊...'}
              </div>
            </div>
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
          } else if (mediaPickerTarget === 'quill' && quillRef.current) {
            const range = quillRef.current.getSelection()
            const insertIndex = range ? range.index : (quillRef.current.getLength() || 0) - 1
            quillRef.current.insertEmbed(insertIndex, 'image', url)
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
