'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { ErrorAlert, PageHeader } from '@/components/ui/LoadingAndError';
import { OrderStatusBadge, PaymentStatusBadge, ORDER_STATUS_MAP } from '@/components/ui/OrderBadges';
import { OrderStatusAction } from '@/components/orders/OrderStatusAction';
import { formatCurrency, formatDateTime, safeNumber } from '@/lib/utils';

interface OrderRow {
  id: string;
  orderNumber: string;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  shippingMethod: string | null;
  createdAt: string;
  customerName: string;
  itemCount: number;
}

const STATUS_FILTERS = ['', 'PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

const PAYMENT_STATUS_FILTERS = [
  { value: '', label: '全部付款狀態' },
  { value: 'PENDING', label: '待付款' },
  { value: 'PAID', label: '已付款' },
  { value: 'FAILED', label: '付款失敗' },
  { value: 'REFUNDED', label: '已退款' },
];

const SHIPPING_METHOD_FILTERS = [
  { value: '', label: '全部配送方式' },
  { value: 'STANDARD', label: '宅配' },
  { value: 'EXPRESS', label: '快速配送' },
  { value: 'STORE', label: '超商取貨' },
];

const SHIPPING_METHOD_MAP: Record<string, string> = {
  STANDARD: '宅配',
  EXPRESS: '快速配送',
  STORE: '超商取貨',
  EC_PAY_POST_OFFICE: '綠界郵局一般宅配',
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  CREDIT_CARD: '信用卡',
  ATM: 'ATM',
  COD: '貨到付款',
  BANK_TRANSFER: '匯款',
  CASH: '現金',
  MONTHLY_SETTLEMENT: '月結',
  POST_OFFICE_COD: '貨到付款',
  OTHER: '其他',
};

const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PAID', 'SHIPPED', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const initialStatus = searchParams.get('status') || '';
  const initialPaymentStatus = searchParams.get('paymentStatus') || '';
  const initialShippingMethod = searchParams.get('shippingMethod') || '';
  const initialKeyword = searchParams.get('keyword') || '';

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [status, setStatus] = useState(initialStatus);
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [shippingMethod, setShippingMethod] = useState(initialShippingMethod);
  const [keyword, setKeyword] = useState(initialKeyword);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buildParams = useCallback(
    (overrides?: {
      page?: number;
      status?: string;
      paymentStatus?: string;
      shippingMethod?: string;
      keyword?: string;
    }) => {
      const nextPage = overrides?.page ?? page;
      const nextStatus = overrides?.status ?? status;
      const nextPaymentStatus = overrides?.paymentStatus ?? paymentStatus;
      const nextShippingMethod = overrides?.shippingMethod ?? shippingMethod;
      const nextKeyword = overrides?.keyword ?? keyword;

      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', '10');

      if (nextStatus) params.set('status', nextStatus);
      if (nextPaymentStatus) params.set('paymentStatus', nextPaymentStatus);
      if (nextShippingMethod) params.set('shippingMethod', nextShippingMethod);
      if (nextKeyword.trim()) params.set('keyword', nextKeyword.trim());

      return params;
    },
    [page, status, paymentStatus, shippingMethod, keyword]
  );

  const syncUrl = useCallback(
    (params: URLSearchParams) => {
      const visibleParams = new URLSearchParams(params);
      visibleParams.delete('limit');

      router.replace(`/orders${visibleParams.toString() ? `?${visibleParams.toString()}` : ''}`);
    },
    [router]
  );

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = buildParams();
      const res = await fetch(`/api/orders?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入訂單失敗');
      }

      setOrders(Array.isArray(json.data?.items) ? json.data.items : []);
      setTotalPages(safeNumber(json.data?.pagination?.totalPages) || 1);
      setTotal(safeNumber(json.data?.pagination?.total));
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
      setOrders([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const applyFilters = (next?: {
    status?: string;
    paymentStatus?: string;
    shippingMethod?: string;
    keyword?: string;
  }) => {
    const nextStatus = next?.status ?? status;
    const nextPaymentStatus = next?.paymentStatus ?? paymentStatus;
    const nextShippingMethod = next?.shippingMethod ?? shippingMethod;
    const nextKeyword = next?.keyword ?? keyword;

    setPage(1);
    setStatus(nextStatus);
    setPaymentStatus(nextPaymentStatus);
    setShippingMethod(nextShippingMethod);
    setKeyword(nextKeyword);

    syncUrl(
      buildParams({
        page: 1,
        status: nextStatus,
        paymentStatus: nextPaymentStatus,
        shippingMethod: nextShippingMethod,
        keyword: nextKeyword,
      })
    );
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    syncUrl(buildParams({ page: nextPage }));
  };

  const resetFilters = () => {
    setPage(1);
    setStatus('');
    setPaymentStatus('');
    setShippingMethod('');
    setKeyword('');
    router.replace('/orders');
  };

  const handleRowUpdated = (id: string, next: { status: string; paymentStatus?: string }) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? { ...o, status: next.status, paymentStatus: next.paymentStatus ?? o.paymentStatus }
          : o
      )
    );
  };

  const columns: Column<OrderRow>[] = [
    {
      key: 'orderNumber',
      title: '訂單編號',
      render: (o) => (
        <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
          {o.orderNumber || '—'}
        </Link>
      ),
    },
    { key: 'customerName', title: '購買人', render: (o) => o.customerName || '—' },
    { key: 'itemCount', title: '件數', render: (o) => `${safeNumber(o.itemCount)} 件` },
    {
      key: 'totalAmount',
      title: '總金額',
      render: (o) => <span className="font-semibold text-gray-800">{formatCurrency(o.totalAmount)}</span>,
    },
    {
      key: 'paymentStatus',
      title: '付款狀態',
      render: (o) => <PaymentStatusBadge status={o.paymentStatus} />,
    },
    {
      key: 'shippingMethod',
      title: '配送方式',
      render: (o) => (
        <span className="text-gray-700">
          {o.shippingMethod ? SHIPPING_METHOD_MAP[o.shippingMethod] ?? o.shippingMethod : '—'}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      title: '付款方式',
      render: (o) => (
        <span className="text-gray-700">
          {o.paymentMethod ? PAYMENT_METHOD_MAP[o.paymentMethod] ?? o.paymentMethod : '—'}
        </span>
      ),
    },
    { key: 'status', title: '處理狀態', render: (o) => <OrderStatusBadge status={o.status} /> },
    {
      key: 'createdAt',
      title: '建立時間',
      render: (o) => <span className="text-gray-500">{formatDateTime(o.createdAt)}</span>,
    },
    {
      key: 'actions',
      title: '操作',
      render: (o) => (
        <OrderStatusAction
          orderId={o.id}
          currentStatus={o.status}
          allowedTransitions={TRANSITIONS[o.status] ?? []}
          onUpdated={(next) => handleRowUpdated(o.id, next)}
        />
      ),
    },
  ];

  const hasActiveFilters = !!status || !!paymentStatus || !!shippingMethod || !!keyword.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        title="訂單管理"
        description={`共 ${total} 筆訂單`}
        actions={
          <Link
            href="/orders/live-manual/new"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            新增直播訂單
          </Link>
        }
      />

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s || 'ALL'}
              type="button"
              onClick={() => applyFilters({ status: s })}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                status === s
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s ? ORDER_STATUS_MAP[s]?.label ?? s : '全部訂單'}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters({ keyword });
          }}
          className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px_auto_auto]"
        >
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋訂單編號 / 購買人 / Email / 備註"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />

          <select
            value={paymentStatus}
            onChange={(e) => applyFilters({ paymentStatus: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {PAYMENT_STATUS_FILTERS.map((option) => (
              <option key={option.value || 'ALL_PAYMENT'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={shippingMethod}
            onChange={(e) => applyFilters({ shippingMethod: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {SHIPPING_METHOD_FILTERS.map((option) => (
              <option key={option.value || 'ALL_SHIPPING'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            搜尋
          </button>

          <button
            type="button"
            disabled={!hasActiveFilters}
            onClick={resetFilters}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            清除
          </button>
        </form>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchOrders} />}

      <DataTable
        columns={columns}
        data={orders}
        keyExtractor={(o) => o.id}
        isLoading={isLoading}
        emptyMessage="查無符合條件的訂單"
      />

      {totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} total={total} onPageChange={handlePageChange} />
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersContent />
    </Suspense>
  );
}
