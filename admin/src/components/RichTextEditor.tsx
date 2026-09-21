import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react'
import { registerFaqPlugin, matchFaqElement, faqPluginCSS } from '../lib/quill/faqPlugin'
import { registerVideoPlugin, matchVideoIframe } from '../lib/quill/videoPlugin'
import { registerListPlugin, listPluginCSS } from '../lib/quill/listPlugin'
import { toolbarButtonCSS } from '../lib/quill/htmlCleanup'

const QUILL_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/quill/2.0.2/quill.min.js'
const QUILL_CSS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/quill/2.0.2/quill.snow.min.css'
const QUILL_FALLBACK_JS_URL = 'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.min.js'
const QUILL_FALLBACK_CSS_URL = 'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.min.css'

/** Quill 實例方法聲明 */
export interface QuillInstance {
  root: HTMLDivElement
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

// 全局 Window.Quill 由項目全局聲明統一管理

let quillLoaded = false
let quillLoading: Promise<void> | null = null

/** 全局單例非同步載入 Quill 腳本與樣式（含 CDN 容災回退） */
export function loadQuill(): Promise<void> {
  if (window.Quill) {
    quillLoaded = true
    return Promise.resolve()
  }
  if (quillLoading) return quillLoading

  quillLoading = new Promise<void>((resolve, reject) => {
    // 載入 CSS
    const loadCss = (href: string, isFallback = false) => {
      let link = document.querySelector(`link[data-quill-css]`) as HTMLLinkElement | null
      if (link && isFallback) {
        link.remove()
        link = null
      }
      if (!link) {
        link = document.createElement('link')
        link.rel = 'stylesheet'
        link.setAttribute('data-quill-css', 'true')
        link.href = href
        link.onerror = () => {
          if (!isFallback) loadCss(QUILL_FALLBACK_CSS_URL, true)
        }
        document.head.appendChild(link)
      }
    }
    loadCss(QUILL_CSS_URL)

    // 載入 JS（主 CDN 失敗時自動切換 jsdelivr 備用 CDN）
    const loadScript = (src: string, isFallback = false) => {
      let script = document.getElementById('quill-script') as HTMLScriptElement | null
      if (script && isFallback) {
        script.remove()
        script = null
      }
      if (!script) {
        script = document.createElement('script')
        script.id = 'quill-script'
        script.src = src
        script.async = true
        document.head.appendChild(script)
      }

      script.onload = () => {
        quillLoaded = true
        quillLoading = null
        resolve()
      }
      script.onerror = () => {
        if (!isFallback) {
          console.warn('Quill 主 CDN (cdnjs) 載入失敗，切換 jsdelivr 備用 CDN...')
          loadScript(QUILL_FALLBACK_JS_URL, true)
        } else {
          quillLoading = null
          reject(new Error('Quill 腳本載入失敗（主備 CDN 皆不可用）'))
        }
      }
    }
    loadScript(QUILL_JS_URL)

    // 輪詢兜底
    let attempts = 0
    const poll = setInterval(() => {
      attempts++
      if (window.Quill) {
        clearInterval(poll)
        quillLoaded = true
        quillLoading = null
        resolve()
      } else if (attempts >= 60) {
        clearInterval(poll)
        quillLoading = null
        reject(new Error('Quill 載入超時'))
      }
    }, 100)
  })

  return quillLoading
}

/** 富文本編輯器暴露給父組件的控制器 */
export interface RichTextEditorRef {
  /** 插入圖片 URL */
  insertImage: (url: string) => void
  /** 插入嵌入項（如 video/faq） */
  insertEmbed: (type: string, value: string | Record<string, string>) => void
  /** 設置/替換當前富文本 HTML */
  setHtml: (html: string) => void
  /** 獲取底層 Quill 實例 */
  getQuill: () => QuillInstance | null
}

export interface RichTextEditorProps {
  /** HTML 內容雙向綁定值 */
  value: string
  /** 內容變更回調 */
  onChange: (html: string) => void
  /** 預設佔位提示符 */
  placeholder?: string
  /** 最小高度 class (預設 min-h-[220px]) */
  minHeightClass?: string
  /** 點擊圖片按鈕時打開媒體庫選擇器 */
  onOpenMediaPicker?: () => void
  /** 點擊視頻按鈕時打開視頻選擇器 */
  onOpenVideoPicker?: () => void
  /** 點擊 FAQ 按鈕時打開 FAQ 選擇器 */
  onOpenFaqPicker?: () => void
  /** 容器樣式 */
  className?: string
  /** 是否唯讀/禁用 */
  disabled?: boolean
}

/**
 * 通用 Quill 2.0 富文本編輯器公共組件
 * 包含：
 * 1. 完整工具列與中文 Tooltip
 * 2. FAQ、視頻、有序列表縮進三合一插件
 * 3. 📝 HTML 源碼模式切換（保持 DOM 掛載防白屏，支援無縫切換還原）
 * 4. 媒體庫圖片選擇器聯動
 */
export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  function RichTextEditor(
    {
      value,
      onChange,
      placeholder = '請在此輸入內容...',
      minHeightClass = 'min-h-[220px]',
      onOpenMediaPicker,
      onOpenVideoPicker,
      onOpenFaqPicker,
      className = '',
      disabled = false,
    },
    ref
  ) {
    const editorRef = useRef<HTMLDivElement>(null)
    const quillRef = useRef<QuillInstance | null>(null)
    const [htmlMode, setHtmlMode] = useState(false)
    const [htmlSource, setHtmlSource] = useState('')
    const isUpdatingFromQuill = useRef(false)

    // 對外暴露控制器
    useImperativeHandle(
      ref,
      () => ({
        insertImage: (url: string) => {
          if (!quillRef.current) return
          const range = quillRef.current.getSelection()
          const insertIndex = range ? range.index : (quillRef.current.getLength() || 0) - 1
          quillRef.current.insertEmbed(insertIndex, 'image', url)
          const newHtml = quillRef.current.root.innerHTML
          onChange(newHtml)
        },
        insertEmbed: (type: string, embedValue: string | Record<string, string>) => {
          if (!quillRef.current) return
          const range = quillRef.current.getSelection()
          const insertIndex = range ? range.index : (quillRef.current.getLength() || 0) - 1
          quillRef.current.insertEmbed(insertIndex, type, embedValue)
          const newHtml = quillRef.current.root.innerHTML
          onChange(newHtml)
        },
        setHtml: (html: string) => {
          if (!quillRef.current) return
          quillRef.current.clipboard.dangerouslyPasteHTML(html)
          setHtmlSource(html)
        },
        getQuill: () => quillRef.current,
      }),
      [onChange]
    )

    // 切換回編輯器模式
    const handleReturnToEditor = useCallback(() => {
      if (quillRef.current && htmlSource !== '') {
        quillRef.current.clipboard.dangerouslyPasteHTML(htmlSource)
        onChange(htmlSource)
      }
      setHtmlMode(false)
    }, [htmlSource, onChange])

    // 初始化 Quill
    useEffect(() => {
      let cancelled = false

      const init = async () => {
        try {
          await loadQuill()
          if (cancelled || !window.Quill || !editorRef.current) return

          // 若已有舊實例，先清空容器重新掛載
          if (quillRef.current) {
            editorRef.current.innerHTML = ''
          }

          const editorContainer = document.createElement('div')
          editorRef.current.appendChild(editorContainer)

          const quill = new window.Quill(editorContainer, {
            theme: 'snow',
            readOnly: disabled,
            placeholder,
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
                    if (onOpenMediaPicker) {
                      onOpenMediaPicker()
                    }
                  },
                  'video-picker': function () {
                    if (onOpenVideoPicker) {
                      onOpenVideoPicker()
                    }
                  },
                  'faq-picker': function () {
                    if (onOpenFaqPicker) {
                      onOpenFaqPicker()
                    }
                  },
                  'html-source': function () {
                    if (!htmlMode && quillRef.current) {
                      setHtmlSource(quillRef.current.root.innerHTML)
                    }
                    setHtmlMode((prev) => !prev)
                  },
                },
              },
              clipboard: { matchVisual: false },
            },
          })

          quillRef.current = quill as unknown as QuillInstance

          // 註冊擴展插件
          registerFaqPlugin()
          registerVideoPlugin()
          registerListPlugin()

          // 註冊剪貼簿匹配器
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

          // 注入專用樣式
          const styleEl = document.createElement('style')
          styleEl.textContent = listPluginCSS + faqPluginCSS + toolbarButtonCSS
          editorContainer.appendChild(styleEl)

          // 設置工具列按鈕 Tooltip 提示
          const htmlBtn = editorContainer.querySelector('.ql-html-source')
          if (htmlBtn) htmlBtn.setAttribute('title', 'HTML 源碼模式')
          const videoBtn = editorContainer.querySelector('.ql-video-picker')
          if (videoBtn) videoBtn.setAttribute('title', '插入視頻')
          const faqBtn = editorContainer.querySelector('.ql-faq-picker')
          if (faqBtn) faqBtn.setAttribute('title', '插入 FAQ 問答（SEO 結構化數據）')

          // 初始化內容填入
          if (value) {
            quill.clipboard.dangerouslyPasteHTML(value)
            setHtmlSource(value)
          }

          // 監聽內容變更
          quill.on('text-change', () => {
            if (quillRef.current) {
              isUpdatingFromQuill.current = true
              const newHtml = quillRef.current.root.innerHTML
              setHtmlSource(newHtml)
              onChange(newHtml)
              setTimeout(() => {
                isUpdatingFromQuill.current = false
              }, 0)
            }
          })
        } catch (e) {
          console.error('富文本編輯器初始化失敗:', e)
        }
      }

      init()

      return () => {
        cancelled = true
        if (editorRef.current) editorRef.current.innerHTML = ''
        quillRef.current = null
      }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // 當外部 value 發生非編輯引起的變化時（如載入單頁詳情完成），同步入 Quill
    useEffect(() => {
      if (isUpdatingFromQuill.current) return
      if (!quillRef.current) return

      const currentInner = quillRef.current.root.innerHTML
      if (value !== undefined && value !== currentInner) {
        quillRef.current.clipboard.dangerouslyPasteHTML(value || '')
        setHtmlSource(value || '')
      }
    }, [value])

    return (
      <div className={`space-y-1.5 ${className}`}>
        {/* HTML 源碼模式提示條 */}
        {htmlMode && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <span>📝</span>
              <span>當前處於 HTML 源碼編輯模式</span>
            </span>
            <button
              type="button"
              onClick={handleReturnToEditor}
              className="px-2.5 py-1 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition-colors shadow-xs"
            >
              返回可視化編輯器
            </button>
          </div>
        )}

        {/* 編輯器容器（保持掛載，切換時僅 CSS 隱藏，防止 DOM 與 Quill 實例脫節） */}
        <div
          ref={editorRef}
          className={`rounded-xl overflow-hidden border border-input shadow-sm ${minHeightClass} ${
            htmlMode ? 'hidden' : 'block'
          }`}
        />

        {/* HTML 源碼文本輸入域 */}
        <textarea
          value={htmlSource}
          onChange={(e) => {
            const val = e.target.value
            setHtmlSource(val)
            onChange(val)
          }}
          rows={12}
          className={`w-full px-4 py-3 font-mono text-xs bg-slate-900 text-slate-100 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-ring ${
            htmlMode ? 'block' : 'hidden'
          }`}
          placeholder="在此直接編寫/修改 HTML 源碼..."
          spellCheck={false}
        />
      </div>
    )
  }
)

export default RichTextEditor
