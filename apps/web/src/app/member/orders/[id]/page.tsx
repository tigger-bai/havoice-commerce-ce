'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { SUPPORT_EMAIL } from '@/config/public';
import { formatPrice } from '@/lib/utils';

interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productPrice: number;
  quantity: number;
  subtotal: number;
  coverImage: string | null;
  slug: string | null;
}

interface OrderRecipient {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  country: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  shippingAddress: string;
  billingAddress: string | null;
  shippingMethod: string | null;
  paymentMethod: string | null;
  trackingNumber: string | null;
  notes: string | null;
  recipient: OrderRecipient | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  PENDING: { label: '待確認', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
  CONFIRMED: { label: '已確認', color: 'bg-blue-100 text-blue-800', icon: '✓' },
  PROCESSING: { label: '處理中', color: 'bg-indigo-100 text-indigo-800', icon: '⚙️' },
  SHIPPED: { label: '已出貨', color: 'bg-purple-100 text-purple-800', icon: '🚚' },
  DELIVERED: { label: '已送達', color: 'bg-green-100 text-green-800', icon: '✅' },
  CANCELLED: { label: '已取消', color: 'bg-red-100 text-red-800', icon: '✕' },
  REFUNDED: { label: '已退款', color: 'bg-gray-100 text-gray-800', icon: '↩️' },
};

const SHIPPING_METHOD_MAP: Record<string, string> = {
  STANDARD: '標準配送（3-5 個工作天）',
  EXPRESS: '快速配送（1-2 個工作天）',
  STORE: '超商取貨（2-3 個工作天）',
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  CREDIT_CARD: '信用卡付款',
  ATM: 'ATM 虛擬帳號',
  COD: '貨到付款',
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  UNPAID: { label: '未付款', color: 'bg-orange-100 text-orange-800' },
  PAID: { label: '已付款', color: 'bg-green-100 text-green-800' },
  REFUNDED: { label: '已退款', color: 'bg-gray-100 text-gray-800' },
};

/**
 * 單筆訂單詳情頁面
 *
 * 設計決策：
 * - 頂部：訂單編號 + 狀態
 * - 中間：商品明細（含圖片、名稱、單價、數量、小計）+ 金額摘要
 * - 底部：配送 / 付款資訊（依資料庫實際欄位呈現）
 * - 欄位與 Order schema 對齊：shippingAddress / billingAddress / shippingMethod /
 *   paymentMethod / trackingNumber / notes
 */
export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repaying, setRepaying] = useState(false);
  const [repayError, setRepayError] = useState<string | null>(null);

  // 繼續付款：呼叫 BFF 重新產生綠界 payload，並動態建立 form 自動 submit 導向綠界。
  const handleRepay = async () => {
    if (!order) return;
    setRepaying(true);
    setRepayError(null);
    try {
      const res = await fetch(`/api/user/orders/${order.id}/repay`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data?.data?.ecpayPayload || !data?.data?.actionUrl) {
        throw new Error(data?.message || '重新產生付款連結失敗');
      }
      const { actionUrl, ecpayPayload } = data.data as {
        actionUrl: string;
        ecpayPayload: Record<string, string>;
      };
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = actionUrl;
      Object.entries(ecpayPayload).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setRepayError(err instanceof Error ? err.message : '重新產生付款連結失敗');
      setRepaying(false);
    }
  };

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/user/orders/${orderId}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || '取得訂單失敗');
        }

        setOrder(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 載入中
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse rounded-2xl border border-gray-100 bg-white p-6">
          <div className="h-6 w-48 rounded bg-gray-200" />
          <div className="mt-4 h-4 w-32 rounded bg-gray-100" />
        </div>
        <div className="animate-pulse rounded-2xl border border-gray-100 bg-white p-6">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="h-16 w-16 rounded-lg bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-gray-200" />
                  <div className="h-3 w-1/4 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 錯誤
  if (error) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link
          href="/member/orders"
          className="mt-4 inline-block text-sm font-medium text-brand-600 underline hover:text-brand-700"
        >
          返回訂單列表
        </Link>
      </div>
    );
  }

  if (!order) return null;

  const status = STATUS_MAP[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-800', icon: '?' };
  const paymentStatus = PAYMENT_STATUS_MAP[order.paymentStatus] || {
    label: order.paymentStatus,
    color: 'bg-gray-100 text-gray-800',
  };
  const itemsSubtotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);
  const shippingFee = Math.max(0, order.totalAmount - itemsSubtotal);
  const recipientName = order.recipient?.name || '—';
  const recipientPhone = order.recipient?.phone || '—';
  const recipientEmail = order.recipient?.email || '—';
  const recipientAddress = order.recipient?.address || order.shippingAddress || '—';

  return (
    <div className="space-y-6">
      {/* 返回按鈕 */}
      <Link
        href="/member/orders"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-brand-600"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        返回訂單列表
      </Link>

      {/* 訂單標題卡片 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-mono text-lg font-bold text-gray-900">{order.orderNumber}</h2>
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${status.color}`}>
                <span>{status.icon}</span>
                {status.label}
              </span>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${paymentStatus.color}`}>
                {paymentStatus.label}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-gray-500">建立時間：{formatDate(order.createdAt)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">訂單金額</p>
            <p className="text-2xl font-bold text-brand-600">{formatPrice(order.totalAmount)}</p>
          </div>
        </div>

        {/* 繼續付款：僅針對「非貨到付款、未付款、未取消」的線上支付訂單顯示 */}
        {order.paymentMethod !== 'COD' &&
          order.paymentStatus === 'UNPAID' &&
          order.status !== 'CANCELLED' && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-800">此訂單尚未完成付款</p>
                  <p className="mt-0.5 text-xs text-amber-700">若之前交易中斷，可點選下方按鈕重新前往綠界完成付款。</p>
                  {repayError && <p className="mt-1 text-xs text-red-600">{repayError}</p>}
                </div>
                <button
                  type="button"
                  onClick={handleRepay}
                  disabled={repaying}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {repaying ? (
                    '導向中…'
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                      </svg>
                      立即付款
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
      </div>

      {/* 商品明細 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">商品明細（{order.items.length} 件）</h3>
        </div>

        <div className="divide-y divide-gray-50">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-6 py-4">
              {/* 商品圖片 */}
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                {item.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.coverImage} alt={item.productName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5" />
                    </svg>
                  </div>
                )}
              </div>

              {/* 商品資訊 */}
              <div className="min-w-0 flex-1">
                {item.slug ? (
                  <Link
                    href={`/shop/${item.slug}`}
                    className="text-sm font-medium text-gray-900 transition-colors hover:text-brand-600"
                  >
                    {item.productName}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                )}
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatPrice(item.productPrice)} × {item.quantity}
                </p>
              </div>

              {/* 小計 */}
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{formatPrice(item.subtotal)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 金額摘要 */}
        <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">商品小計</span>
              <span className="text-gray-700">{formatPrice(itemsSubtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">運費</span>
              <span className="text-gray-700">
                {shippingFee === 0 ? <span className="text-green-600">免運費</span> : formatPrice(shippingFee)}
              </span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2">
              <span className="font-medium text-gray-900">合計</span>
              <span className="text-lg font-bold text-brand-600">{formatPrice(order.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 配送與付款資訊 */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* 配送資訊 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            配送資訊
          </h3>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs text-gray-500">收件人姓名</dt>
              <dd className="mt-0.5 text-sm text-gray-900">{recipientName}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">收件人電話</dt>
              <dd className="mt-0.5 text-sm text-gray-900">{recipientPhone}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">收件人 Email</dt>
              <dd className="mt-0.5 break-all text-sm text-gray-900">{recipientEmail}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">收件地址</dt>
              <dd className="mt-0.5 text-sm text-gray-900">{recipientAddress}</dd>
            </div>
            {order.billingAddress && (
              <div>
                <dt className="text-xs text-gray-500">帳單地址</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{order.billingAddress}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-gray-500">配送方式</dt>
              <dd className="mt-0.5 text-sm text-gray-900">
                {order.shippingMethod
                  ? SHIPPING_METHOD_MAP[order.shippingMethod] || order.shippingMethod
                  : '—'}
              </dd>
            </div>
            {order.trackingNumber && (
              <div>
                <dt className="text-xs text-gray-500">物流追蹤碼</dt>
                <dd className="mt-0.5 font-mono text-sm text-gray-900">{order.trackingNumber}</dd>
              </div>
            )}
            {order.notes && (
              <div>
                <dt className="text-xs text-gray-500">訂單備註</dt>
                <dd className="mt-0.5 text-sm italic text-gray-700">{order.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* 付款資訊 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
            </svg>
            付款資訊
          </h3>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs text-gray-500">付款方式</dt>
              <dd className="mt-0.5 text-sm font-medium text-gray-900">
                {order.paymentMethod
                  ? PAYMENT_METHOD_MAP[order.paymentMethod] || order.paymentMethod
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">付款狀態</dt>
              <dd className="mt-0.5">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${paymentStatus.color}`}>
                  {paymentStatus.label}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">最後更新</dt>
              <dd className="mt-0.5 text-sm text-gray-700">{formatDate(order.updatedAt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* 底部操作 */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-6 py-4 sm:flex-row sm:items-center">
        <p className="text-xs text-gray-400">如需協助，請聯繫客服：{SUPPORT_EMAIL}</p>
        {order.status === 'PENDING' && (
          <button
            type="button"
            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            onClick={() => alert('取消訂單功能開發中')}
          >
            取消訂單
          </button>
        )}
      </div>
    </div>
  );
}
