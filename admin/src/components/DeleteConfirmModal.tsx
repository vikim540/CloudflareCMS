/**
 * 永久刪除確認 Modal — 帶靜態資源縮圖預覽 + 共用檢查 + S3 清理選項
 *
 * v1.9.15: 從 Trash.tsx 抽取為獨立組件，供所有永久刪除場景複用
 * 使用方式：
 *   <DeleteConfirmModal
 *     contentId={item.id}
 *     title={item.title}
 *     onClose={() => setShowModal(false)}
 *     onSuccess={() => refreshList()}
 *   />
 */
import { useState, useEffect } from 'react'
import { api } from '../lib/api'

/** 文章關聯的靜態資源（與後端 ContentResource 對齊） */
interface ContentResource {
  key: string
  url: string
  source: string
  shared: boolean
  sharedWith: string[]
}

interface DeleteConfirmModalProps {
  contentId: number
  title: string
  onClose: () => void
  onSuccess: () => void
}

export default function DeleteConfirmModal({
  contentId,
  title,
  onClose,
  onSuccess,
}: DeleteConfirmModalProps) {
  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState<ContentResource[]>([])
  const [deleteResources, setDeleteResources] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  // 載入關聯靜態資源
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get<{ title: string; images: ContentResource[] }>(
          `/admin/contents/${contentId}/resources`,
        )
        if (!cancelled) {
          setImages(res.data?.images ?? [])
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setImages([])
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [contentId])

  // 確認永久刪除
  const handleConfirm = async () => {
    setDeleting(true)
    setError('')
    try {
      const url = deleteResources
        ? `/admin/contents/${contentId}/permanent?delete_resources=true`
        : `/admin/contents/${contentId}/permanent`
      await api.del(url)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '永久刪除失敗')
      setDeleting(false)
    }
  }

  // 衍生變量
  const sharedCount = images.filter((i) => i.shared).length
  const deletableCount = images.length - sharedCount

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => !deleting && onClose()}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>🗑️</span>
            永久刪除確認
          </h2>
          {!deleting && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xl leading-none"
            >
              ✕
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* 文章標題 */}
          <div className="mb-3">
            <span className="text-sm text-muted-foreground">文章：</span>
            <span className="text-sm font-medium ml-1">{title || '(無標題)'}</span>
          </div>

          {/* 警告 */}
          <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <span className="shrink-0 text-base">⚠️</span>
            <span>
              永久刪除後無法恢復，資料庫記錄將被清除。
              {loading
                ? '正在載入關聯的靜態資源...'
                : images.length > 0
                  ? '以下為該文章關聯的靜態圖片資源：'
                  : '此文章沒有關聯的靜態資源。'}
            </span>
          </div>

          {/* 錯誤提示 */}
          {error && (
            <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-md text-sm">
              <span className="shrink-0">⚠️</span>
              {error}
            </div>
          )}

          {/* 載入中 */}
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <div className="animate-spin h-6 w-6 border-2 border-muted border-t-primary rounded-full mr-2" />
              載入資源中...
            </div>
          )}

          {/* 縮圖網格 */}
          {!loading && images.length > 0 && (
            <>
              {/* 統計摘要 */}
              <div className="mb-3 flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">
                  共 <span className="font-medium text-foreground">{images.length}</span> 張圖片
                </span>
                {sharedCount > 0 && (
                  <span className="text-amber-600">
                    其中 {sharedCount} 張被其他內容引用（將保留）
                  </span>
                )}
                {deletableCount > 0 && (
                  <span className="text-red-600">{deletableCount} 張將被刪除</span>
                )}
              </div>

              {/* 圖片網格 */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {images.map((img) => (
                  <div
                    key={img.key}
                    className={`relative rounded-lg overflow-hidden border-2 ${
                      img.shared ? 'border-amber-400' : 'border-transparent'
                    }`}
                  >
                    {/* 縮圖 */}
                    <div className="aspect-square bg-secondary/30">
                      <img
                        src={img.url}
                        alt={img.key}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget
                          target.style.display = 'none'
                          const parent = target.parentElement
                          if (parent) {
                            parent.classList.add('flex', 'items-center', 'justify-center')
                            parent.innerHTML = '<span class="text-2xl opacity-40">🖼️</span>'
                          }
                        }}
                      />
                    </div>

                    {/* 來源標籤 */}
                    <div className="absolute top-1 left-1">
                      <span className="inline-block px-1.5 py-0.5 text-[10px] bg-black/60 text-white rounded">
                        {img.source}
                      </span>
                    </div>

                    {/* 共用標籤 */}
                    {img.shared && (
                      <div className="absolute top-1 right-1">
                        <span
                          className="inline-block px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded"
                          title={`被引用：${img.sharedWith.join(', ')}`}
                        >
                          共用
                        </span>
                      </div>
                    )}

                    {/* 檔名 */}
                    <div className="px-1.5 py-1 text-[10px] text-muted-foreground truncate">
                      {img.key.split('/').pop()}
                    </div>
                  </div>
                ))}
              </div>

              {/* 共用詳情 */}
              {sharedCount > 0 && (
                <div className="mt-3 px-4 py-2.5 bg-amber-50 rounded-lg text-xs text-amber-700">
                  <span className="font-medium">📌 共用圖片（將保留不刪除）：</span>
                  <ul className="mt-1 space-y-0.5">
                    {images
                      .filter((i) => i.shared)
                      .map((i) => (
                        <li key={i.key}>
                          {i.key.split('/').pop()} — 被 {i.sharedWith.join('、')} 引用
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* 無圖片 */}
          {!loading && images.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <span className="text-3xl mb-2">📭</span>
              <span className="text-sm">此文章沒有關聯的靜態圖片資源</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {!loading && (
          <div className="px-6 py-4 border-t space-y-3">
            {/* 一併刪除靜態資源開關 */}
            {images.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteResources}
                  onChange={(e) => setDeleteResources(e.target.checked)}
                  disabled={deleting}
                  className="w-4 h-4 rounded accent-red-600"
                />
                <span className="text-sm">
                  一併刪除靜態資源
                  {deleteResources && deletableCount > 0 && (
                    <span className="text-red-600 ml-1">
                      （將刪除 {deletableCount} 張，保留 {sharedCount} 張共用圖片）
                    </span>
                  )}
                  {deleteResources && sharedCount === images.length && (
                    <span className="text-amber-600 ml-1">
                      （所有圖片均被引用，不會刪除任何圖片）
                    </span>
                  )}
                </span>
              </label>
            )}

            {/* 操作按鈕 */}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                disabled={deleting}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
                    刪除中...
                  </>
                ) : (
                  <>
                    <span>🗑️</span>
                    確認永久刪除
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
