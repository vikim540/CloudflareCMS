/**
 * Quill HTML 清理工具
 *
 * 功能：清理 Quill 專有 HTML 屬性，確保輸出標準 HTML 可在任何前端正確渲染
 *
 * 移除：
 * - data-list="ordered"/"bullet" 屬性（Quill 用於內部列表類型識別，外部不需要）
 * - <span class="ql-ui" contenteditable="false"></span> 空標記元素（Quill 用 CSS 渲染序號，外部 CSS 不存在時為空）
 * - contenteditable="false" 屬性（Quill 內部編輯控制用）
 *
 * 保留：
 * - <ol>/<ul>/<li> 標準結構（瀏覽器原生渲染序號/符號）
 * - <strong>/<a>/<img> 等富文本標籤
 * - <details>/<summary> FAQ 塊（含 microdata 屬性）
 * - <iframe> 視頻嵌入
 *
 * 應用時機：保存文章時（從編輯器取 HTML 後、發送 API 前）
 *
 * 可移植性：與編輯器無關，適用於任何包含 Quill 屬性的 HTML
 */

/**
 * 清理 Quill 專有 HTML 屬性
 * @param html 原始 Quill HTML
 * @returns 清理後的標準 HTML
 */
export function cleanupQuillHtml(html: string): string {
  if (!html) return ''
  return html
    // 移除 Quill data-list 屬性（ordered/bullet/check）
    .replace(/\s+data-list="[^"]*"/gi, '')
    // 移除 Quill 的 ql-ui 空標記 span（列表序號佔位元素，無內容）
    .replace(/<span\s+class="ql-ui"[^>]*>\s*<\/span>/gi, '')
    // 移除 contenteditable="false" 屬性（Quill 內部控制，外部不需要）
    .replace(/\s+contenteditable="false"/gi, '')
}

/** 註冊 Quill 靠左對齊類名支援（生成 .ql-align-left，壓制前台預設 justify） */
export function registerAlignLeft(): void {
  const w = window as unknown as { Quill?: { import: (path: string) => unknown } }
  if (!w.Quill) return
  const Align = w.Quill.import('attributors/class/align') as { whitelist?: string[] }
  if (Align?.whitelist && !Align.whitelist.includes('left')) Align.whitelist.unshift('left')
  const icons = w.Quill.import('ui/icons') as Record<string, Record<string, string>>
  if (icons?.align && !icons.align['left']) icons.align['left'] = icons.align['']
}


/** 工具列按鈕 CSS（自定義按鈕圖標） */
export const toolbarButtonCSS = `
  /* HTML 源碼按鈕 + FAQ 按鈕 + 視頻按鈕 */
  .ql-toolbar .ql-video-picker::after { content: "🎥"; font-size: 14px; }
  .ql-toolbar .ql-html-source::after { content: "<>"; font-family: monospace; font-size: 14px; }
  .ql-toolbar .ql-faq-picker::after { content: "❓"; font-size: 14px; }
  /* 靠左對齊類名樣式，壓制業務前台 text-align: justify */
  .ql-editor .ql-align-left, .ql-align-left { text-align: left !important; }
  /* 官方字號支援（Small 小字號 0.75em 適合參考文獻與 URL 來源） */
  .ql-editor .ql-size-small, .ql-size-small { font-size: 0.75em !important; }
  .ql-editor .ql-size-large, .ql-size-large { font-size: 1.5em !important; }
  .ql-editor .ql-size-huge, .ql-size-huge { font-size: 2.5em !important; }
  /* 標題與字號下拉選單中文自定義 */
  .ql-snow .ql-picker.ql-header { width: 106px !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-label::before { content: '標題' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-label[data-value="1"]::before { content: '標題 1 (H1)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-label[data-value="2"]::before { content: '標題 2 (H2)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-label[data-value="3"]::before { content: '標題 3 (H3)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-label[data-value="4"]::before { content: '標題 4 (H4)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-label[data-value="5"]::before { content: '標題 5 (H5)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-label[data-value="6"]::before { content: '標題 6 (H6)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-options { min-width: 130px !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-item::before { content: '正文 (預設)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-item[data-value="1"]::before { content: '標題 1 (H1)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-item[data-value="2"]::before { content: '標題 2 (H2)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-item[data-value="3"]::before { content: '標題 3 (H3)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-item[data-value="4"]::before { content: '標題 4 (H4)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-item[data-value="5"]::before { content: '標題 5 (H5)' !important; }
  .ql-snow .ql-picker.ql-header .ql-picker-item[data-value="6"]::before { content: '標題 6 (H6)' !important; }
  .ql-snow .ql-picker.ql-size { width: 96px !important; }
  .ql-snow .ql-picker.ql-size .ql-picker-label::before { content: '字號' !important; }
  .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="small"]::before { content: '小字號' !important; }
  .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="large"]::before { content: '大字號' !important; }
  .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="huge"]::before { content: '特大' !important; }
  .ql-snow .ql-picker.ql-size .ql-picker-options { min-width: 140px !important; }
  .ql-snow .ql-picker.ql-size .ql-picker-item::before { content: '標準字號 (預設)' !important; }
  .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="small"]::before { content: '小字號 (Small)' !important; }
  .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="large"]::before { content: '大字號 (Large)' !important; }
  .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="huge"]::before { content: '特大字號 (Huge)' !important; }
`
