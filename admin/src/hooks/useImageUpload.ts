/**
 * 圖片上傳 Hook — 封裝壓縮 + 上傳 + 進度 + 錯誤處理的統一邏輯
 *
 * 設計原則：
 *   - 所有上傳位置共用此 hook，避免重複邏輯
 *   - 壓縮引擎可替換（imageCompress.ts 是唯一入口）
 *   - 上傳過程有進度展示（壓縮中 / 上傳中）
 *   - 上傳失敗有明確錯誤提示
 *
 * 使用方式：
 *   const { uploading, progress, error, uploadFiles, clearError } = useImageUpload()
 *
 *   // 批量上傳（自動壓縮圖片）
 *   const urls = await uploadFiles(imageFiles)
 *
 *   // 單個上傳
 *   const url = await uploadSingle(file)
 */

import { useState, useCallback, useRef } from 'react';
import { compressImage, type CompressOptions } from '../lib/imageCompress';

/** 上傳進度信息 */
export interface UploadProgress {
  /** 當前處理第幾個文件（從 1 開始） */
  current: number;
  /** 總文件數 */
  total: number;
  /** 當前階段 */
  phase: 'compressing' | 'uploading';
  /** 當前文件名 */
  fileName: string;
  /** 壓縮進度 0-100（僅 phase='compressing' 時有效） */
  compressProgress?: number;
  /** 上傳進度 0-100（僅 phase='uploading' 時有效） */
  uploadProgress?: number;
}

/** 上傳結果 */
export interface UploadResult {
  url: string;
  originalName: string;
  compressed: boolean;
}

/** Hook 選項 */
export interface UseImageUploadOptions {
  /** 上傳端點，默認 /api/v1/admin/upload */
  endpoint?: string;
  /** 是否自動壓縮圖片，默認 true */
  autoCompress?: boolean;
  /** 壓縮選項（autoCompress=true 時生效） */
  compressOptions?: CompressOptions;
  /** 是否顯示壓縮進度，默認 true */
  showCompressProgress?: boolean;
}

/** API 響應格式 */
interface ApiResponse {
  code: number;
  msg: string;
  data?: { url?: string };
}

/** 上傳單個文件到服務器 */
async function uploadFileToServer(
  file: File,
  endpoint: string,
  token: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.open('POST', endpoint);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    // 上傳進度
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      try {
        const resp: ApiResponse = JSON.parse(xhr.responseText);
        if (resp.code === 0 && resp.data?.url) {
          resolve(resp.data.url);
        } else {
          reject(new Error(resp.msg || '上傳失敗'));
        }
      } catch {
        reject(new Error(`服務器返回異常 (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('網絡連接失敗，請檢查網路後重試'));
    xhr.ontimeout = () => reject(new Error('上傳超時，請重試'));

    xhr.timeout = 60000; // 60 秒超時
    xhr.send(formData);
  });
}

/**
 * 圖片上傳 Hook
 *
 * @param options 上傳選項
 * @returns 上傳狀態和方法
 */
export function useImageUpload(options?: UseImageUploadOptions) {
  const {
    endpoint = '/api/v1/admin/upload',
    autoCompress = true,
    compressOptions,
    showCompressProgress = true,
  } = options ?? {};

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 用於取消上傳
  const abortRef = useRef<boolean>(false);

  /** 清除錯誤狀態 */
  const clearError = useCallback(() => setError(null), []);

  /** 取消上傳 */
  const cancel = useCallback(() => {
    abortRef.current = true;
    setUploading(false);
    setProgress(null);
  }, []);

  /**
   * 上傳單個文件
   *
   * @param file 原始文件
   * @param onProgress 可選進度回調
   * @returns 上傳後的 URL，失敗返回 null
   */
  const uploadSingle = useCallback(async (
    file: File,
    onProgress?: (p: UploadProgress | null) => void,
  ): Promise<string | null> => {
    setUploading(true);
    setError(null);
    abortRef.current = false;

    const token = localStorage.getItem('cms_token') || '';
    const apiBase = import.meta.env.VITE_API_BASE || '/api/v1';
    const uploadEndpoint = endpoint.startsWith('http') ? endpoint : `${apiBase}${endpoint.replace('/api/v1', '')}`;
    const finalEndpoint = endpoint.startsWith('/api/v1') ? `${apiBase}${endpoint.replace('/api/v1', '')}` : uploadEndpoint;

    try {
      let fileToUpload = file;
      let compressed = false;

      // 自動壓縮圖片
      if (autoCompress && file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
        const phaseProgress: UploadProgress = {
          current: 1,
          total: 1,
          phase: 'compressing',
          fileName: file.name,
        };
        setProgress(phaseProgress);
        onProgress?.(phaseProgress);

        const result = await compressImage(file, {
          ...compressOptions,
          onProgress: showCompressProgress ? (p) => {
            const updated = { ...phaseProgress, compressProgress: p };
            setProgress(updated);
            onProgress?.(updated);
          } : undefined,
        });
        fileToUpload = result.file;
        compressed = result.savings > 0;
      }

      // 上傳到服務器
      const uploadProgress: UploadProgress = {
        current: 1,
        total: 1,
        phase: 'uploading',
        fileName: file.name,
      };
      setProgress(uploadProgress);
      onProgress?.(uploadProgress);

      const url = await uploadFileToServer(
        fileToUpload,
        finalEndpoint,
        token,
        (p) => {
          const updated = { ...uploadProgress, uploadProgress: p };
          setProgress(updated);
          onProgress?.(updated);
        },
      );

      setProgress(null);
      setUploading(false);
      return url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '上傳失敗';
      setError(msg);
      setProgress(null);
      setUploading(false);
      return null;
    }
  }, [autoCompress, compressOptions, endpoint, showCompressProgress]);

  /**
   * 批量上傳文件
   *
   * @param files 原始文件數組
   * @returns 上傳結果數組（成功的返回 URL，失敗的返回 null）
   */
  const uploadFiles = useCallback(async (
    files: File[],
  ): Promise<(string | null)[]> => {
    if (files.length === 0) return [];

    setUploading(true);
    setError(null);
    abortRef.current = false;

    const token = localStorage.getItem('cms_token') || '';
    const apiBase = import.meta.env.VITE_API_BASE || '/api/v1';
    const finalEndpoint = endpoint.startsWith('http')
      ? endpoint
      : endpoint.startsWith('/api/v1')
        ? `${apiBase}${endpoint.replace('/api/v1', '')}`
        : `${apiBase}${endpoint}`;

    const results: (string | null)[] = [];
    const failedFiles: string[] = [];

    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break;

      const file = files[i];
      let fileToUpload = file;

      try {
        // 自動壓縮圖片
        if (autoCompress && file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
          const phaseProgress: UploadProgress = {
            current: i + 1,
            total: files.length,
            phase: 'compressing',
            fileName: file.name,
          };
          setProgress(phaseProgress);

          const result = await compressImage(file, {
            ...compressOptions,
            onProgress: showCompressProgress ? (p) => {
              setProgress({ ...phaseProgress, compressProgress: p });
            } : undefined,
          });
          fileToUpload = result.file;
        }

        // 上傳到服務器
        const uploadProgress: UploadProgress = {
          current: i + 1,
          total: files.length,
          phase: 'uploading',
          fileName: file.name,
        };
        setProgress(uploadProgress);

        const url = await uploadFileToServer(
          fileToUpload,
          finalEndpoint,
          token,
          (p) => {
            setProgress({ ...uploadProgress, uploadProgress: p });
          },
        );
        results.push(url);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '上傳失敗';
        failedFiles.push(`${file.name}: ${msg}`);
        results.push(null);
      }
    }

    // 如果有失敗的文件，設置錯誤信息
    if (failedFiles.length > 0) {
      setError(`${failedFiles.length} 個文件上傳失敗：\n${failedFiles.join('\n')}`);
    }

    setProgress(null);
    setUploading(false);
    return results;
  }, [autoCompress, compressOptions, endpoint, showCompressProgress]);

  return {
    uploading,
    progress,
    error,
    uploadFiles,
    uploadSingle,
    clearError,
    cancel,
  };
}
