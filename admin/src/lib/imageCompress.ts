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

/** 輸出格式 */
export type CompressFormat = 'webp' | 'original';

/** 壓縮選項 */
export interface CompressOptions {
  /** 最大寬度（px），默認 1920 */
  maxWidth?: number;
  /** 最大高度（px），默認 1080 */
  maxHeight?: number;
  /** 壓縮質量 0-1，默認 0.82（視覺無損） */
  quality?: number;
  /** 輸出格式，默認 webp */
  format?: CompressFormat;
  /** 輸出文件名前綴（默認保留原名） */
  filename?: string;
}

/** 壓縮結果（含尺寸和預覽信息） */
export interface CompressResult {
  /** 壓縮後的 File 對象 */
  file: File;
  /** 壓縮後的預覽 URL（ObjectURL，需手動釋放） */
  previewUrl: string;
  /** 壓縮後寬度 */
  width: number;
  /** 壓縮後高度 */
  height: number;
  /** 壓縮後大小（字節） */
  size: number;
  /** 原始大小（字節） */
  originalSize: number;
  /** 節省比例 0-1 */
  savings: number;
  /** 輸出 MIME 類型 */
  type: string;
}

/** 默認壓縮參數 */
const DEFAULTS: Required<CompressOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.82,
  format: 'webp',
  filename: '',
};

/**
 * 壓縮圖片文件，支持 WebP 或保留原格式
 *
 * @param file 原始圖片文件
 * @param options 壓縮選項
 * @returns 壓縮後的 File 對象
 */
export async function compressImageToWebP(
  file: File,
  options?: CompressOptions,
): Promise<File> {
  const result = await compressImage(file, options);
  return result.file;
}

/**
 * 壓縮圖片文件並返回完整結果（含預覽 URL、尺寸、大小對比）
 *
 * @param file 原始圖片文件
 * @param options 壓縮選項
 * @returns CompressResult 壓縮結果
 */
export async function compressImage(
  file: File,
  options?: CompressOptions,
): Promise<CompressResult> {
  const opts = { ...DEFAULTS, ...options };
  const originalSize = file.size;

  // 非圖片類型直接返回原文件
  if (!file.type.startsWith('image/')) {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      width: 0,
      height: 0,
      size: originalSize,
      originalSize,
      savings: 0,
      type: file.type,
    };
  }

  // SVG 是矢量圖，無需壓縮
  if (file.type === 'image/svg+xml') {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      width: 0,
      height: 0,
      size: originalSize,
      originalSize,
      savings: 0,
      type: file.type,
    };
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

    // 根據格式選擇輸出 MIME 類型
    const outputMime = opts.format === 'webp' ? 'image/webp' : file.type || 'image/png';
    // 對於 PNG/GIF 等無損格式，toBlob 的 quality 參數無效，但仍可縮放尺寸
    const useQuality = outputMime === 'image/webp' || outputMime === 'image/jpeg';

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputMime, useQuality ? opts.quality : undefined);
    });

    if (!blob) throw new Error('圖片壓縮失敗');

    // 如果壓縮後反而變大，使用原文件
    const finalBlob = blob.size >= originalSize ? file : blob;
    const finalSize = finalBlob.size;

    // 生成文件名
    const baseName = opts.filename || file.name.replace(/\.[^.]+$/, '');
    const ext = opts.format === 'webp' ? 'webp' : (file.name.split('.').pop() || 'png');
    const outputName = `${baseName}.${ext}`;

    const outputFile = new File([finalBlob], outputName, { type: outputMime });
    const previewUrl = URL.createObjectURL(finalBlob);

    return {
      file: outputFile,
      previewUrl,
      width,
      height,
      size: finalSize,
      originalSize,
      savings: originalSize > 0 ? 1 - finalSize / originalSize : 0,
      type: outputMime,
    };
  } catch (e) {
    console.warn('圖片壓縮失敗，使用原文件:', e);
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      width: 0,
      height: 0,
      size: originalSize,
      originalSize,
      savings: 0,
      type: file.type,
    };
  }
}

/**
 * 批量壓縮圖片文件
 * @param files 原始圖片文件數組
 * @param options 壓縮選項
 * @returns 壓縮結果數組
 */
export async function compressImagesBatch(
  files: File[],
  options?: CompressOptions,
): Promise<CompressResult[]> {
  return Promise.all(files.map((f) => compressImage(f, options)));
}

/** 格式化文件大小為人類可讀字符串 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
