/**
 * 前端圖片壓縮工具 — 使用 Canvas API 實現 WebP 壓縮
 * 類似 Squoosh 的效果：自動縮放 + 質量壓縮 + 格式轉換
 *
 * 特性：
 *   - 自動按最大尺寸等比縮放（不變形）
 *   - 轉換為 WebP 格式（體積減少 30-70%）
 *   - 可配置壓縮質量（0-1，默認 0.82）
 *   - 保留 EXIF 方向信息（通過 createImageBitmap）
 *   - 返回 File 對象，可直接用 FormData 上傳
 */

/** 壓縮選項 */
export interface CompressOptions {
  /** 最大寬度（px），默認 1920 */
  maxWidth?: number;
  /** 最大高度（px），默認 1080 */
  maxHeight?: number;
  /** WebP 壓縮質量 0-1，默認 0.82（視覺無損） */
  quality?: number;
  /** 輸出文件名前綴（默認保留原名） */
  filename?: string;
}

/** 默認壓縮參數 */
const DEFAULTS: Required<CompressOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.82,
  filename: '',
};

/**
 * 壓縮圖片文件為 WebP 格式
 *
 * @param file 原始圖片文件
 * @param options 壓縮選項
 * @returns 壓縮後的 WebP File 對象
 *
 * @example
 * const compressed = await compressImageToWebP(file, { maxWidth: 1200, quality: 0.8 })
 * const formData = new FormData()
 * formData.append('file', compressed)
 */
export async function compressImageToWebP(
  file: File,
  options?: CompressOptions,
): Promise<File> {
  const opts = { ...DEFAULTS, ...options };

  // 非圖片類型直接返回原文件
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // WebP 已經是目標格式且尺寸合理，跳過壓縮
  if (file.type === 'image/webp' && file.size < 500 * 1024) {
    return file;
  }

  try {
    // 使用 createImageBitmap 保留 EXIF 方向
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });

    // 計算等比縮放後的尺寸
    let { width, height } = bitmap;
    const ratio = Math.min(
      opts.maxWidth / width,
      opts.maxHeight / height,
      1, // 不放大
    );
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);

    // 創建 Canvas 並繪製
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 上下文不可用');

    // 高質量縮放
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    // 釋放 bitmap 資源
    bitmap.close();

    // 轉換為 WebP Blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', opts.quality);
    });

    if (!blob) throw new Error('WebP 轉換失敗');

    // 生成文件名
    const baseName = opts.filename || file.name.replace(/\.[^.]+$/, '');
    const webpName = `${baseName}.webp`;

    return new File([blob], webpName, { type: 'image/webp' });
  } catch (e) {
    console.warn('圖片壓縮失敗，使用原文件:', e);
    return file;
  }
}

/**
 * 批量壓縮圖片文件
 * @param files 原始圖片文件數組
 * @param options 壓縮選項
 * @returns 壓縮後的 WebP File 數組
 */
export async function compressImagesBatch(
  files: File[],
  options?: CompressOptions,
): Promise<File[]> {
  return Promise.all(files.map((f) => compressImageToWebP(f, options)));
}

/**
 * 獲取圖片的原始尺寸
 * @param url 圖片 URL
 * @returns { width, height }
 */
export function getImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}
