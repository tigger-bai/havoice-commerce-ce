'use client';

import { useState } from 'react';

import { useToast } from '@/components/ui/Toast';

/**
 * 行銷版位行內快速切換元件
 *
 * 設計決策（沿用商品 / 會員 InlineQuickEdit 模式）：
 * - 以開關按鈕即時切換 isActive，變更時呼叫 PATCH /api/layouts/[id]
 * - 每個 row 各自獨立 submitting 狀態，避免互相干擾與競態
 * - 樂觀更新：成功後透過 onUpdated 通知父層更新該列；失敗則 Toast 並不變更
 */

interface PatchResult {
  isActive: boolean;
  sortOrder: number;
}

async function patchSection(id: string, data: Record<string, unknown>): Promise<PatchResult> {
  const res = await fetch(`/api/layouts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message || '更新失敗，請稍後再試');
  }
  return json.data as PatchResult;
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

interface ActiveInlineEditProps {
  sectionId: string;
  value: boolean;
  onUpdated: (next: { isActive: boolean }) => void;
}

/**
 * isActive 即時切換開關（toggle）
 */
export function ActiveInlineEdit({ sectionId, value, onUpdated }: ActiveInlineEditProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleToggle = async () => {
    if (submitting) return;
    const next = !value;
    setSubmitting(true);
    try {
      const result = await patchSection(sectionId, { isActive: next });
      onUpdated({ isActive: result.isActive });
      toast.success(result.isActive ? '版位已啟用' : '版位已停用');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={submitting}
        onClick={handleToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${
          value ? 'bg-brand-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span className="inline-flex w-12 items-center gap-1 text-xs font-medium text-gray-600">
        {submitting ? <Spinner /> : value ? '已啟用' : '已停用'}
      </span>
    </div>
  );
}
