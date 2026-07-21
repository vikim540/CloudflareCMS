/**
 * 圖片預覽 + 右上角移除按鈕（統一組件）
 *
 * 用於 ContentEdit 等頁面中所有「單圖/多圖預覽 + 移除」場景，
 * 取代散落各處的 ❌ 按鈕，確保樣式和行為一致。
 *
 * 使用方式：
 *   <ImagePreviewWithRemove src={ico} onRemove={() => updateField('ico', '')} />
 *   <ImagePreviewWithRemove src={img} onRemove={() => removeImage(idx)} size="sm" />
 */
import { cn } from '../lib/utils'

interface ImagePreviewWithRemoveProps {
  /** 圖片 URL */
  src: string
  /** 移除回調 */
  onRemove: () => void
  /** 圖片描述（alt 文本） */
  alt?: string
  /** 圖片容器額外樣式（如尺寸、圓角等） */
  containerClassName?: string
  /** 圖片本身額外樣式 */
  imgClassName?: string
  /** 移除按鈕大小 */
  buttonSize?: 'xs' | 'sm'
}

/** 統一的移除按鈕樣式映射 */
const BUTTON_STYLES = {
  xs: 'w-5 h-5 -top-2 -right-2',
  sm: 'w-6 h-6 -top-2 -right-2',
} as const

const ICON_STYLES = {
  xs: 'text-xs',
  sm: 'text-sm',
} as const

export default function ImagePreviewWithRemove({
  src,
  onRemove,
  alt = '預覽',
  containerClassName = '',
  imgClassName = '',
  buttonSize = 'xs',
}: ImagePreviewWithRemoveProps) {
  if (!src) return null

  return (
    <div className={cn('relative inline-block', containerClassName)}>
      <img
        src={src}
        alt={alt}
        className={cn('object-cover rounded', imgClassName)}
      />
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          'absolute flex items-center justify-center rounded-full bg-white shadow-md border border-gray-200 transition-transform hover:scale-110 hover:bg-red-50',
          BUTTON_STYLES[buttonSize],
        )}
        title="移除"
      >
        <span className={cn('leading-none', ICON_STYLES[buttonSize])}>❌</span>
      </button>
    </div>
  )
}
