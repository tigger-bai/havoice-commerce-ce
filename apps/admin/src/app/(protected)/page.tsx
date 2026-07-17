'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

import { StatCard } from '@/components/dashboard/StatCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/OrderBadges';
import { ErrorAlert } from '@/components/ui/LoadingAndError';
import { formatCurrency, formatDateTime, safeNumber } from '@/lib/utils';

/**
 * 營運總覽儀表板（URL: /）
 *
 * - 上方：核心指標卡（總營收 / 總訂單 / 待處理 / 會員數 / 庫存警報）
 * - 下方：最新 5 筆待處理訂單快速檢視表
 *
 * 防禦性：所有數值以 safeNumber 處理；API 失敗顯示友善錯誤並可重試
 */

interface DashboardMetrics {
  totalRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  totalMembers: number;
  lowStockCount: number;
}

interface PendingOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  customerName: string;
  itemCount: number;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入儀表板資料失敗');
      }
      setMetrics(json.data?.metrics ?? null);
      setPendingOrders(Array.isArray(json.data?.recentPendingOrders) ? json.data.recentPendingOrders : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns: Column<PendingOrder>[] = [
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
      title: '金額',
      render: (o) => <span className="font-semibold text-gray-800">{formatCurrency(o.totalAmount)}</span>,
    },
    { key: 'paymentStatus', title: '付款', render: (o) => <PaymentStatusBadge status={o.paymentStatus} /> },
    { key: 'status', title: '狀態', render: (o) => <OrderStatusBadge status={o.status} /> },
    { key: 'createdAt', title: '建立時間', render: (o) => <span className="text-gray-500">{formatDateTime(o.createdAt)}</span> },
  ];

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">營運總覽</h1>
          <p className="mt-1 text-sm text-gray-500">即時掌握平台營收、訂單與庫存狀況</p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          重新整理
        </button>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchData} />}

      {/* 指標卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="總營收（已付款）"
          value={isLoading ? '—' : formatCurrency(metrics?.totalRevenue)}
          accent="positive"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
        />
        <StatCard
          title="總訂單數"
          value={isLoading ? '—' : String(safeNumber(metrics?.totalOrders))}
          accent="info"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" /></svg>}
        />
        <StatCard
          title="待處理訂單"
          value={isLoading ? '—' : String(safeNumber(metrics?.pendingOrders))}
          accent="warning"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
        />
        <StatCard
          title="註冊會員總數"
          value={isLoading ? '—' : String(safeNumber(metrics?.totalMembers))}
          accent="neutral"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>}
        />
        <StatCard
          title="庫存警報"
          hint="庫存低於 10 件"
          value={isLoading ? '—' : `${safeNumber(metrics?.lowStockCount)} 項`}
          accent="warning"
          highlight={!isLoading && safeNumber(metrics?.lowStockCount) > 0}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>}
        />
      </div>

      {/* 待處理訂單快速檢視 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">最新待處理訂單</h2>
          <Link href="/orders?status=PENDING" className="text-sm font-medium text-brand-700 hover:underline">
            查看全部 →
          </Link>
        </div>
        <DataTable
          columns={columns}
          data={pendingOrders}
          keyExtractor={(o) => o.id}
          isLoading={isLoading}
          emptyMessage="目前沒有待處理的訂單"
        />
      </section>
    </div>
  );
}
