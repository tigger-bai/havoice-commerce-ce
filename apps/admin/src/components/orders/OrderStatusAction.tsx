'use client';

import { useState } from 'react';

import { useToast } from '@/components/ui/Toast';
import { ORDER_STATUS_MAP } from '@/components/ui/OrderBadges';

/**
 * OrderStatusAction - 訂單列表 Actions 欄的狀態快捷變更下拉選單
 *
 * 設計決策：
 * - 僅顯示「合法的下一步狀態」（由後端回傳 allowedTransitions，前端亦保險過濾）
 * - 變更後呼叫 PATCH /api/orders/[id]，成功以 Toast 回饋並通知父層更新
 * - 防禦：請求期間鎖定選單避免重複送出；錯誤以 Toast 顯示友善訊息
 */

interface Props {
  orderId: string;
  currentStatus: string;
  allowedTransitions: string[];
  onUpdated: (next: { status: string; paymentStatus?: string }) => void;
}

export function OrderStatusAction({
  orderId,
  currentStatus,
  allowedTransitions,
  onUpdated,
}: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const options = Array.isArray(allowedTransitions) ? allowedTransitions : [];

  if (options.length === 0) {
    return <span className="text-xs text-gray-400">無可變更</span>;
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (!next || next === currentStatus) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '更新失敗');
      }
      toast.success(`已將訂單更新為「${ORDER_STATUS_MAP[next]?.label ?? next}」`);
      onUpdated({ status: json.data?.status ?? next, paymentStatus: json.data?.paymentStatus });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新訂單狀態失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <select
      defaultValue=""
      disabled={submitting}
      onChange={handleChange}
      onClick={(e) => e.stopPropagation()}
      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-brand-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
    >
      <option value="" disabled>
        {submitting ? '處理中…' : '變更狀態'}
      </option>
      {options.map((s) => (
        <option key={s} value={s}>
          {ORDER_STATUS_MAP[s]?.label ?? s}
        </option>
      ))}
    </select>
  );
}
