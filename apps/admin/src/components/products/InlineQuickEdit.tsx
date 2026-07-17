'use client';

import { useState } from 'react';

import { useToast } from '@/components/ui/Toast';
import { PublishStatusBadge } from '@/components/ui/OrderBadges';
import { cn, safeNumber } from '@/lib/utils';

/**
 * 商品行內快速編輯元件
 *
 * 設計決策：
 * - 拆成 StockInlineEdit（庫存）與 StatusInlineEdit（上下架）兩個小元件
 * - 每個元件持有獨立 submitting 狀態，避免不同列之間的競態條件
 * - 樂觀更新：先呼叫 API，成功後透過 onUpdated 回拋最新值給父層更新該列
 * - 失敗時還原為原值並以 Toast 提示，畫面不崩潰
 * - 低庫存（< 10）以紅色強調
 */

const LOW_STOCK_THRESHOLD = 10;

async function patchProduct(
  id: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message || '更新失敗');
  }
  return json.data;
}

/* ---------------- 庫存行內編輯 ---------------- */

interface StockInlineEditProps {
  productId: string;
  value: number;
  onUpdated: (next: { stock: number }) => void;
}

export function StockInlineEdit({ productId, value, onUpdated }: StockInlineEditProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<string>(String(safeNumber(value)));
  const [submitting, setSubmitting] = useState(false);

  const isLow = safeNumber(value) < LOW_STOCK_THRESHOLD;

  const commit = async () => {
    const next = Math.max(0, Math.trunc(safeNumber(draft)));
    // 無變更則不打 API
    if (next === safeNumber(value)) {
      setDraft(String(next));
      return;
    }
    setSubmitting(true);
    try {
      const data = await patchProduct(productId, { stock: next });
      const updatedStock = safeNumber(data.stock);
      onUpdated({ stock: updatedStock });
      setDraft(String(updatedStock));
      toast.success(`庫存已更新為 ${updatedStock}`);
    } catch (err) {
      // 還原
      setDraft(String(safeNumber(value)));
      toast.error(err instanceof Error ? err.message : '庫存更新失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={draft}
        disabled={submitting}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          'w-20 rounded-lg border px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-1',
          isLow
            ? 'border-rose-300 bg-rose-50 text-rose-700 focus:border-rose-500 focus:ring-rose-500'
            : 'border-gray-300 text-gray-800 focus:border-brand-500 focus:ring-brand-500',
          submitting && 'opacity-50'
        )}
      />
      {isLow && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          低庫存
        </span>
      )}
      {submitting && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      )}
    </div>
  );
}

/* ---------------- 狀態行內編輯 ---------------- */

const STATUS_OPTIONS = [
  { value: 'PUBLISHED', label: '已上架' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'ARCHIVED', label: '已下架' },
];

interface StatusInlineEditProps {
  productId: string;
  value: string;
  onUpdated: (next: { status: string }) => void;
}

export function StatusInlineEdit({ productId, value, onUpdated }: StatusInlineEditProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === value) return;
    setSubmitting(true);
    try {
      const data = await patchProduct(productId, { status: next });
      const updatedStatus = String(data.status ?? next);
      onUpdated({ status: updatedStatus });
      const label = STATUS_OPTIONS.find((o) => o.value === updatedStatus)?.label ?? updatedStatus;
      toast.success(`狀態已更新為「${label}」`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '狀態更新失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <PublishStatusBadge status={value} />
      <select
        value={value}
        disabled={submitting}
        onChange={handleChange}
        className={cn(
          'rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
          submitting && 'opacity-50'
        )}
        aria-label="變更商品狀態"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {submitting && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      )}
    </div>
  );
}
