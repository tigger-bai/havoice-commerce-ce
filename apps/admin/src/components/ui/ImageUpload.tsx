'use client';

import { useCallback, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';

import { useToast } from '@/components/ui/Toast';

/**
 * ImageUpload 拖曳圖片上傳元件
 *
 * 設計決策（業界 SaaS 標準）：
 * - 支援 Drag & Drop 與點擊選檔兩種方式
 * - 前端防呆：僅允許圖片格式（jpg/png/webp/gif），單張 ≤ 5MB
 * - 上傳前先以 browser-image-compression 進行 Client-side 無感壓縮（WebP、≤500KB、≤1920px、Web Worker）
 *   以避免大圖經由 API 上傳 Cloudinary 時觸發 60 秒 Timeout
 * - 壓縮完成後上傳至 /api/upload，成功後以 secure_url 回填表單欄位
 * - 上傳中顯示 Spinner 並透過 onUploadingChange 通知父層停用提交按鈕
 * - 已有圖片時顯示預覽，並提供「更換」與「移除」操作
 * - 所有錯誤（格式、大小、網路、伺服器）皆觸發明確中文 Toast 提示
 */

interface ImageUploadProps {
  /** 目前的圖片 URL（受控） */
  value?: string;
  /** 上傳成功或移除時回傳新的 URL（移除時為空字串） */
  onChange: (url: string) => void;
  /** 上傳狀態變化通知父層（用於停用提交按鈕） */
  onUploadingChange?: (uploading: boolean) => void;
  /** 是否停用整個元件 */
  disabled?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/gif';

// Client-side 壓縮設定：優先轉 WebP、壓至 500KB 以內、最長邊 1920px、使用 Web Worker 避免卡 UI
const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/webp',
} as const;

export function ImageUpload({
  value,
  onChange,
  onUploadingChange,
  disabled = false,
}: ImageUploadProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const setUploading = useCallback(
    (next: boolean) => {
      setIsUploading(next);
      onUploadingChange?.(next);
    },
    [onUploadingChange]
  );

  /** 前端驗證單一檔案 */
  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return '僅支援 JPG、PNG、WebP、GIF 格式的圖片';
      }
      if (file.size > MAX_FILE_SIZE) {
        return '圖片大小不可超過 5MB';
      }
      if (file.size === 0) {
        return '檔案內容為空，請重新選擇圖片';
      }
      return null;
    },
    []
  );

  /** 執行壓縮 + 上傳 */
  const uploadFile = useCallback(
    async (file: File) => {
      // 先以原始檔做格式 / 大小防呆
      const validationError = validateFile(file);
      if (validationError) {
        toast.error(validationError);
        return;
      }

      setUploading(true);
      try {
        // 1) Client-side 無感壓縮（轉 WebP、縮小尺寸與體積）
        let uploadTarget: File = file;
        try {
          const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
          // 以壓縮後結果重建 File，並將副檔名改為 .webp 以與型別一致
          uploadTarget = new File(
            [compressed],
            file.name.replace(/\.[^.]+$/, '') + '.webp',
            { type: compressed.type || 'image/webp' }
          );
        } catch {
          // 壓縮失敗則退回原圖上傳（後端仍有 5MB 防護）
          uploadTarget = file;
        }

        // 2) 上傳至後端 API
        const formData = new FormData();
        formData.append('file', uploadTarget);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const json = await res.json();

        if (!res.ok || !json.success) {
          const message = json?.error?.message || '圖片上傳失敗，請稍後再試';
          toast.error(message);
          return;
        }

        const url: string = json.data?.url;
        if (!url) {
          toast.error('上傳成功但未取得圖片網址，請稍後再試');
          return;
        }

        onChange(url);
        toast.success('圖片上傳成功');
      } catch {
        toast.error('網路連線異常，圖片上傳失敗');
      } finally {
        setUploading(false);
      }
    },
    [validateFile, setUploading, onChange, toast]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      uploadFile(files[0]);
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled || isUploading) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, isUploading, handleFiles]
  );

  const openFilePicker = useCallback(() => {
    if (disabled || isUploading) return;
    inputRef.current?.click();
  }, [disabled, isUploading]);

  return (
    <div>
      {/* 隱藏的原生 file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        disabled={disabled || isUploading}
        onChange={(e) => {
          handleFiles(e.target.files);
          // 重置以便重新選擇同一檔案
          e.target.value = '';
        }}
      />

      {value ? (
        /* 已有圖片：顯示預覽 + 操作 */
        <div className="space-y-3">
          <div className="relative h-48 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="商品封面預覽"
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Spinner />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openFilePicker}
              disabled={disabled || isUploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              更換圖片
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled || isUploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              移除
            </button>
          </div>
        </div>
      ) : (
        /* 尚無圖片：拖曳/點擊上傳區塊 */
        <div
          role="button"
          tabIndex={0}
          onClick={openFilePicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openFilePicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !isUploading) setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          className={`flex h-48 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-colors ${
            isDragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-gray-100'
          } ${disabled || isUploading ? 'cursor-not-allowed opacity-70' : ''}`}
        >
          {isUploading ? (
            <>
              <Spinner />
              <p className="text-sm font-medium text-gray-500">上傳中，請稍候...</p>
            </>
          ) : (
            <>
              <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-medium text-gray-600">
                點擊或將圖片拖曳至此上傳
              </p>
              <p className="text-xs text-gray-400">支援 JPG、PNG、WebP、GIF，單張不超過 5MB</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-7 w-7 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
