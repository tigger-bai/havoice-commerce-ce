'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorAlert, PageHeader } from '@/components/ui/LoadingAndError';
import { Pagination } from '@/components/ui/Pagination';
import { formatDateTime, safeNumber } from '@/lib/utils';

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  facebookName: string | null;
  lineId: string | null;
  postalCode: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  source: string | null;
  updatedAt: string;
  orderCount: number;
  lastOrderAt: string | null;
}

function getApiErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback;
  const error = (json as { error?: { message?: unknown } }).error;
  return typeof error?.message === 'string' && error.message.trim() ? error.message : fallback;
}

function CustomersContent() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (keyword.trim()) params.set('keyword', keyword.trim());

      const res = await fetch(`/api/customers?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(getApiErrorMessage(json, '載入直播客戶失敗'));
      }

      setCustomers(Array.isArray(json.data?.items) ? json.data.items : []);
      setTotal(safeNumber(json.data?.pagination?.total));
      setTotalPages(safeNumber(json.data?.pagination?.totalPages) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入直播客戶失敗');
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }, [keyword, page]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const columns: Column<CustomerRow>[] = [
    {
      key: 'customer',
      title: '客戶',
      render: (customer) => (
        <div>
          <Link href={`/customers/${customer.id}`} className="font-medium text-gray-900 hover:text-brand-700 hover:underline">
            {customer.name}
          </Link>
          <div className="mt-1 text-xs text-gray-500">
            {[customer.phone, customer.email].filter(Boolean).join(' / ') || '無聯絡資料'}
          </div>
        </div>
      ),
    },
    {
      key: 'social',
      title: '社群',
      render: (customer) => (
        <span className="text-gray-600">
          {[customer.facebookName, customer.lineId].filter(Boolean).join(' / ') || '—'}
        </span>
      ),
    },
    {
      key: 'address',
      title: '地址',
      render: (customer) => (
        <span className="block max-w-md truncate text-gray-600">
          {[customer.postalCode, customer.city, customer.district, customer.address].filter(Boolean).join(' ') || '—'}
        </span>
      ),
    },
    {
      key: 'source',
      title: '來源',
      render: (customer) => (
        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {customer.source || '—'}
        </span>
      ),
    },
    {
      key: 'orderCount',
      title: '累積訂單',
      render: (customer) => <span className="font-medium text-gray-900">{customer.orderCount}</span>,
    },
    {
      key: 'lastOrderAt',
      title: '最近下單',
      render: (customer) => <span className="text-gray-500">{formatDateTime(customer.lastOrderAt)}</span>,
    },
    {
      key: 'updatedAt',
      title: '更新時間',
      render: (customer) => <span className="text-gray-500">{formatDateTime(customer.updatedAt)}</span>,
    },
    {
      key: 'actions',
      title: '操作',
      render: (customer) => (
        <Link
          href={`/customers/${customer.id}`}
          className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          詳情 / 編輯
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="直播客戶"
        description={`共 ${total} 位客戶。Customer 不具備前台登入能力，僅供直播人工建單與營運追蹤。`}
        actions={
          <Link
            href="/orders/live-manual/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500"
          >
            新增直播訂單
          </Link>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-end">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            fetchCustomers();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜尋姓名 / 電話 / Email / Facebook / LINE / 地址"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-96"
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-800 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            搜尋
          </button>
        </form>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchCustomers} />}

      <DataTable
        columns={columns}
        data={customers}
        keyExtractor={(customer) => customer.id}
        isLoading={isLoading}
        emptyMessage="查無符合條件的直播客戶"
      />

      {totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersContent />
    </Suspense>
  );
}
