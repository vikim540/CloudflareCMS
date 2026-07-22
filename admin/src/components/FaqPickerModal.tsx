import { useState } from 'react'

/**
 * FAQ Q&A 配對結構
 */
interface FaqPair {
  id: string
  question: string
  answer: string
}

/**
 * 生成唯一 ID（用於 React key）
 */
function genId(): string {
  return Math.random().toString(36).slice(2, 9)
}

/**
 * HTML 轉義（防止 XSS，問答內容可能含特殊字符）
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 生成單個 FAQ 的 HTML
 * 結構：<details class="faq-item"><summary>問題</summary><div>答案</div></details>
 *
 * 問題：轉義 HTML（純文字展示）
 * 答案：不轉義（允許基本 HTML 標籤如 <strong>/<a>），後端 sanitizeHtml 會清理危險標籤
 *
 * Nuxt 前端已對 <details>/<summary> 設置基礎樣式
 * 後端解析此 class="faq-item" 生成 FAQPage JSON-LD
 */
function buildFaqHtml(pair: FaqPair): string {
  const q = escapeHtml(pair.question.trim())
  const a = pair.answer.trim()
  return `<details class="faq-item"><summary>${q}</summary><div>${a}</div></details>`
}

/**
 * FAQ 插入面板 Modal（可複用組件）
 *
 * 用戶可添加多組問答配對，插入後在編輯器中生成
 * <details class="faq-item"><summary>Q</summary><div>A</div></details>
 *
 * 後端解析這些標籤生成 FAQPage JSON-LD（SEO 結構化數據）
 *
 * 用法：
 * ```tsx
 * <FaqPickerModal
 *   open={faqPickerOpen}
 *   onClose={() => setFaqPickerOpen(false)}
 *   onInsert={(html) => {
 *     quillRef.current?.clipboard.dangerouslyPasteHTML(range.index, html, 'user')
 *   }}
 * />
 * ```
 */
export default function FaqPickerModal({
  open,
  onClose,
  onInsert,
}: {
  open: boolean
  onClose: () => void
  /** 插入完成後的回調，返回 HTML 字符串（多個 <details> 塊） */
  onInsert: (html: string) => void
}) {
  const [pairs, setPairs] = useState<FaqPair[]>([
    { id: genId(), question: '', answer: '' },
  ])

  /** 新增一組問答 */
  const addPair = () => {
    setPairs((prev) => [...prev, { id: genId(), question: '', answer: '' }])
  }

  /** 移除指定問答 */
  const removePair = (id: string) => {
    setPairs((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev))
  }

  /** 更新問題 */
  const updateQuestion = (id: string, value: string) => {
    setPairs((prev) => prev.map((p) => (p.id === id ? { ...p, question: value } : p)))
  }

  /** 更新答案 */
  const updateAnswer = (id: string, value: string) => {
    setPairs((prev) => prev.map((p) => (p.id === id ? { ...p, answer: value } : p)))
  }

  /** 確認插入 */
  const handleConfirm = () => {
    const validPairs = pairs.filter((p) => p.question.trim() && p.answer.trim())
    if (validPairs.length === 0) return

    const html = validPairs.map(buildFaqHtml).join('\n')
    onInsert(html)

    // 重置狀態
    setPairs([{ id: genId(), question: '', answer: '' }])
    onClose()
  }

  if (!open) return null

  const validPairs = pairs.filter((p) => p.question.trim() && p.answer.trim())

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 頭部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">❓ 插入 FAQ 問答</h2>
            <p className="text-xs text-gray-500 mt-1">
              生成 <code className="bg-gray-100 px-1 rounded">&lt;details&gt;</code> 標籤，後端自動生成 FAQPage JSON-LD 結構化數據（SEO）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* 內容區 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {pairs.map((pair, index) => (
            <div key={pair.id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
              {/* 問答標題 + 刪除按鈕 */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  問答 #{index + 1}
                </span>
                {pairs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePair(pair.id)}
                    className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded"
                  >
                    🗑️ 刪除
                  </button>
                )}
              </div>

              {/* 問題 */}
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  問題 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={pair.question}
                  onChange={(e) => updateQuestion(pair.id, e.target.value)}
                  placeholder="例如：這項服務適合什麼人群？"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* 答案 */}
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  答案 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={pair.answer}
                  onChange={(e) => updateAnswer(pair.id, e.target.value)}
                  placeholder="輸入答案內容（支援純文字，也可輸入基本 HTML 標籤如 <strong>、<a> 等）"
                  rows={3}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                />
              </div>

              {/* 預覽 */}
              {pair.question.trim() && pair.answer.trim() && (
                <div className="border border-blue-100 bg-blue-50 rounded p-3">
                  <p className="text-xs text-blue-600 mb-2">📋 預覽</p>
                  <details className="faq-item border border-gray-200 rounded p-2 bg-white">
                    <summary className="cursor-pointer font-medium text-sm text-gray-800">
                      {pair.question}
                    </summary>
                    <div className="mt-2 text-sm text-gray-600 leading-relaxed">
                      {pair.answer}
                    </div>
                  </details>
                </div>
              )}
            </div>
          ))}

          {/* 新增問答按鈕 */}
          <button
            type="button"
            onClick={addPair}
            className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            ➕ 新增一組問答
          </button>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <span className="text-xs text-gray-500">
            {validPairs.length > 0
              ? `✅ ${validPairs.length} 組有效問答將插入`
              : '請填寫問題和答案'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={validPairs.length === 0}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              插入 FAQ
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
