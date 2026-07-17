'use client';

/**
 * 訂單/付款狀態徽章
 *
 * 設計決策：
 * - 狀態鍵值嚴格對應 schema.prisma 的 OrderStatus / PaymentStatus / PublishStatus enum
 * - 未知狀態以中性灰色 fallback，避免畫面崩潰
 */

interface BadgeStyle {
  label: string;
  className: string;
}

const ORDER_STATUS_MAP: Record<string, BadgeStyle> = {
  PENDING: { label: '待處理', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  PAID: { label: '已付款', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  SHIPPED: { label: '已出貨', className: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20' },
  DELIVERED: { label: '已送達', className: 'bg-brand-50 text-brand-700 ring-brand-600/20' },
  CANCELLED: { label: '已取消', className: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
  REFUNDED: { label: '已退款', className: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
};

const PAYMENT_STATUS_MAP: Record<string, BadgeStyle> = {
  UNPAID: { label: '未付款', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  PAID: { label: '已付款', className: 'bg-brand-50 text-brand-700 ring-brand-600/20' },
  FAILED: { label: '付款失敗', className: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
  REFUNDED: { label: '已退款', className: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
};

const PUBLISH_STATUS_MAP: Record<string, BadgeStyle> = {
  DRAFT: { label: '草稿', className: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
  PUBLISHED: { label: '已上架', className: 'bg-brand-50 text-brand-700 ring-brand-600/20' },
  ARCHIVED: { label: '已下架', className: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
};

const FALLBACK: BadgeStyle = {
  label: '未知',
  className: 'bg-gray-100 text-gray-500 ring-gray-400/20',
};

function Badge({ style, value }: { style: BadgeStyle; value: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      {style.label || value}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status?: string | null }) {
  const key = String(status ?? '');
  return <Badge style={ORDER_STATUS_MAP[key] ?? { ...FALLBACK, label: key || '未知' }} value={key} />;
}

export function PaymentStatusBadge({ status }: { status?: string | null }) {
  const key = String(status ?? '');
  return <Badge style={PAYMENT_STATUS_MAP[key] ?? { ...FALLBACK, label: key || '未知' }} value={key} />;
}

export function PublishStatusBadge({ status }: { status?: string | null }) {
  const key = String(status ?? '');
  return <Badge style={PUBLISH_STATUS_MAP[key] ?? { ...FALLBACK, label: key || '未知' }} value={key} />;
}

/** 訂單狀態的合法值（供前端下拉選單使用） */
export const ORDER_STATUS_OPTIONS = Object.keys(ORDER_STATUS_MAP);
export { ORDER_STATUS_MAP };
