/**
 * HTML 淨化工具（輕量級純函數，無需 DOM 依賴）
 *
 * 用於文章正文等富文本字段，防禦 XSS 攻擊：
 * - 移除 <script> 標籤及內容
 * - 移除危險標籤（object/embed/applet/base/form 等）
 * - iframe 單獨白名單驗證（僅允許 YouTube 嵌入域名）
 * - 移除事件處理屬性（onclick/onload/onerror 等）
 * - 移除 javascript: 協議
 * - 移除 data:text/html 協議（保留 data:image/*）
 *
 * 設計原則：白名單優先，保留正常富文本標籤（p/h1-6/img/a/table/iframe/video/details 等）
 */

/** 移除 <script> 標籤及其內容（含變體大小寫、屬性） */
const SCRIPT_TAG_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi;

/** 移除危險標籤（不含 iframe，iframe 單獨白名單驗證；video/details/summary 保留） */
const DANGEROUS_TAGS = /<\/?(object|embed|applet|base|form|input|textarea|select|button|meta|link|style)\b[^>]*>/gi;

/** 移除所有 on* 事件處理屬性（onclick/onload/onerror 等）
 *  注意：HTML 允許 / 作屬性分隔符（如 <img/onerror=alert(1)>），不能用 \s+ 限定 */
const EVENT_HANDLER_ATTRS = /[\s/"]+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/** 移除 javascript: 協議的 href/src */
const JS_PROTOCOL_PATTERN = /(\b(?:href|src)\s*=\s*)("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi;

/** 移除 data:text/html 等危險 data 協議（保留 data:image/* 圖片） */
const DANGEROUS_DATA_PATTERN = /(\b(?:href|src)\s*=\s*)("data:(?!image\/)[^"]*"|'data:(?!image\/)[^']*')/gi;

/** iframe src 白名單（僅允許 YouTube 嵌入域名） */
const ALLOWED_IFRAME_DOMAINS = /(?:https?:)?\/\/(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)\//i;

/**
 * 淨化 iframe 標籤的 src 屬性
 * 僅允許 YouTube 嵌入域名（youtube.com / youtube-nocookie.com）
 * 非白名單域名的 iframe src 替換為 #（保留標籤結構，阻斷惡意嵌入）
 */
function sanitizeIframeSrc(html: string): string {
  return html.replace(/<iframe\b([^>]*?)>/gi, (match, attrs: string) => {
    const srcMatch = attrs.match(/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i);
    if (srcMatch) {
      const srcValue = srcMatch[1].replace(/^["']|["']$/g, '');
      if (!ALLOWED_IFRAME_DOMAINS.test(srcValue)) {
        return match.replace(
          /\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i,
          'src="#"',
        );
      }
    }
    return match;
  });
}

/**
 * 淨化 HTML 富文本（用於文章正文等字段）
 * 保留正常標籤和屬性，僅移除 XSS 攻擊向量
 * iframe 允許保留但 src 受白名單限制（僅 YouTube 嵌入）
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const result = html
    .replace(SCRIPT_TAG_PATTERN, '')
    .replace(DANGEROUS_TAGS, '')
    .replace(EVENT_HANDLER_ATTRS, '')
    .replace(JS_PROTOCOL_PATTERN, '$1"#"')
    .replace(DANGEROUS_DATA_PATTERN, '$1"#"');
  // iframe src 白名單驗證（僅允許 YouTube 嵌入）
  return sanitizeIframeSrc(result);
}

/**
 * 剝離所有 HTML 標籤（用於 description/keywords 等純文本字段）
 * 將 <p>內容</p> → 內容，<br> → 空格
 */
export function stripHtmlTags(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
