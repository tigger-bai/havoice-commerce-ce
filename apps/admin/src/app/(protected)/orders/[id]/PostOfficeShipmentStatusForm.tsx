'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const POST_OFFICE_STATUS_OPTIONS = [
  { value: 'CREATED', label: '已建立' },
  { value: 'ACCEPTED', label: '郵局已收件' },
  { value: 'IN_TRANSIT', label: '運送中' },
  { value: 'DELIVERED', label: '已送達' },
  { value: 'FAILED', label: '配送失敗' },
  { value: 'CANCELLED', label: '已取消' },
] as const;

type PostOfficeStatus = (typeof POST_OFFICE_STATUS_OPTIONS)[number]['value'];

const POST_OFFICE_STATUS_TRANSITIONS: Record<PostOfficeStatus, PostOfficeStatus[]> = {
  CREATED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_TRANSIT', 'FAILED', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED', 'CANCELLED'],
  FAILED: ['ACCEPTED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

function isPostOfficeStatus(value: string): value is PostOfficeStatus {
  return POST_OFFICE_STATUS_OPTIONS.some((option) => option.value === value);
}

function normalizePostOfficeStatus(value: string): string {
  return value.trim().toUpperCase();
}

function getNextStatusOptions(status: PostOfficeStatus | null) {
  if (!status) return [];

  const nextStatuses = POST_OFFICE_STATUS_TRANSITIONS[status];
  return POST_OFFICE_STATUS_OPTIONS.filter((option) => nextStatuses.includes(option.value));
}

function getDefaultNextStatus(value: string): PostOfficeStatus | '' {
  const normalizedStatus = normalizePostOfficeStatus(value);
  if (!isPostOfficeStatus(normalizedStatus)) return '';

  return getNextStatusOptions(normalizedStatus)[0]?.value ?? '';
}

type PostOfficeShipmentStatusFormProps = {
  orderId: string;
  shipment: {
    id: string;
    status: string;
  };
  onUpdated?: () => Promise<void> | void;
};

export function PostOfficeShipmentStatusForm({
  orderId,
  shipment,
  onUpdated,
}: PostOfficeShipmentStatusFormProps) {
  const router = useRouter();
  const normalizedShipmentStatus = normalizePostOfficeStatus(shipment.status);
  const currentStatus = isPostOfficeStatus(normalizedShipmentStatus) ? normalizedShipmentStatus : null;
  const nextStatusOptions = getNextStatusOptions(currentStatus);
  const [status, setStatus] = useState<PostOfficeStatus | ''>(() => getDefaultNextStatus(shipment.status));
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isUnknownStatus = !currentStatus;
  const isTerminal = currentStatus === 'DELIVERED' || currentStatus === 'CANCELLED';
  const canSubmit = Boolean(status) && !isSubmitting && !isTerminal && !isUnknownStatus;
  const shouldShowSelectRequiredMessage = !status && !isTerminal && !isUnknownStatus && nextStatusOptions.length > 0;

  useEffect(() => {
    setStatus(getDefaultNextStatus(shipment.status));
    setMessage('');
    setError(null);
    setSuccess(null);
  }, [shipment.status]);

  const submit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/orders/${orderId}/post-office/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, message: message.trim() || undefined }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '更新郵局物流狀態失敗');
      }

      setMessage('');
      setSuccess('郵局物流狀態已更新');
      router.refresh();
      await onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新郵局物流狀態失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">更新郵局物流狀態</h3>
          <p className="mt-1 text-xs text-gray-500">目前狀態：{shipment.status || '—'}</p>
        </div>
      </div>

      {isUnknownStatus ? (
        <p className="mt-3 text-sm font-medium text-rose-700">目前物流狀態資料異常，請由工程師檢查</p>
      ) : isTerminal ? (
        <p className="mt-3 text-sm font-medium text-gray-600">此物流狀態已完成，無法再變更。</p>
      ) : nextStatusOptions.length === 0 ? (
        <p className="mt-3 text-sm font-medium text-amber-700">目前狀態無可用的下一步轉換。</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
          <label className="block text-sm">
            <span className="text-xs font-medium text-gray-500">新狀態</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as PostOfficeStatus)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {nextStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium text-gray-500">備註</span>
            <input
              type="text"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="例如：郵局窗口已收件、配送失敗原因"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '更新中...' : '更新物流狀態'}
          </button>
          {shouldShowSelectRequiredMessage && (
            <p className="text-xs font-medium text-amber-700 md:col-span-3">請選擇新物流狀態。</p>
          )}
        </div>
      )}

      {success && <p className="mt-2 text-xs font-medium text-emerald-700">{success}</p>}
      {error && <p className="mt-2 text-xs font-medium text-rose-700">{error}</p>}
    </div>
  );
}
