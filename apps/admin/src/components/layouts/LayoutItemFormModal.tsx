'use client';

import { useState, useCallback } from 'react';

import { useToast } from '@/components/ui/Toast';
import { ImageUpload } from '@/components/ui/ImageUpload';

/**
 * 內容項目（LayoutItem）新增 / 編輯 Modal
 *
 * 設計決策：
 * - 以 Modal 承載單筆 item 的新增與編輯，避免整頁跳轉，貼合 CMS 操作習慣
 * - imageUrl 為必填，整合既有 ImageUpload 元件（Cloudinary 上傳 + 即時預覽）
 * - title（輔助標題）與 linkUrl（連結）為選填
 * - 提交前做基本前端驗證（imageUrl 必填、linkUrl 格式），後端再以 Zod 二次驗證
 * - 新增呼叫 POST /api/layouts/[id]/items；編輯呼叫 PUT /api/layouts/[id]/items/[itemId]
 * - 上傳中停用提交；所有錯誤皆中文 Toast 提示
 */

export interface LayoutItemData {
  id: string;
  sectionId: string;
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface LayoutItemFormModalProps {
  open: boolean;
  sectionId: string;
  /** 有值為編輯模式，否則為新增模式 */
  item?: LayoutItemData | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass =
  'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400';
const labelClass = 'block text-sm font-medium text-gray-700';
const errorClass = 'mt-1 text-xs text-rose-600';

/** 前端輕量驗證 linkUrl：允許空字串、/ 開頭站內連結、或合法 http(s) URL */
function isValidLinkUrl(value: string): boolean {
  if (!value) return true;
  if (value.startsWith('/')) return true;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function LayoutItemFormModal({
  open,
  sectionId,
  item,
  onClose,
  onSaved,
}: LayoutItemFormModalProps) {
  const { toast } = useToast();
  const isEdit = Boolean(item);

  const [title, setTitle] = useState(item?.title ?? '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '');
  const [linkUrl, setLinkUrl] = useState(item?.linkUrl ?? '');
  const [sortOrder, setSortOrder] = useState<number>(item?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState<boolean>(item?.isActive ?? true);

  const [isUploading, setIsUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<{ imageUrl?: string; linkUrl?: string }>({});

  // 當 Modal 開啟或切換目標 item 時，同步表單初始值
  // 使用 key（由父層控制 remount）較簡潔，但此處改以 open 變化重置以避免額外 key 管理
  const resetFromItem = useCallback(() => {
    setTitle(item?.title ?? '');
    setImageUrl(item?.imageUrl ?? '');
    setLinkUrl(item?.linkUrl ?? '');
    setSortOrder(item?.sortOrder ?? 0);
    setIsActive(item?.isActive ?? true);
    setFieldError({});
  }, [item]);

  // 以 open 由 false→true 作為重置時機
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) resetFromItem();
  }

  if (!open) return null;

  const handleSubmit = async () => {
    // 前端驗證
    const errs: { imageUrl?: string; linkUrl?: string } = {};
    if (!imageUrl || !imageUrl.trim()) {
      errs.imageUrl = '請上傳圖片';
    }
    if (linkUrl && !isValidLinkUrl(linkUrl.trim())) {
      errs.linkUrl = '連結必須是 / 開頭的站內路徑或有效網址';
    }
    if (Object.keys(errs).length > 0) {
      setFieldError(errs);
      return;
    }
    setFieldError({});

    setSubmitting(true);
    try {
      const endpoint = isEdit
        ? `/api/layouts/${sectionId}/items/${item!.id}`
        : `/api/layouts/${sectionId}/items`;
      const method = isEdit ? 'PUT' : 'POST';

      const payload = {
        title: title.trim(),
        imageUrl: imageUrl.trim(),
        linkUrl: linkUrl.trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive,
      };

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        toast.error(json?.error?.message || '儲存失敗，請稍後再試');
        return;
      }

      toast.success(isEdit ? '內容項目已更新' : '內容項目已新增');
      onSaved();
      onClose();
    } catch {
      toast.error('網路連線異常，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || isUploading;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <button
        type="button"
        aria-label="關閉"
        className="absolute inset-0 bg-gray-900/50"
        onClick={() => {
          if (!busy) onClose();
        }}
      />

      {/* 內容 */}
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-base font-semibold text-gray-900">
          {isEdit ? '編輯內容項目' : '新增內容項目'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>
              圖片 <span className="text-rose-500">*</span>
            </label>
            <div className="mt-1.5">
              <ImageUpload
                value={imageUrl}
                onChange={(url) => {
                  setImageUrl(url);
                  if (url) setFieldError((p) => ({ ...p, imageUrl: undefined }));
                }}
                onUploadingChange={setIsUploading}
                disabled={submitting}
              />
            </div>
            {fieldError.imageUrl && <p className={errorClass}>{fieldError.imageUrl}</p>}
          </div>

          <div>
            <label htmlFor="item-title" className={labelClass}>
              輔助標題（選填）
            </label>
            <input
              id="item-title"
              type="text"
              className={inputClass}
              placeholder="例如：夏季新品上市"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="item-link" className={labelClass}>
              連結（選填）
            </label>
            <input
              id="item-link"
              type="text"
              className={inputClass}
              placeholder="/products 或 https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              disabled={submitting}
            />
            {fieldError.linkUrl && <p className={errorClass}>{fieldError.linkUrl}</p>}
            <p className="mt-1 text-xs text-gray-400">可填站內路徑（/ 開頭）或完整網址，留空表示不可點擊。</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="item-sort" className={labelClass}>
                排序
              </label>
              <input
                id="item-sort"
                type="number"
                min={0}
                step={1}
                className={inputClass}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                disabled={submitting}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={submitting}
                />
                <span className="text-sm font-medium text-gray-700">啟用</span>
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isUploading ? '圖片上傳中…' : isEdit ? '儲存變更' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}
