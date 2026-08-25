import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import ImageCompressDialog from '../components/ImageCompressDialog'
import UploadProgressOverlay from '../components/UploadProgressOverlay'
import ImagePreviewWithRemove from '../components/ImagePreviewWithRemove'
import MediaPickerModal from '../components/MediaPickerModal'
import VideoPickerModal from '../components/VideoPickerModal'
import FaqPickerModal from '../components/FaqPickerModal'
import { TagInput } from '../components/TagInput'
import { LoadingState } from '../components/StateDisplay'
import { useImageUpload } from '../hooks/useImageUpload'
// Quill 編輯器插件模組（admin/src/lib/quill/）
import { registerFaqPlugin, matchFaqElement, faqPluginCSS, extractFaqPairsFromDom } from '../lib/quill/faqPlugin'
import { registerVideoPlugin, matchVideoIframe } from '../lib/quill/videoPlugin'
import { registerListPlugin, listPluginCSS } from '../lib/quill/listPlugin'
import { cleanupQuillHtml, toolbarButtonCSS } from '../lib/quill/htmlCleanup'

/** Quill 全局聲明（cdnjs Cloudflare CDN 託管） */
declare global {
  interface Window {
    Quill?: {
      new (container: HTMLElement | string, options?: Record<string, unknown>): QuillInstance
      import: (path: string) => unknown
      register: (blot: unknown, register?: boolean) => void
    }
  }
}

/** Quill CDN 常量（cdnjs - Cloudflare CDN） */
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
  deleteText: (index: number, length: number, source?: string) => void
  insertEmbed: (index: number, type: string, value: string | Record<string, string>) => void
  on: (event: string, callback: () => void) => void
  clipboard: {
    dangerouslyPasteHTML: (html: string | number, index?: number, source?: string) => void
    addMatcher: (selector: number | string, callback: (node: Node, delta: unknown, source: string) => unknown) => void
  }
}

/** Quill 本地載入狀態 */
let quillLoaded = false
let quillLoading: Promise<void> | null = null

/** 載入 Quill 編輯器（cdnjs CDN，防重複載入 + 輪詢兜底） */
function loadQuill(): Promise<void> {
  // 已載入完成，直接返回
  if (window.Quill) { quillLoaded = true; return Promise.resolve() }
  // 正在載入中，返回同一個 Promise（避免重複創建 script）
  if (quillLoading) return quillLoading

  quillLoading = new Promise<void>((resolve, reject) => {
    // 載入 CSS（僅一次）
    if (!document.querySelector(`link[href="${QUILL_CSS_URL}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = QUILL_CSS_URL
      document.head.appendChild(link)
    }

    // 載入 JS（僅一次）
    let script = document.getElementById('quill-script') as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = 'quill-script'
      script.src = QUILL_JS_URL
      script.async = true
      document.head.appendChild(script)
    }

    // 事件監聽
    script.addEventListener('load', () => { quillLoaded = true; quillLoading = null; resolve() })
    script.addEventListener('error', () => { quillLoading = null; reject(new Error('Quill 腳本載入失敗')) })

    // 輪詢兜底：每 100ms 檢查 window.Quill 是否已就緒（解決事件遺漏問題）
    let attempts = 0
    const maxAttempts = 50 // 5 秒超時
    const poll = setInterval(() => {
      attempts++
      if (window.Quill) {
        clearInterval(poll)
        quillLoaded = true
        quillLoading = null
        resolve()
      } else if (attempts >= maxAttempts) {
        clearInterval(poll)
        quillLoading = null
        reject(new Error('Quill 載入超時（5秒）'))
      }
    }, 100)
  })

  return quillLoading
}

/** 內容狀態（前端 UI 用）: '1'=已發布, '0'=草稿（待發佈）, '2'=草稿（不發佈）
 *  '2' 僅前端使用，提交 API 時轉為 '0'（API 不區分 status=2） */
type ContentStatus = '1' | '0' | '2'

/** 內容數據結構 */
interface Content {
  id: number
  title: string
  titlecolor: string
  scode: string
  content: string
  date: string
  status: string
  istop: string
  isrecommend: string
  isheadline: string
  visits: number
  keywords: string
  description: string
  sorting: number
  author: string
  source: string
  tags: string
  ico: string
  filename: string
  outlink: string
  subtitle: string
}

/** 欄目（分類）樹節點 */
interface Category {
  id: number
  name: string
  scode: string
  pcode: string
  status: string
  children?: Category[]
}

/** 內容詳情響應 */
interface ContentDetail {
  content: Content
}

/** 擴展欄位定義 */
interface ExtField {
  id: number
  name: string
  field: string
  type: string // 1=單行文本 ... 10=多圖
  mcode: string // 所屬模型代碼
  value: string // 選項選項預設值（單選/多選/下拉的選項列表）
  scode: string // 適用欄目（逗號分隔，空=全展示）
  required: string // "1"=必填, "0"=可選
  sorting: number
  status: string
}

/** 擴展欄位類型標籤 */
const EXT_TYPE_LABELS: Record<string, string> = {
  '1': '單行文本',
  '2': '多行文本',
  '3': '單選',
  '4': '多選',
  '5': '單圖',
  '6': '附件',
  '7': '日期',
  '8': '編輯器',
  '9': '下拉',
  '10': '多圖',
}

// ============================================================================
// ─── 設計系統：uiverse.io 風格表單元件樣式常量 ───
// 特徵：柔和背景 + 漸變邊框 + 焦點光暈 + 平滑過渡
// ============================================================================
const DS = {
  /** 輸入框：柔和半透明背景 + 焦點時白色高亮 + 光暈環 */
  input:
    'w-full px-4 py-2.5 text-sm bg-gray-50/50 border border-input rounded-lg ' +
    'transition-all duration-200 hover:border-gray-300 ' +
    'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring focus:bg-white ' +
    'placeholder:text-muted-foreground/60',
  /** 下拉框：繼承輸入框 + 白色背景 + 自定義箭頭 */
  select:
    'w-full px-4 py-2.5 text-sm bg-white border border-input rounded-lg ' +
    'transition-all duration-200 hover:border-gray-300 ' +
    'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring ' +
    'cursor-pointer appearance-none ' +
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23999'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")] " +
    'bg-no-repeat bg-[right_0.75rem_center] bg-[length:1.25rem] pr-10',
  /** 文本域 */
  textarea:
    'w-full px-4 py-2.5 text-sm bg-gray-50/50 border border-input rounded-lg ' +
    'transition-all duration-200 hover:border-gray-300 ' +
    'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring focus:bg-white ' +
    'placeholder:text-muted-foreground/60 resize-y',
  /** 小按鈕（次要操作） */
  btnSm:
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-input rounded-lg ' +
    'bg-white hover:bg-accent hover:border-gray-300 transition-all duration-200',
  /** 標籤 */
  label: 'block text-sm font-medium text-foreground mb-2',
  /** 小標籤（帶描述） */
  labelHint: 'text-xs font-normal text-muted-foreground ml-2',
  /** URL 輸入框（窄行） */
  urlInput:
    'flex-1 min-w-[180px] px-3 py-2 text-sm bg-gray-50/50 border border-input rounded-lg ' +
    'transition-all duration-200 hover:border-gray-300 ' +
    'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring focus:bg-white ' +
    'placeholder:text-muted-foreground/60',
}

/** 表單數據 */
interface FormData {
  title: string
  titlecolor: string
  scode: string
  content: string
  keywords: string
  description: string
  status: ContentStatus
  istop: boolean
  isrecommend: boolean
  isheadline: boolean
  tags: string
  author: string
  source: string
  ico: string
  filename: string
  outlink: string
  subtitle: string
  date: string
}

/** 空表單初始值 */
const EMPTY_FORM: FormData = {
  title: '',
  titlecolor: '',
  scode: '',
  content: '',
  keywords: '',
  description: '',
  status: '1',
  istop: false,
  isrecommend: false,
  isheadline: false,
  tags: '',
  author: '',
  source: '',
  ico: '',
  filename: '',
  outlink: '',
  subtitle: '',
  date: '',
}

/** 草稿數據結構（localStorage 自動保存，按欄目+文章ID隔離） */
interface ContentDraft {
  form: FormData
  htmlSource: string
  extValues: Record<string, string>
  savedAt: string
}

/** 草稿自動保存間隔（毫秒） */
const DRAFT_AUTOSAVE_INTERVAL = 30000

/** 草稿 localStorage key 生成器 */
const draftKeyOf = (scode: string, id?: string) =>
  `content_draft:${scode}:${id || 'new'}`

/** 將欄目樹渲染為帶縮進的 select 選項 */
function renderCategoryOptions(
  categories: Category[],
  depth = 0,
): React.ReactNode[] {
  const options: React.ReactNode[] = []
  for (const cat of categories) {
    const prefix = depth > 0 ? '└' + '─'.repeat(depth - 1) + ' ' : ''
    options.push(
      <option key={cat.scode} value={cat.scode}>
        {prefix}
        {cat.name}
      </option>,
    )
    if (cat.children && cat.children.length > 0) {
      options.push(...renderCategoryOptions(cat.children, depth + 1))
    }
  }
  return options
}

/** 擴展字段輸入元件：根據欄位類型渲染對應的輸入控件 */
function ExtFieldInput({
  field,
  value,
  onChange,
  uploadFile,
}: {
  field: ExtField
  value: string
  onChange: (val: string) => void
  uploadFile: (file: File) => Promise<string | null>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [urlInput, setUrlInput] = useState('') // 外鏈 URL 輸入框值
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false) // 媒體庫選擇器開關
  const [historyTags, setHistoryTags] = useState<string[]>([]) // 歷史標籤列表（type=11 用）

  // type=11 載入歷史標籤
  useEffect(() => {
    if (field.type !== '11' || !field.id) return
    api.get<string[]>(`/admin/extfields/${field.id}/history`).then((res) => {
      setHistoryTags(res.data ?? [])
    }).catch(() => { /* 不影響編輯功能 */ })
  }, [field.type, field.id])

  // 解析選項值（單選/多選/下拉）
  const options = field.value
    ? field.value.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  // 處理單文件上傳（單圖/附件）
  const handleSingleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadFile(file)
      if (url) onChange(url)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // 處理多圖上傳
  const handleMultiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const urls: string[] = []
      for (const file of files) {
        const url = await uploadFile(file)
        if (url) urls.push(url)
      }
      if (urls.length > 0) {
        const existing = value ? value.split(',').filter(Boolean) : []
        onChange([...existing, ...urls].join(','))
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // 多選：切換某個選項
  const toggleMultiOption = (opt: string) => {
    const selected = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt]
    onChange(next.join(','))
  }

  // 多圖：移除指定圖片
  const removeImage = (idx: number) => {
    const images = value ? value.split(',').filter(Boolean) : []
    images.splice(idx, 1)
    onChange(images.join(','))
  }

  switch (field.type) {
    case '1': // 單行文本
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={DS.input}
          placeholder={`請輸入${field.name}`}
        />
      )
    case '2': // 多行文本
    case '8': // 編輯器（簡化為 textarea）
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={field.type === '8' ? 8 : 4}
          className={DS.textarea}
          placeholder={`請輸入${field.name}`}
        />
      )
    case '3': // 單選 — uiverse.io 風格自定義 radio
      return (
        <div className="flex flex-wrap gap-3 pt-1">
          {options.length === 0 && (
            <span className="text-sm text-muted-foreground">未設置選項</span>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              className="inline-flex items-center gap-2 cursor-pointer group select-none"
            >
              <input
                type="radio"
                name={`ext-${field.field}`}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="peer sr-only"
              />
              <span className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-input bg-white transition-all duration-200 group-hover:border-blue-400 peer-checked:border-blue-500 peer-checked:bg-blue-500">
                <span className="w-2 h-2 rounded-full bg-white scale-0 transition-transform duration-200 peer-checked:scale-100" />
              </span>
              <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                {opt}
              </span>
            </label>
          ))}
        </div>
      )
    case '4': // 多選 — uiverse.io 風格自定義 checkbox
      return (
        <div className="flex flex-wrap gap-3 pt-1">
          {options.length === 0 && (
            <span className="text-sm text-muted-foreground">未設置選項</span>
          )}
          {options.map((opt) => {
            const selected = value
              ? value.split(',').map((s) => s.trim()).filter(Boolean)
              : []
            const isChecked = selected.includes(opt)
            return (
              <label
                key={opt}
                className="inline-flex items-center gap-2 cursor-pointer group select-none"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleMultiOption(opt)}
                  className="peer sr-only"
                />
                <span className="flex items-center justify-center w-5 h-5 rounded-md border-2 border-input bg-white transition-all duration-200 group-hover:border-emerald-400 peer-checked:bg-emerald-500 peer-checked:border-emerald-500">
                  {isChecked && (
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                  {opt}
                </span>
              </label>
            )
          })}
        </div>
      )
    case '5': // 單圖
      return (
        <div className="space-y-2">
          {value && (
            <ImagePreviewWithRemove
              src={value}
              alt={field.name}
              onRemove={() => onChange('')}
              containerClassName="border rounded"
              imgClassName="max-w-48 max-h-48 w-auto h-auto object-contain"
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleSingleUpload}
          />
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={urlInput || value}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="輸入圖片外鏈 URL"
              className={DS.urlInput}
            />
            <button
              type="button"
              onClick={() => {
                if (urlInput.trim()) {
                  onChange(urlInput.trim())
                  setUrlInput('')
                }
              }}
              className={DS.btnSm}
            >
              <span className="text-base">🔗</span>
              <span>確認</span>
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={DS.btnSm + ' disabled:opacity-50'}
            >
              {uploading ? (
                <span className="inline-block animate-spin">🔄</span>
              ) : (
                <span className="text-base">🖼️</span>
              )}
              <span>{uploading ? '上傳中...' : value ? '更換圖片' : '上傳圖片'}</span>
            </button>
            <button
              type="button"
              onClick={() => setMediaPickerOpen(true)}
              className={DS.btnSm}
            >
              <span className="text-base">🖼️</span>
              <span>媒體庫</span>
            </button>
          </div>
          <MediaPickerModal
            open={mediaPickerOpen}
            onClose={() => setMediaPickerOpen(false)}
            onSelect={(url) => onChange(url)}
            onUpload={async (files) => {
              const urls: (string | null)[] = []
              for (const f of files) {
                urls.push(await uploadFile(f))
              }
              return urls
            }}
          />
        </div>
      )
    case '6': // 附件
      return (
        <div className="space-y-2">
          {value && (
            <div className="flex items-center gap-2">
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline truncate max-w-xs"
              >
                {value.split('/').pop() || '查看附件'}
              </a>
              <button
                type="button"
                onClick={() => onChange('')}
                className="p-0.5 text-red-600 hover:bg-red-50 rounded"
                title="移除"
              >
                <span className="text-sm leading-none">❌</span>
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" className="hidden" onChange={handleSingleUpload} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={DS.btnSm + ' disabled:opacity-50'}
          >
            {uploading ? (
              <span className="inline-block animate-spin">🔄</span>
            ) : (
              <span className="text-base">📤</span>
            )}
            <span>{uploading ? '上傳中...' : '上傳附件'}</span>
          </button>
        </div>
      )
    case '7': // 日期
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={DS.input}
        />
      )
    case '9': // 下拉
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={DS.select}
        >
          <option value="">請選擇</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )
    case '10': // 多圖
      return (
        <div className="space-y-2">
          {value && (
            <div className="flex flex-wrap gap-2">
              {value
                .split(',')
                .filter(Boolean)
                .map((url, idx) => (
                  <ImagePreviewWithRemove
                    key={idx}
                    src={url}
                    alt={`${field.name}-${idx}`}
                    onRemove={() => removeImage(idx)}
                    containerClassName="border rounded"
                    imgClassName="max-w-32 max-h-32 w-auto h-auto object-contain"
                  />
                ))}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleMultiUpload}
          />
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="輸入圖片外鏈 URL"
              className={DS.urlInput}
            />
            <button
              type="button"
              onClick={() => {
                if (urlInput.trim()) {
                  const existing = value ? value.split(',').filter(Boolean) : []
                  onChange([...existing, urlInput.trim()].join(','))
                  setUrlInput('')
                }
              }}
              className={DS.btnSm}
            >
              <span className="text-base">➕</span>
              <span>添加</span>
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={DS.btnSm + ' disabled:opacity-50'}
            >
              {uploading ? (
                <span className="inline-block animate-spin">🔄</span>
              ) : (
                <span className="text-base">🖼️</span>
              )}
              <span>{uploading ? '上傳中...' : '上傳圖片'}</span>
            </button>
            <button
              type="button"
              onClick={() => setMediaPickerOpen(true)}
              className={DS.btnSm}
            >
              <span className="text-base">🖼️</span>
              <span>媒體庫</span>
            </button>
          </div>
          <MediaPickerModal
            open={mediaPickerOpen}
            onClose={() => setMediaPickerOpen(false)}
            onSelect={(url) => {
              const existing = value ? value.split(',').filter(Boolean) : []
              onChange([...existing, url].join(','))
            }}
            onUpload={async (files) => {
              const urls: (string | null)[] = []
              for (const f of files) {
                urls.push(await uploadFile(f))
              }
              const valid = urls.filter((u): u is string => !!u)
              if (valid.length > 0) {
                const existing = value ? value.split(',').filter(Boolean) : []
                onChange([...existing, ...valid].join(','))
              }
              return urls
            }}
          />
        </div>
      )
    case '11': // 標籤輸入（帶歷史）
      const currentTags = value ? value.split(',').map((t) => t.trim()).filter(Boolean) : []
      return (
        <div className="w-full space-y-2">
          <TagInput
            values={currentTags}
            onChange={(tags) => onChange(tags.join(','))}
            placeholder={`輸入${field.name}後按 Enter 添加`}
          />
          {historyTags.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">📋 歷史標籤（點擊添加）</p>
              <div className="flex flex-wrap gap-1.5">
                {historyTags
                  .filter((t) => !currentTags.includes(t))
                  .slice(0, 30)
                  .map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        if (!currentTags.includes(tag)) {
                          onChange([...currentTags, tag].join(','))
                        }
                      }}
                      className="px-2 py-0.5 text-xs border border-border text-muted-foreground rounded-full hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )
    default:
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={DS.input}
          placeholder={`請輸入${field.name}`}
        />
      )
  }
}

export default function ContentEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mcode = searchParams.get('mcode') || ''
  const isEdit = !!id

  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editorReady, setEditorReady] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic')
  const [icoUploading, setIcoUploading] = useState(false)
  const [icoUrlInput, setIcoUrlInput] = useState('') // 縮略圖外鏈 URL 輸入框值
  const [icoMediaPickerOpen, setIcoMediaPickerOpen] = useState(false) // 縮略圖媒體庫選擇器
  const [quillImagePicker, setQuillImagePicker] = useState(false) // Quill 編輯器媒體庫選擇器
  const [quillVideoPicker, setQuillVideoPicker] = useState(false) // Quill 編輯器視頻插入器
  const [quillFaqPicker, setQuillFaqPicker] = useState(false) // Quill 編輯器 FAQ 插入器
  const [faqEditIndex, setFaqEditIndex] = useState<number | null>(null) // FAQ 編輯模式：目標 blot 索引（null = 新增模式）
  const [faqEditPairs, setFaqEditPairs] = useState<{ question: string; answer: string }[]>([]) // 編輯模式預填數據
  const [allTags, setAllTags] = useState<string[]>([]) // 歷史標籤列表（供快速補充）
  const [aiTagLoading, setAiTagLoading] = useState(false) // AI 標籤建議載入狀態
  const [showBulkTags, setShowBulkTags] = useState(false) // 批量導入標籤展開狀態
  const [bulkTagsText, setBulkTagsText] = useState('') // 批量導入標籤文本
  // 保存原始數據快照（用於保存時比對修改字段）
  const originalDataRef = useRef<Record<string, unknown> | null>(null)
  const [saveHint, setSaveHint] = useState<{ changedCount: number; fields: string[] } | null>(null)

  // 保存提示 5 秒自動隱藏
  useEffect(() => {
    if (!saveHint) return
    const timer = setTimeout(() => setSaveHint(null), 5000)
    return () => clearTimeout(timer)
  }, [saveHint])

  // HTML 源碼模式
  const [htmlMode, setHtmlMode] = useState(false)
  const [htmlSource, setHtmlSource] = useState('')

  // 自定義擴展欄位
  const [extFields, setExtFields] = useState<ExtField[]>([])
  const [extValues, setExtValues] = useState<Record<string, string>>({})
  const [extLoading, setExtLoading] = useState(false)

  const editorRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<QuillInstance | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const icoFileRef = useRef<HTMLInputElement>(null)

  // ─── 上傳 hook（autoCompress=false：圖片通過 ImageCompressDialog 壓縮） ───
  // 統一所有上傳位置：縮略圖、Quill 編輯器圖片、擴展字段圖片
  const { uploading: imgUploading, progress: imgProgress, error: imgUploadError, uploadSingle, clearError: clearImgError } = useImageUpload({
    autoCompress: false,
  })

  // ─── 圖片壓縮對話框狀態 ───
  // 當用戶選擇圖片時，彈出 ImageCompressDialog 讓用戶控制壓縮質量
  // 回調函數在壓縮確認後被調用，傳入壓縮後的文件
  // 支持批量：粘貼富文本帶多圖時一次壓縮多張
  const [pendingImageUpload, setPendingImageUpload] = useState<{
    files: File[]
    callback: (urls: (string | null)[]) => void
  } | null>(null)

  // ─── 草稿自動保存（localStorage） ───
  const [draftPrompt, setDraftPrompt] = useState<{ title: string; savedAt: string } | null>(null)
  const draftCheckedRef = useRef(false) // 確保草稿檢查只執行一次
  const saveDraftRef = useRef<() => void>(() => {}) // 最新保存函數引用（給定時器/卸載用）
  const dirtyRef = useRef(false) // 用戶是否修改過表單（未修改時不寫入草稿，避免刷新觸發誤存）

  // ─── 預覽功能（v1.9.62，v1.9.67 改用 Shadow DOM 取代 iframe） ───
  const [showPreview, setShowPreview] = useState(false)
  const [previewCss, setPreviewCss] = useState('')
  const previewRef = useRef<HTMLDivElement>(null) // Shadow DOM host
  const shadowRootRef = useRef<ShadowRoot | null>(null) // 影子根引用
  // refs 保持最新值供 interval 讀取（避免閉包捕獲舊值）
  const htmlModeRef = useRef(htmlMode)
  const htmlSourceRef = useRef(htmlSource)
  const formContentRef = useRef(form.content)
  htmlModeRef.current = htmlMode
  htmlSourceRef.current = htmlSource
  formContentRef.current = form.content

  /** 載入欄目樹 (支持按 mcode 過濾，使用 /all 端點無需 M202 權限) */
  const fetchCategories = useCallback(async () => {
    try {
      const url = mcode ? `/admin/sorts/all?mcode=${encodeURIComponent(mcode)}` : '/admin/sorts/all'
      const res = await api.get<Category[]>(url)
      const cats = res.data ?? []
      setCategories(cats)
      // 新建模式下, 如果有 mcode 參數且未選擇欄目, 自動預選第一個欄目
      if (!isEdit && !form.scode && cats.length > 0) {
        setForm((prev) => ({ ...prev, scode: cats[0].scode }))
      }
    } catch {
      /* 忽略欄目載入錯誤 */
    }
  }, [mcode, isEdit, form.scode])

  /** 載入內容詳情（編輯模式） */
  const fetchContent = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      // 使用 admin 端點載入內容（不經過 Workers Cache，確保讀到最新數據）
      const res = await api.get<ContentDetail>(`/admin/contents/${id}`)
      const content = res.data?.content
      if (content) {
        // 將 'YYYY-MM-DD HH:MM:SS' 轉為 datetime-local 所需的 'YYYY-MM-DDTHH:MM'
        const rawDate = content.date ?? ''
        const localDate = rawDate ? rawDate.replace(' ', 'T').slice(0, 16) : ''
        setForm({
          title: content.title ?? '',
          titlecolor: content.titlecolor ?? '',
          scode: content.scode ?? '',
          content: content.content ?? '',
          keywords: content.keywords ?? '',
          description: content.description ?? '',
          status: content.status === '1' ? '1' : (content.date ? '0' : '2'),
          istop: content.istop === '1',
          isrecommend: content.isrecommend === '1',
          isheadline: content.isheadline === '1',
          tags: content.tags ?? '',
          author: content.author ?? '',
          source: content.source ?? '',
          ico: content.ico ?? '',
          filename: content.filename ?? '',
          outlink: content.outlink ?? '',
          subtitle: content.subtitle ?? '',
          date: localDate,
        })
        // 保存原始數據快照（用於保存時比對修改字段）
        // ext_fields 初始為空對象，後續由 fetchExtFields 載入擴展值時填充
        originalDataRef.current = {
          title: content.title ?? '',
          titlecolor: content.titlecolor ?? '',
          scode: content.scode ?? '',
          content: content.content ?? '',
          keywords: content.keywords ?? '',
          description: content.description ?? '',
          status: content.status === '1' ? '1' : (content.date ? '0' : '2'),
          istop: content.istop === '1',
          isrecommend: content.isrecommend === '1',
          isheadline: content.isheadline === '1',
          tags: content.tags ?? '',
          author: content.author ?? '',
          source: content.source ?? '',
          ico: content.ico ?? '',
          filename: content.filename ?? '',
          outlink: content.outlink ?? '',
          subtitle: content.subtitle ?? '',
          date: localDate,
          ext_fields: {} as Record<string, string>,
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入內容失敗')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // 載入歷史標籤列表（供標籤輸入器快速補充）
  useEffect(() => {
    api.get<string[]>('/admin/contents/all-tags').then((res) => {
      setAllTags(res.data ?? [])
    }).catch(() => {
      // 獲取失敗不影響編輯功能
    })
  }, [])

  useEffect(() => {
    if (isEdit) {
      fetchContent()
    }
  }, [isEdit, fetchContent])

  /** 載入欄目對應的擴展欄位，編輯模式下同時載入現有擴展值 */
  const fetchExtFields = useCallback(
    async (scode: string, contentId?: string) => {
      if (!scode) {
        setExtFields([])
        setExtValues({})
        return
      }
      setExtLoading(true)
      try {
        const res = await api.get<ExtField[]>(
          `/admin/contents/extfields?scode=${encodeURIComponent(scode)}`,
        )
        const fields = res.data ?? []
        setExtFields(fields)
        // 初始化空值
        const initial: Record<string, string> = {}
        for (const f of fields) {
          initial[f.field] = ''
        }
        // 編輯模式：載入現有擴展值，僅合併當前欄位存在的值
        if (contentId) {
          try {
            const vRes = await api.get<Record<string, string>>(
              `/admin/contents/${contentId}/ext`,
            )
            if (vRes.data) {
              for (const f of fields) {
                const v = vRes.data[f.field]
                if (v !== undefined && v !== null) {
                  initial[f.field] = v
                }
              }
            }
          } catch {
            /* 忽略擴展值載入錯誤 */
          }
        }
        setExtValues(initial)
        // 編輯模式載入時，將擴展字段快照寫入 originalDataRef（供 getChangedFields 比對）
        if (contentId && originalDataRef.current) {
          originalDataRef.current = {
            ...originalDataRef.current,
            ext_fields: { ...initial },
          }
        }
      } catch {
        setExtFields([])
        setExtValues({})
      } finally {
        setExtLoading(false)
      }
    },
    [],
  )

  // 當欄目變化時，載入對應擴展欄位（編輯模式下附帶現有值）
  useEffect(() => {
    if (form.scode) {
      fetchExtFields(form.scode, isEdit && id ? id : undefined)
    } else {
      setExtFields([])
      setExtValues({})
    }
  }, [form.scode, fetchExtFields, isEdit, id])

  /** 更新擴展字段值 */
  const updateExtValue = (field: string, value: string) => {
    dirtyRef.current = true
    setExtValues((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * 圖片上傳到 R2（統一使用 ImageCompressDialog 讓用戶控制壓縮質量）
   *
   * 流程：
   *   1. 用戶選擇圖片文件
   *   2. 彈出 ImageCompressDialog（質量滑桿+尺寸控制+前後對比）
   *   3. 用戶確認壓縮設置後，hook 上傳壓縮後的文件
   *   4. 返回上傳後的 URL
   *
   * 非圖片文件（SVG等）直接上傳，不彈出對話框。
   *
   * 使用位置：縮略圖、Quill 編輯器圖片、擴展字段圖片、媒體庫選擇器上傳
   */
  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    clearImgError()
    // SVG 和非圖片文件直接上傳，不壓縮
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return await uploadSingle(file)
    }
    // 圖片文件：彈出壓縮對話框，等待用戶確認
    return new Promise<string | null>((resolve) => {
      setPendingImageUpload({
        files: [file],
        callback: (urls) => resolve(urls[0] ?? null),
      })
    })
  }, [uploadSingle, clearImgError])

  /**
   * 批量圖片上傳（用於粘貼富文本帶多圖場景）
   * 一次彈出 ImageCompressDialog 壓縮所有圖片，然後逐張上傳
   */
  const uploadImages = useCallback(async (files: File[]): Promise<(string | null)[]> => {
    // 分離需要壓縮的圖片和可直接上傳的文件
    const compressible: File[] = []
    const direct: { index: number; file: File }[] = []
    files.forEach((file, index) => {
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        direct.push({ index, file })
      } else {
        compressible.push(file)
      }
    })

    // 直接上傳的非圖片文件
    const results: (string | null)[] = new Array(files.length).fill(null)
    for (const { index, file } of direct) {
      clearImgError()
      results[index] = await uploadSingle(file)
    }

    // 需要壓縮的圖片文件
    if (compressible.length > 0) {
      const compressedUrls = await new Promise<(string | null)[]>((resolve) => {
        setPendingImageUpload({
          files: compressible,
          callback: resolve,
        })
      })
      let compressedIdx = 0
      files.forEach((file, index) => {
        if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
          results[index] = compressedUrls[compressedIdx] ?? null
          compressedIdx++
        }
      })
    }

    return results
  }, [uploadSingle, clearImgError])

  /** ImageCompressDialog 確認回調 — 批量上傳壓縮後的文件 */
  const handleImageCompressConfirm = useCallback(async (compressedFiles: File[]) => {
    if (!pendingImageUpload) return
    const { callback } = pendingImageUpload
    setPendingImageUpload(null)

    if (compressedFiles.length === 0) {
      callback([])
      return
    }

    clearImgError()
    // 逐張上傳壓縮後的文件，返回所有 URL（保持順序）
    const urls: (string | null)[] = []
    for (const file of compressedFiles) {
      const url = await uploadSingle(file)
      urls.push(url)
    }
    callback(urls)
  }, [pendingImageUpload, uploadSingle, clearImgError])

  /** ImageCompressDialog 取消回調 */
  const handleImageCompressCancel = useCallback(() => {
    if (pendingImageUpload) {
      pendingImageUpload.callback([])
      setPendingImageUpload(null)
    }
  }, [pendingImageUpload])

  // ============================================================================
  // ─── 草稿自動保存（純前端 localStorage 方案，不涉及後端 API） ───
  //
  // 機制：
  //   1. 每 30 秒定時將當前表單數據序列化存入 localStorage
  //   2. 頁面離開前（beforeunload + 組件卸載）也保存一次
  //   3. 重新進入編輯頁面時，如有未提交草稿，顯示「恢復草稿」提示
  //   4. 手動保存/發佈成功後清除對應草稿
  //
  // 草稿 key 格式：content_draft:{scode}:{id || 'new'}，按欄目+文章ID隔離
  // ============================================================================

  /** 保存草稿到 localStorage */
  const saveDraft = useCallback(() => {
    if (!dirtyRef.current) return // 未修改不保存，避免刷新觸發誤存
    if (!form.scode) return // 沒有欄目不保存
    // 從 Quill 編輯器獲取最新內容（form.content 可能滯後於編輯器）
    let currentContent = form.content
    if (quillRef.current) {
      currentContent = quillRef.current.root.innerHTML
    }
    const draft: ContentDraft = {
      form: { ...form, content: currentContent },
      htmlSource,
      extValues: { ...extValues },
      savedAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' }),
    }
    try {
      localStorage.setItem(draftKeyOf(form.scode, id), JSON.stringify(draft))
    } catch {
      /* localStorage 滿或不可用，靜默失敗 */
    }
  }, [form, htmlSource, extValues, id])

  // 保持 saveDraftRef 指向最新的 saveDraft（給定時器和卸載回調使用）
  useEffect(() => {
    saveDraftRef.current = saveDraft
  }, [saveDraft])

  // ─── 30 秒定時自動保存 ───
  useEffect(() => {
    if (!form.scode) return // 沒有欄目時不啟動定時器
    const timer = setInterval(() => saveDraftRef.current(), DRAFT_AUTOSAVE_INTERVAL)
    return () => clearInterval(timer)
  }, [form.scode])

  // ─── 頁面離開前保存（beforeunload：關閉頁籤/刷新；卸載：SPA 路由切換） ───
  useEffect(() => {
    const handleBeforeUnload = () => saveDraftRef.current()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      saveDraftRef.current() // 組件卸載時也保存（覆蓋 SPA 路由切換場景）
    }
  }, [])

  // ─── 掛載時檢查是否有未提交的草稿 ───
  useEffect(() => {
    if (draftCheckedRef.current) return // 只檢查一次
    if (!form.scode) return // 欄目未確定時不檢查
    if (isEdit && loading) return // 編輯模式下等待內容載入完成
    draftCheckedRef.current = true
    try {
      const raw = localStorage.getItem(draftKeyOf(form.scode, id))
      if (!raw) return
      const draft = JSON.parse(raw) as ContentDraft
      // 只在有實際內容時才提示
      if (draft.form.title || draft.form.content) {
        setDraftPrompt({ title: draft.form.title, savedAt: draft.savedAt })
      }
    } catch {
      /* 草稿解析失敗，忽略 */
    }
  }, [form.scode, isEdit, loading, id])

  // ─── 預覽 CSS 載入（v1.9.62，掛載時拉取一次站點配置） ───
  useEffect(() => {
    api.get<{ preview_css?: string }>('/admin/site')
      .then((res) => setPreviewCss(res.data?.preview_css || ''))
      .catch(() => { /* 靜默失敗，預覽仍可用預設樣式 */ })
  }, [])

  /** 取得當前編輯器 HTML（Quill 模式 or HTML 源碼模式） */
  const getEditorHtml = useCallback(() => {
    return htmlModeRef.current
      ? htmlSourceRef.current
      : (quillRef.current?.root.innerHTML || formContentRef.current)
  }, [])

  /** 構建預覽 CSS（剝離 Vue scoped 屬性） */
  const buildPreviewStyle = useCallback(() => {
    const css = previewCss.replace(/\[data-v-[a-fA-F0-9]+\]/g, '')
    return `img{max-width:100%;height:auto;}\n${css}\n.preview-body{padding:20px;max-width:900px;margin:0 auto;}`
  }, [previewCss])

  /** 將編輯器內容注入預覽 Shadow DOM（精準更新 innerHTML，保留滾動位置） */
  const injectPreviewContent = useCallback(() => {
    const root = shadowRootRef.current
    if (!root) return
    const container = root.querySelector('.article-content')
    if (container) container.innerHTML = getEditorHtml()
  }, [getEditorHtml])

  // ─── Shadow DOM 初始化（showPreview 開啟時掛載影子根 + 結構） ───
  useEffect(() => {
    if (!showPreview || !previewRef.current) return
    const host = previewRef.current
    // 掛載影子根（僅一次）
    if (!host.shadowRoot) {
      host.attachShadow({ mode: 'open' })
    }
    const root = host.shadowRoot!
    shadowRootRef.current = root
    // 注入結構：<style>（內容由 CSS effect 填充）+ 內容容器
    root.innerHTML = `<style></style><div class="preview-body article-content text-desc mb-8 lg:mb-15"></div>`
    // 立即注入 CSS 和內容
    const styleEl = root.querySelector('style')
    if (styleEl) styleEl.textContent = buildPreviewStyle()
    injectPreviewContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview])

  // ─── 預覽 CSS 變更時更新 <style> 元素（不重建影子根，保留滾動位置） ───
  useEffect(() => {
    const root = shadowRootRef.current
    if (!root) return
    const styleEl = root.querySelector('style')
    if (styleEl) styleEl.textContent = buildPreviewStyle()
  }, [previewCss, buildPreviewStyle])

  // ─── 預覽即時更新（每 1.5 秒注入編輯器內容，不觸發重載，保留滾動位置） ───
  useEffect(() => {
    if (!showPreview) return
    injectPreviewContent()
    const timer = setInterval(injectPreviewContent, 1500)
    return () => clearInterval(timer)
  }, [showPreview, injectPreviewContent])

  // ─── 滾動同步：編輯器滾動進度 → 預覽容器滾動（v1.9.67 Shadow DOM 同文檔原生監聽） ───
  useEffect(() => {
    if (!showPreview) return
    const handleScroll = () => {
      const editor = quillRef.current?.root
      const previewEl = previewRef.current
      if (!editor || !previewEl) return
      const rect = editor.getBoundingClientRect()
      const vh = window.innerHeight
      // 計算編輯器在視口中的滾動進度（0=頂部，1=底部）
      let progress = 0
      if (rect.top >= 0) {
        progress = 0
      } else if (rect.bottom <= vh) {
        progress = 1
      } else {
        const scrollable = rect.height - vh
        progress = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0
      }
      // 按比例滾動預覽容器（同文檔，直接操作 DOM）
      const maxScroll = previewEl.scrollHeight - previewEl.clientHeight
      if (maxScroll > 0) previewEl.scrollTop = progress * maxScroll
    }
    // 從編輯器向上查找真正的滾動容器（Layout 的 <main> overflow-y-auto）
    const editorEl = quillRef.current?.root || null
    let scrollContainer: Element | null = editorEl
    while (scrollContainer && scrollContainer !== document.body) {
      const style = getComputedStyle(scrollContainer)
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
        break
      }
      scrollContainer = scrollContainer.parentElement
    }
    const target = scrollContainer || window
    target.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // 初始同步
    return () => target.removeEventListener('scroll', handleScroll)
  }, [showPreview])

  /** 恢復草稿：將草稿數據寫回表單和編輯器 */
  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(draftKeyOf(form.scode, id))
      if (!raw) return
      const draft = JSON.parse(raw) as ContentDraft
      setForm(draft.form)
      setHtmlSource(draft.htmlSource)
      // 恢復自定義擴展字段（兼容舊草稿無 extValues 的情況）
      if (draft.extValues) {
        setExtValues(draft.extValues)
      }
      // Quill 編輯器已初始化時，手動寫入內容
      if (draft.form.content && quillRef.current) {
        quillRef.current.clipboard.dangerouslyPasteHTML(draft.form.content)
      }
      dirtyRef.current = true // 恢復草稿後視為已修改，後續編輯可繼續自動保存
    } catch {
      /* 恢復失敗，忽略 */
    }
    setDraftPrompt(null)
  }

  /** 丟棄草稿：清除 localStorage 並關閉提示 */
  const discardDraft = () => {
    dirtyRef.current = false // 重置為未修改狀態，避免定時器/beforeunload 再次寫入
    try {
      localStorage.removeItem(draftKeyOf(form.scode, id))
    } catch {
      /* 忽略 */
    }
    setDraftPrompt(null)
  }

  /** 縮略圖（ico）上傳處理 */
  const handleIcoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIcoUploading(true)
    try {
      const url = await uploadImage(file)
      if (url) updateField('ico', url)
    } finally {
      setIcoUploading(false)
      if (icoFileRef.current) icoFileRef.current.value = ''
    }
  }

  /** 初始化 Quill 編輯器（依賴 loading，確保編輯器 DOM 已渲染） */
  useEffect(() => {
    // 載入中時編輯器 div 不在 DOM 中，跳過初始化
    if (loading) return

    let cancelled = false
    let pasteHandler: ((e: ClipboardEvent) => void) | null = null

    const initEditor = async () => {
      try {
        await loadQuill()
        if (cancelled || !window.Quill || !editorRef.current) return

        // 如果已有實例，先清理
        if (quillRef.current) {
          editorRef.current.innerHTML = ''
        }

        // 創建編輯器容器
        const editorContainer = document.createElement('div')
        editorRef.current.appendChild(editorContainer)

        const quill = new window.Quill(editorContainer, {
          theme: 'snow',
          readOnly: false,
          placeholder: '在此輸入內容...',
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
                ['html-source'], // 自定義按鈕：HTML 源碼模式
              ],
              handlers: {
                image: function () {
                  // 直接打開增強版媒體庫選擇器（含上傳+外鏈+媒體庫三合一）
                  setQuillImagePicker(true)
                },
                'video-picker': function () {
                  setQuillVideoPicker(true)
                },
                'faq-picker': function () {
                  setFaqEditIndex(null)
                  setFaqEditPairs([])
                  setQuillFaqPicker(true)
                },
                'html-source': function () {
                  // 切換 HTML 源碼模式
                  if (!htmlMode && quillRef.current) {
                    setHtmlSource(quillRef.current.root.innerHTML)
                  }
                  setHtmlMode(!htmlMode)
                },
              },
            },
            keyboard: {
              bindings: {
                // 確保 Shift+Enter 在有序列表內創建軟換行（非新序號項）
                // 解決「標題+縮進內容」排版需求：序號內按 Shift+Enter 換行
                softBreak: {
                  key: 'Enter',
                  shiftKey: true,
                  handler: function (range: { index: number }) {
                    // @ts-expect-error Quill keyboard handler context
                    this.quill.insertEmbed(range.index, 'softBreak', true, 'user')
                    // @ts-expect-error Quill keyboard handler context
                    this.quill.setSelection(range.index + 1, 0)
                  },
                },
              },
            },
            clipboard: {
              matchVisual: false,
            },
          },
        })

        quillRef.current = quill

        // ─── 註冊 Quill 編輯器插件（admin/src/lib/quill/）───
        // FAQ 群組 BlockEmbed（含 Google microdata）
        registerFaqPlugin()
        // 視頻 iframe blot（保留完整屬性 title/allow/referrerpolicy）
        registerVideoPlugin()

        // clipboard matcher：委託插件模組處理 FAQ 群組和視頻 iframe
        // 確保 dangerouslyPasteHTML 載入已有內容時不丟失自定義元素
        quill.clipboard.addMatcher(Node.ELEMENT_NODE, (node: Node, delta: unknown) => {
          const el = node as HTMLElement

          // FAQ 群組 / 獨立 FAQ 項目（向後兼容）
          const faqOps = matchFaqElement(el)
          if (faqOps) {
            const Delta = window.Quill!.import('delta') as unknown as {
              new (ops?: unknown[]): unknown
            }
            return new Delta(faqOps)
          }

          // 視頻 iframe（保留完整屬性）
          const videoOps = matchVideoIframe(el)
          if (videoOps) {
            const Delta = window.Quill!.import('delta') as unknown as {
              new (ops?: unknown[]): unknown
            }
            return new Delta(videoOps)
          }

          return delta
        })

        // 注入插件 CSS（列表懸掛縮進 + FAQ 群組樣式 + 按鈕圖標）
        const styleEl = document.createElement('style')
        styleEl.textContent = listPluginCSS + faqPluginCSS + toolbarButtonCSS
        editorContainer.appendChild(styleEl)

        // 自定義按鈕標題
        const htmlBtn = editorContainer.querySelector('.ql-html-source')
        if (htmlBtn) htmlBtn.setAttribute('title', 'HTML 源碼模式')
        const videoBtn = editorContainer.querySelector('.ql-video-picker')
        if (videoBtn) videoBtn.setAttribute('title', '插入視頻')
        const faqBtn = editorContainer.querySelector('.ql-faq-picker')
        if (faqBtn) faqBtn.setAttribute('title', '插入 FAQ 問答（SEO 結構化數據）')

        // ─── FAQ 塊點擊編輯：點擊 .faq 容器 → 提取數據 → 打開 Modal 編輯 ───
        quill.root.addEventListener('click', (e: MouseEvent) => {
          const target = e.target as HTMLElement
          const faqDiv = target.closest('.faq') as HTMLElement | null
          if (!faqDiv) return

          // 提取 FAQ 數據
          const pairs = extractFaqPairsFromDom(faqDiv)
          if (pairs.length === 0) return

          // 查找 Quill blot 索引
          const w = window as unknown as { Quill?: { find: (node: HTMLElement, bubble?: boolean) => unknown } }
          const blot = w.Quill?.find(faqDiv, true)
          if (!blot) return

          const index = quill.getIndex(blot as never)
          if (index < 0) return

          e.preventDefault()
          e.stopPropagation()

          // 進入編輯模式
          setFaqEditIndex(index)
          setFaqEditPairs(pairs)
          setQuillFaqPicker(true)
        })

        // 設置已有內容
        if (form.content) {
          quill.clipboard.dangerouslyPasteHTML(form.content)
        }

        // 監聯內容變化
        quill.on('text-change', () => {
          if (quillRef.current) {
            const html = quillRef.current.root.innerHTML
            dirtyRef.current = true
            setForm((prev) => ({ ...prev, content: html }))
          }
        })

        // ─── 粘貼事件：攔截剪貼板圖片 + 粘貼 HTML 中的 base64 圖片 ───
        // 場景1：用戶截圖粘貼 → 提取 File → 壓縮上傳 → 插入編輯器
        // 場景2：從本地文章/Word/網頁複製帶圖富文本 → Quill 插入 HTML → 掃描 base64 圖片 → 轉存媒體庫
        const handlePaste = async (e: ClipboardEvent) => {
          const clipboardData = e.clipboardData
          if (!clipboardData) return
          const items = clipboardData.items
          if (!items || items.length === 0) return

          // 提取所有圖片文件（排除文本/HTML 類型）
          const imageFiles: File[] = []
          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (item.kind === 'file' && item.type.startsWith('image/')) {
              const file = item.getAsFile()
              if (file) {
                // 給文件一個合理的名字
                if (!file.name || file.name === 'image.png') {
                  const ext = file.type.split('/')[1] || 'png'
                  const newName = `paste_${Date.now()}_${i}.${ext}`
                  imageFiles.push(new File([file], newName, { type: file.type }))
                } else {
                  imageFiles.push(file)
                }
              }
            }
          }

          // 場景1：剪貼板有圖片文件（截圖）→ 阻止默認，走批量壓縮上傳
          if (imageFiles.length > 0) {
            e.preventDefault()
            e.stopPropagation()

            const range = quill.getSelection()
            const insertIndex = range ? range.index : (quill.getLength() || 0) - 1

            const urls = await uploadImages(imageFiles)
            const validUrls = urls.filter((u): u is string => !!u)

            validUrls.forEach((url, i) => {
              quill.insertEmbed(insertIndex + i, 'image', url)
            })
            return
          }

          // 場景2：富文本粘貼（無 File items，有 text/html）→ 讓 Quill 處理後掃描 base64 圖片
          const hasHtml = Array.from(items).some(
            (item) => item.kind === 'string' && item.type === 'text/html'
          )
          if (!hasHtml) return

          // 不阻止默認行為，讓 Quill 插入 HTML
          // 延遲掃描，等 Quill 完成 DOM 插入
          setTimeout(async () => {
            if (!quillRef.current) return
            const root = quillRef.current.root
            const base64Images = root.querySelectorAll<HTMLImageElement>(
              'img[src^="data:image/"]'
            )
            if (base64Images.length === 0) return

            // 將每個 base64 圖片轉為 File 對象
            const files: File[] = []
            const imgElements: HTMLImageElement[] = []
            for (let i = 0; i < base64Images.length; i++) {
              const img = base64Images[i]
              try {
                const resp = await fetch(img.src)
                const blob = await resp.blob()
                const ext = blob.type.split('/')[1] || 'png'
                const file = new File([blob], `paste_html_${Date.now()}_${i}.${ext}`, {
                  type: blob.type,
                })
                files.push(file)
                imgElements.push(img)
              } catch {
                // 單個轉換失敗跳過，不影響其他
              }
            }

            if (files.length === 0) return

            // 批量壓縮上傳
            const urls = await uploadImages(files)
            imgElements.forEach((img, i) => {
              if (urls[i]) {
                img.src = urls[i]!
              }
            })
          }, 50)
        }

        quill.root.addEventListener('paste', handlePaste)
        pasteHandler = handlePaste

        if (!cancelled) {
          setEditorReady(true)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '編輯器初始化失敗')
      }
    }

    // 延遲初始化，確保 DOM 就緒
    const timer = setTimeout(initEditor, 100)

    return () => {
      cancelled = true
      clearTimeout(timer)
      // 移除粘貼事件監聽
      if (quillRef.current && pasteHandler) {
        quillRef.current.root.removeEventListener('paste', pasteHandler)
      }
      if (editorRef.current) {
        editorRef.current.innerHTML = ''
      }
      quillRef.current = null
      setEditorReady(false)
    }
  }, [loading])

  /** 表單欄位更新 */
  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    dirtyRef.current = true
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /** 提交表單 */
  // ─── 修改字段比對（僅編輯模式） ───
  const FIELD_LABELS: Record<string, string> = {
    title: '標題', titlecolor: '標題顏色', scode: '欄目', content: '正文',
    keywords: '關鍵詞', description: '摘要', status: '狀態',
    istop: '置頂', isrecommend: '推薦', isheadline: '頭條',
    tags: '標籤', author: '作者', source: '來源',
    ico: '縮略圖', filename: 'Slug', outlink: '外鏈',
    subtitle: '副標題', date: '發布時間',
  }

  const getChangedFields = (): { changedCount: number; fields: string[] } => {
    if (!isEdit || !originalDataRef.current) return { changedCount: 0, fields: [] }
    const orig = originalDataRef.current
    // 獲取編輯器最新內容
    let currentContent = form.content
    if (quillRef.current) {
      currentContent = quillRef.current.root.innerHTML
    }
    const current: Record<string, unknown> = {
      ...form,
      content: currentContent,
      istop: form.istop ? '1' : '0',
      isrecommend: form.isrecommend ? '1' : '0',
      isheadline: form.isheadline ? '1' : '0',
      status: form.status,
    }
    const origNormalized: Record<string, unknown> = {
      ...orig,
      istop: (orig.istop as boolean) ? '1' : '0',
      isrecommend: (orig.isrecommend as boolean) ? '1' : '0',
      isheadline: (orig.isheadline as boolean) ? '1' : '0',
    }
    const changed: string[] = []
    for (const key of Object.keys(FIELD_LABELS)) {
      const oldVal = String(origNormalized[key] ?? '')
      const newVal = String(current[key] ?? '')
      if (oldVal !== newVal) {
        changed.push(FIELD_LABELS[key])
      }
    }
    // 比對自定義擴展字段（ext_*）
    const origExt = (orig.ext_fields as Record<string, string>) || {}
    for (const [field, value] of Object.entries(extValues)) {
      const oldVal = origExt[field] ?? ''
      const newVal = value ?? ''
      if (oldVal !== newVal) {
        changed.push('自定義字段')
        break // 只報告一次，避免多個 ext 字段佔滿提示
      }
    }
    return { changedCount: changed.length, fields: changed }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('請輸入標題')
      return
    }
    if (!form.scode) {
      setError('請選擇欄目')
      return
    }

    // 編輯模式：比對修改字段
    if (isEdit) {
      const changes = getChangedFields()
      if (changes.changedCount === 0) {
        setSaveHint({ changedCount: 0, fields: [] })
        // 無修改，不觸發後端
        return
      }
      setSaveHint(changes)
    }

    // 從編輯器獲取最新內容（清理 Quill 專有屬性，確保前端正確渲染）
    let content = form.content
    if (htmlMode && htmlSource) {
      content = cleanupQuillHtml(htmlSource)
    } else if (quillRef.current) {
      content = cleanupQuillHtml(quillRef.current.root.innerHTML)
    }

    setSaving(true)
    setError('')
    try {
      // 將 datetime-local 的 'YYYY-MM-DDTHH:MM' 轉回 'YYYY-MM-DD HH:MM:SS'
      const submitDate = form.date ? form.date.replace('T', ' ') + ':00' : ''
      const payload = {
        title: form.title.trim(),
        titlecolor: form.titlecolor,
        scode: form.scode,
        content,
        keywords: form.keywords,
        description: form.description,
        status: form.status === '2' ? '0' : form.status,
        istop: form.istop ? '1' : '0',
        isrecommend: form.isrecommend ? '1' : '0',
        isheadline: form.isheadline ? '1' : '0',
        tags: form.tags,
        author: form.author,
        source: form.source,
        ico: form.ico,
        filename: form.filename,
        outlink: form.outlink,
        subtitle: form.subtitle,
        date: submitDate,
        ext_fields: extValues,
      }
      if (isEdit) {
        await api.put(`/admin/contents/${id}`, payload)
        // 保存成功後更新原始快照（避免再次比對時報告剛保存的修改）
        originalDataRef.current = {
          ...payload,
          status: form.status, // 保留前端 UI 值（'2' 不轉換，與 form 一致）
          istop: payload.istop === '1',
          isrecommend: payload.isrecommend === '1',
          isheadline: payload.isheadline === '1',
          ext_fields: { ...extValues }, // 同步擴展字段快照
        }
        setSaveHint(null)
      } else {
        await api.post('/admin/contents', payload)
      }
      // 保存/發佈成功：重置修改狀態並清除 localStorage 草稿
      dirtyRef.current = false
      try {
        localStorage.removeItem(draftKeyOf(form.scode, id))
      } catch {
        /* 忽略 */
      }
      navigate('/contents')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl">
        <LoadingState text="載入中..." />
      </div>
    )
  }

  return (
    <div className={showPreview ? 'p-6' : 'p-6 max-w-5xl'}>
     <div className={showPreview ? 'flex gap-4' : ''}>
      <div className={showPreview ? 'flex-1 min-w-0 self-start' : ''}>
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/contents')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="text-base">⬅️</span>
          <span>返回</span>
        </button>
        <h1 className="text-2xl font-bold">{isEdit ? '編輯內容' : '新建內容'}</h1>
        </div>
        {/* 預覽開關（v1.9.62） */}
        <div className="flex items-center gap-2">
          {isEdit && id && (
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/api/v1/contents/${id}?status=0`
                navigator.clipboard.writeText(url).then(() => {
                  alert('已複製預覽連結到剪貼簿：\n' + url)
                })
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border bg-white border-input hover:bg-accent hover:border-gray-300 transition-all duration-200"
              title="複製草稿預覽連結（含 status=0 參數）"
            >
              <span>🔗</span>
              <span>預覽連結</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-all duration-200',
              showPreview
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-white border-input hover:bg-accent hover:border-gray-300',
            )}
            title={showPreview ? '切換回純編輯模式' : '開啟預覽面板，即時查看前台渲染效果'}
          >
            <span>{showPreview ? '✏️' : '👁️'}</span>
            <span>{showPreview ? '編輯模式' : '預覽'}</span>
          </button>
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 保存提示 — fixed 頂部中間，5秒自動隱藏 */}
      {saveHint && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg shadow-lg text-sm flex items-center gap-3 transition-opacity duration-300 ${
          saveHint.changedCount === 0
            ? 'bg-gray-800 text-white'
            : 'bg-blue-600 text-white'
        }`}>
          <span>
            {saveHint.changedCount === 0
              ? '✅ 此次無修改，未觸發保存'
              : `📝 此次修改了 ${saveHint.changedCount} 處：${saveHint.fields.join('、')}`}
          </span>
          <button
            onClick={() => setSaveHint(null)}
            className="text-white/70 hover:text-white"
          >✕</button>
        </div>
      )}

      {/* 草稿恢復提示 — 檢測到未提交的草稿時顯示 */}
      {draftPrompt && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm flex items-center gap-3 flex-wrap">
          <span className="text-base">💾</span>
          <div className="flex-1 min-w-0">
            <p>
              檢測到未保存的草稿
              {draftPrompt.title ? `：「${draftPrompt.title}」` : ''}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">保存時間：{draftPrompt.savedAt}</p>
          </div>
          <button
            type="button"
            onClick={restoreDraft}
            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-xs font-medium"
          >
            恢復草稿
          </button>
          <button
            type="button"
            onClick={discardDraft}
            className="px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors text-xs"
          >
            丟棄
          </button>
        </div>
      )}

      {/* 表單 */}
      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
        {/* Tab 切換 */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={cn(
              'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all duration-200',
              activeTab === 'basic'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
            )}
          >
            基本內容
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('advanced')}
            className={cn(
              'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all duration-200',
              activeTab === 'advanced'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
            )}
          >
            高級內容
          </button>
        </div>

        {/* 基本內容 Tab（用 CSS display 切換，避免編輯器 DOM 被卸載導致內容丟失） */}
        <div style={{ display: activeTab === 'basic' ? 'block' : 'none' }}>
          <>
            {/* 標題 */}
            <div>
              <label className={DS.label}>
                標題 <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className={DS.input + ' flex-1'}
                  placeholder="請輸入內容標題"
                  required
                />
                {/* 標題顏色選擇器 */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-xs text-muted-foreground">標題字色</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={form.titlecolor || '#333333'}
                      onChange={(e) => updateField('titlecolor', e.target.value)}
                      className="w-10 h-10 rounded-lg border border-input cursor-pointer p-0.5 bg-transparent transition-all duration-200 hover:border-gray-300"
                      title="標題顏色"
                    />
                    {form.titlecolor && (
                      <button
                        type="button"
                        onClick={() => updateField('titlecolor', '')}
                        className="text-xs text-muted-foreground hover:text-destructive"
                        title="清除顏色"
                      >
                        ❌
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 欄目 + 狀態 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={DS.label}>
                  欄目 <span className="text-destructive">*</span>
                </label>
                <select
                  value={form.scode}
                  onChange={(e) => updateField('scode', e.target.value)}
                  className={DS.select}
                  required
                >
                  <option value="">請選擇欄目</option>
                  {renderCategoryOptions(categories)}
                </select>
              </div>
              <div>
                <label className={DS.label}>狀態</label>
                <select
                  value={form.status}
                  onChange={(e) => {
                    const newStatus = e.target.value as ContentStatus
                    updateField('status', newStatus)
                    if (newStatus === '2') updateField('date', '')
                  }}
                  className={DS.select}
                >
                  <option value="1">已發布</option>
                  <option value="0">草稿（待發佈）</option>
                  <option value="2">草稿（不發佈）</option>
                </select>
              </div>
            </div>

            {/* Slug + 發佈時間 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={DS.label}>Slug (URL別名)</label>
                <input
                  type="text"
                  value={form.filename}
                  onChange={(e) => updateField('filename', e.target.value)}
                  className={DS.input}
                  placeholder="URL別名，留空則用ID"
                  pattern="[-a-zA-Z0-9_/]+"
                />
              </div>
              <div>
                <label className={DS.label}>發佈時間</label>
                <input
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) => updateField('date', e.target.value)}
                  className={DS.input}
                  disabled={form.status === '2'}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {form.status === '2' ? '🔒 草稿（不發佈）模式，日期已禁用' : '設置未來時間可實現定時發布'}
                </p>
              </div>
            </div>

            {/* 內容 - Quill 編輯器 */}
            <div>
              <label className={DS.label}>
                內容 {!editorReady && <span className="text-xs text-muted-foreground">（編輯器載入中...）</span>}
                {htmlMode && (
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    📝 HTML 源碼模式
                    <button
                      type="button"
                      onClick={() => {
                        // 將 HTML 源碼寫回編輯器
                        if (quillRef.current && htmlSource !== '') {
                          quillRef.current.clipboard.dangerouslyPasteHTML(htmlSource)
                        }
                        setHtmlMode(false)
                      }}
                      className="ml-2 underline hover:no-underline"
                    >返回編輯器</button>
                  </span>
                )}
              </label>
              {/* 編輯器與 HTML 源碼 textarea 都保持掛載，用 CSS 切換顯示 */}
              {/* 避免 htmlMode 切換時 Quill DOM 被卸載導致編輯器消失 */}
              <div ref={editorRef} className={`border border-input rounded-lg ${htmlMode ? 'hidden' : ''}`} />
              <textarea
                value={htmlSource}
                onChange={(e) => {
                  dirtyRef.current = true
                  setHtmlSource(e.target.value)
                }}
                className={`w-full h-96 px-4 py-2.5 border border-input rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring focus:bg-white transition-all duration-200 ${htmlMode ? '' : 'hidden'}`}
                placeholder="<p>HTML 源碼...</p>"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                💡 有序列表中按
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono border">Shift</kbd>
                +
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono border">Enter</kbd>
                可在同一序號內換行，實現「標題+縮進內容」排版；按
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono border">Enter</kbd>
                創建下一個序號
              </p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />
            </div>

            {/* 標籤（TagInput 組件 + AI 建議 + 歷史標籤快速補充） */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={DS.label + ' mb-0'}>標籤</label>
                <button
                  type="button"
                  onClick={async () => {
                    setAiTagLoading(true)
                    try {
                      const res = await api.post<string[]>('/admin/contents/ai-tags', {
                        title: form.title,
                        content: form.content,
                      })
                      const suggestions = (res.data as string[]) || []
                      if (suggestions.length > 0) {
                        const current = form.tags ? form.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : []
                        const merged = [...new Set([...current, ...suggestions])]
                        updateField('tags', merged.join(','))
                      }
                    } catch { /* 靜默失敗 */ }
                    finally { setAiTagLoading(false) }
                  }}
                  disabled={aiTagLoading || (!form.title && !form.content)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-purple-600 border border-purple-200 rounded-full hover:bg-purple-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="基於文章標題和內容，AI 自動建議標籤"
                >
                  {aiTagLoading ? (
                    <>
                      <span className="inline-block animate-spin">🔄</span>
                      AI 生成中...
                    </>
                  ) : (
                    <>🤖 AI 標籤建議</>
                  )}
                </button>
              </div>
              <TagInput
                values={form.tags ? form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean) : []}
                onChange={(tags) => updateField('tags', tags.join(','))}
                placeholder="輸入標籤後按 Enter 添加"
                hideBulk
              />
              {allTags.length > 0 && (
                <div className="mt-2 flex items-center gap-2 flex-nowrap overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setShowBulkTags(!showBulkTags)}
                    className="shrink-0 text-xs text-muted-foreground hover:text-primary transition-colors whitespace-nowrap"
                  >
                    {showBulkTags ? '收起' : '📋 批量導入'}
                  </button>
                  <span className="text-xs text-muted-foreground shrink-0">📋 歷史標籤</span>
                  {allTags
                    .filter((t) => {
                      const current = form.tags ? form.tags.split(/[,，]/).map((s) => s.trim()) : []
                      return !current.includes(t)
                    })
                    .slice(0, 30)
                    .map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const current = form.tags ? form.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : []
                          if (!current.includes(tag)) {
                            updateField('tags', [...current, tag].join(','))
                          }
                        }}
                        className="shrink-0 px-2 py-0.5 text-xs border border-border text-muted-foreground rounded-full hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors whitespace-nowrap"
                      >
                        {tag}
                      </button>
                    ))}
                </div>
              )}
              {showBulkTags && (
                <div className="mt-1.5">
                  <textarea
                    value={bulkTagsText}
                    onChange={(e) => setBulkTagsText(e.target.value)}
                    placeholder="每行一個或用逗號分隔，批量添加標籤..."
                    className={DS.textarea}
                    rows={3}
                  />
                  <div className="flex justify-end gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => { setBulkTagsText(''); setShowBulkTags(false) }}
                      className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const lines = bulkTagsText.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)
                        const current = form.tags ? form.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : []
                        const merged = [...new Set([...current, ...lines])]
                        updateField('tags', merged.join(','))
                        setBulkTagsText('')
                        setShowBulkTags(false)
                      }}
                      className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
                    >
                      添加全部
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 作者、來源 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={DS.label}>作者</label>
                <input
                  type="text"
                  value={form.author}
                  onChange={(e) => updateField('author', e.target.value)}
                  className={DS.input}
                  placeholder="請輸入作者"
                />
              </div>
              <div>
                <label className={DS.label}>來源</label>
                <input
                  type="text"
                  value={form.source}
                  onChange={(e) => updateField('source', e.target.value)}
                  className={DS.input}
                  placeholder="請輸入來源"
                />
              </div>
            </div>

            {/* 縮略圖 */}
            <div>
              <label className={DS.label}>縮略圖</label>
              <div className="space-y-2">
                {form.ico && (
                  <ImagePreviewWithRemove
                    src={form.ico}
                    alt="縮略圖"
                    onRemove={() => updateField('ico', '')}
                    containerClassName="border border-input rounded-lg"
                    imgClassName="w-32 h-32"
                  />
                )}
                <input
                  ref={icoFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleIcoUpload}
                />
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    value={icoUrlInput || form.ico}
                    onChange={(e) => setIcoUrlInput(e.target.value)}
                    placeholder="輸入圖片外鏈 URL"
                    className={DS.urlInput}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (icoUrlInput.trim()) {
                        updateField('ico', icoUrlInput.trim())
                        setIcoUrlInput('')
                      }
                    }}
                    className={DS.btnSm}
                  >
                    <span className="text-base">🔗</span>
                    <span>確認</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => icoFileRef.current?.click()}
                    disabled={icoUploading}
                    className={DS.btnSm + ' disabled:opacity-50'}
                  >
                    {icoUploading ? (
                      <span className="inline-block animate-spin">🔄</span>
                    ) : (
                      <span className="text-base">🖼️</span>
                    )}
                    <span>{icoUploading ? '上傳中...' : form.ico ? '更換縮略圖' : '上傳縮略圖'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIcoMediaPickerOpen(true)}
                    className={DS.btnSm}
                  >
                    <span className="text-base">🖼️</span>
                    <span>媒體庫</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 選項 — uiverse.io 風格卡片式 Checkbox */}
            <div className="flex flex-wrap items-center gap-3 p-4 mt-4 bg-gray-50/50 rounded-lg border border-gray-100">
              <label className="relative inline-flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={form.istop}
                  onChange={(e) => updateField('istop', e.target.checked)}
                  className="peer absolute opacity-0 inset-0 cursor-pointer"
                />
                <span className="flex items-center justify-center w-5 h-5 rounded-md border-2 border-input bg-white transition-all duration-200 group-hover:border-blue-400 peer-checked:bg-blue-500 peer-checked:border-blue-500 peer-checked:shadow-sm peer-checked:shadow-blue-500/30">
                  {form.istop && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-foreground/80 group-hover:text-blue-600 transition-colors">置頂</span>
              </label>
              <label className="relative inline-flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={form.isrecommend}
                  onChange={(e) => updateField('isrecommend', e.target.checked)}
                  className="peer absolute opacity-0 inset-0 cursor-pointer"
                />
                <span className="flex items-center justify-center w-5 h-5 rounded-md border-2 border-input bg-white transition-all duration-200 group-hover:border-emerald-400 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 peer-checked:shadow-sm peer-checked:shadow-emerald-500/30">
                  {form.isrecommend && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-foreground/80 group-hover:text-emerald-600 transition-colors">推薦</span>
              </label>
              <label className="relative inline-flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={form.isheadline}
                  onChange={(e) => updateField('isheadline', e.target.checked)}
                  className="peer absolute opacity-0 inset-0 cursor-pointer"
                />
                <span className="flex items-center justify-center w-5 h-5 rounded-md border-2 border-input bg-white transition-all duration-200 group-hover:border-amber-400 peer-checked:bg-amber-500 peer-checked:border-amber-500 peer-checked:shadow-sm peer-checked:shadow-amber-500/30">
                  {form.isheadline && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-foreground/80 group-hover:text-amber-600 transition-colors">頭條</span>
              </label>
            </div>

            {/* 自定義字段（擴展欄位） */}
            <div className="pt-2 border-t border-gray-100">
              <h3 className="text-sm font-semibold mb-3 pt-3 text-foreground">自定義字段</h3>
              {extLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <span className="inline-block animate-spin">🔄</span>
                  載入自定義字段中...
                </div>
              ) : extFields.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  {form.scode ? '此欄目沒有自定義字段' : '請先選擇欄目'}
                </p>
              ) : (
                <div className="space-y-4">
                  {extFields.map((field) => (
                    <div key={field.id}>
                      <label className={DS.label}>
                        {field.name}
                        {field.required === '1' && <span className="text-destructive"> *</span>}
                        <span className={DS.labelHint}>
                          ({EXT_TYPE_LABELS[field.type] ?? '自定義'})
                        </span>
                      </label>
                      <ExtFieldInput
                        field={field}
                        value={extValues[field.field] ?? ''}
                        onChange={(val) => updateExtValue(field.field, val)}
                        uploadFile={uploadImage}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        </div>

        {/* 高級內容 Tab */}
        <div style={{ display: activeTab === 'advanced' ? 'block' : 'none' }}>
          <>
            {/* 副標題 */}
            <div>
              <label className={DS.label}>副標題</label>
              <input
                type="text"
                value={form.subtitle}
                onChange={(e) => updateField('subtitle', e.target.value)}
                className={DS.input}
                placeholder="請輸入副標題"
              />
            </div>

            {/* 外鏈 */}
            <div>
              <label className={DS.label}>外鏈</label>
              <input
                type="text"
                value={form.outlink}
                onChange={(e) => updateField('outlink', e.target.value)}
                className={DS.input}
                placeholder="跳轉外鏈接，設置後內容變為外鏈類型"
              />
            </div>

            {/* 關鍵字 */}
            <div>
              <label className={DS.label}>關鍵字</label>
              <input
                type="text"
                value={form.keywords}
                onChange={(e) => updateField('keywords', e.target.value)}
                className={DS.input}
                placeholder="多個關鍵字以逗號分隔"
              />
            </div>

            {/* 描述 */}
            <div>
              <label className={DS.label}>描述</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
                className={DS.textarea}
                placeholder="SEO 描述..."
              />
            </div>
          </>
        </div>

        {/* 操作按鈕 */}
        <div className="flex items-center gap-3 pt-5 border-t border-gray-100">
          <button
            type="submit"
            disabled={saving}
            className={cn(
              'inline-flex items-center gap-1.5 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg',
              'hover:opacity-90 hover:shadow-md transition-all duration-200 text-sm font-medium',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <span className="text-base">💾</span>
            <span>{saving ? '保存中...' : '保存'}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/contents')}
            className="px-6 py-2.5 border border-input rounded-lg hover:bg-accent hover:border-gray-300 transition-all duration-200 text-sm font-medium"
          >
            取消
          </button>
        </div>
      </form>
      </div>{/* 左側編輯區結束 */}

      {/* 右側預覽面板（v1.9.62，v1.9.67 Shadow DOM 取代 iframe） */}
      {showPreview && (
        <div className="flex-1 min-w-0">
          <div className="sticky top-6 h-[calc(100vh-3rem)] flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1 shrink-0">
              <span className="text-sm font-medium text-muted-foreground">
                👁️ 前台預覽
                <span className="ml-2 text-xs text-muted-foreground/70">滾動同步 · 每 1.5 秒更新</span>
              </span>
              <span className="text-xs text-muted-foreground">{previewCss ? '🎨 已載入站點 CSS' : '⚠️ 未配置 CSS'}</span>
            </div>
            <div
              ref={previewRef}
              className="flex-1 w-full border border-gray-200 rounded-xl bg-white shadow-sm overflow-y-auto"
            />
          </div>
        </div>
      )}
     </div>{/* flex 佈局結束 */}

      {/* 媒體庫選擇器 - 縮略圖 */}
      <MediaPickerModal
        open={icoMediaPickerOpen}
        onClose={() => setIcoMediaPickerOpen(false)}
        onSelect={(url) => updateField('ico', url)}
        onUpload={uploadImages}
      />

      {/* 媒體庫選擇器 - Quill 編輯器圖片插入 */}
      <MediaPickerModal
        open={quillImagePicker}
        onClose={() => setQuillImagePicker(false)}
        onUpload={uploadImages}
        onSelect={(url) => {
          if (quillRef.current) {
            const range = quillRef.current.getSelection()
            const index = range ? range.index : 0
            quillRef.current.insertEmbed(index, 'image', url)
          }
        }}
      />

      {/* Quill 編輯器視頻插入器 */}
      <VideoPickerModal
        open={quillVideoPicker}
        onClose={() => setQuillVideoPicker(false)}
        onInsert={(html) => {
          if (quillRef.current) {
            const range = quillRef.current.getSelection(true) ?? quillRef.current.getSelection()
            const index = Number(range?.index ?? quillRef.current.getLength())
            ;(quillRef.current.clipboard as unknown as {
              dangerouslyPasteHTML: (index: number, html: string, source: string) => void
            }).dangerouslyPasteHTML(index, html, 'user')
          }
        }}
      />

      {/* Quill 編輯器 FAQ 問答插入器（支援新增 + 編輯模式） */}
      <FaqPickerModal
        open={quillFaqPicker}
        onClose={() => {
          setQuillFaqPicker(false)
          setFaqEditIndex(null)
          setFaqEditPairs([])
        }}
        mode={faqEditIndex !== null ? 'edit' : 'insert'}
        initialPairs={faqEditIndex !== null ? faqEditPairs : undefined}
        onInsert={(html) => {
          if (!quillRef.current) return
          if (faqEditIndex !== null) {
            // 編輯模式：刪除舊 FAQ 塊（BlockEmbed 佔 1 字元），在原位置插入新內容
            quillRef.current.deleteText(faqEditIndex, 1)
            ;(quillRef.current.clipboard as unknown as {
              dangerouslyPasteHTML: (index: number, html: string, source: string) => void
            }).dangerouslyPasteHTML(faqEditIndex, html, 'user')
          } else {
            // 新增模式：在游標位置插入
            const range = quillRef.current.getSelection(true) ?? quillRef.current.getSelection()
            const index = Number(range?.index ?? quillRef.current.getLength())
            ;(quillRef.current.clipboard as unknown as {
              dangerouslyPasteHTML: (index: number, html: string, source: string) => void
            }).dangerouslyPasteHTML(index, html, 'user')
          }
          setFaqEditIndex(null)
          setFaqEditPairs([])
        }}
      />

      {/* ─── 圖片壓縮對話框（所有圖片上傳統一使用，支持批量） ─── */}
      {pendingImageUpload && (
        <ImageCompressDialog
          files={pendingImageUpload.files}
          onConfirm={handleImageCompressConfirm}
          onCancel={handleImageCompressCancel}
        />
      )}

      {/* ─── 上傳進度 + 錯誤（屏幕居中覆蓋層，統一組件） ─── */}
      <UploadProgressOverlay
        uploading={imgUploading}
        progress={imgProgress}
        error={imgUploadError}
        onClearError={clearImgError}
      />
    </div>
  )
}
