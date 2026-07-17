'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { PageHeader, LoadingSpinner, ErrorAlert } from '@/components/ui/LoadingAndError';
import { UserForm, type UserFormInitialData } from '@/components/users/UserForm';
import { formatCurrency, formatDateTime } from '@/lib/utils';

interface RecentOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  shippingMethod: string | null;
  totalAmount: number;
}

interface OrderSummary {
  totalOrders: number;
  totalAmount: number;
  lastOrderAt: string | null;
}

function getPaymentMethodLabel(method: string | null): string {
  if (method === 'CREDIT_CARD') return '信用卡';
  if (method === 'ATM') return 'ATM';
  if (method === 'COD') return '貨到付款';
  if (method === 'BANK_TRANSFER') return '匯款';
  if (method === 'CASH') return '現金';
  if (method === 'MONTHLY_SETTLEMENT') return '月結';
  if (method === 'POST_OFFICE_COD') return '貨到付款';
  if (method === 'OTHER') return '其他';
  return method || '—';
}

/**
 * 編輯會員頁 /users/[id]
 * 先以 GET /api/users/[id] 取得資料供表單預填
 * 防禦：載入中顯示骨架/spinner，找不到 / 錯誤顯示 ErrorAlert
 */
export default function EditUserPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [data, setData] = useState<UserFormInitialData | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [orderSummary, setOrderSummary] = useState<OrderSummary>({
    totalOrders: 0,
    totalAmount: 0,
    lastOrderAt: null,
  });
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${id}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入會員資料失敗');
      }
      const u = json.data;
      setUserName(u.name ?? u.email ?? '');
      setData({
        id: u.id,
        name: u.name ?? '',
        email: u.email ?? '',
        role: (u.role as UserFormInitialData['role']) ?? 'USER',
        status: (u.status as UserFormInitialData['status']) ?? 'ACTIVE',
        image: u.image ?? '',
        phone: u.phone ?? '',
        address: u.address ?? '',
        remark: u.remark ?? '',
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      });
      setRecentOrders(Array.isArray(u.recentOrders) ? u.recentOrders : []);
      setOrderSummary({
        totalOrders: Number(u.ordersSummary?.totalOrders) || 0,
        totalAmount: Number(u.ordersSummary?.totalAmount) || 0,
        lastOrderAt: u.ordersSummary?.lastOrderAt ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <div className="space-y-6">
      {/* 麵包屑 */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/users" className="transition-colors hover:text-gray-600">
          商城會員
        </Link>
        <span>/</span>
        <span className="text-gray-700">編輯會員</span>
      </nav>

      <PageHeader title="編輯商城會員" description={userName ? `正在編輯：${userName}` : '修改會員資訊'} />

      {isLoading && <LoadingSpinner message="載入會員資料中..." />}

      {!isLoading && error && <ErrorAlert message={error} onRetry={fetchUser} />}

      {!isLoading && !error && data && (
        <div className="space-y-6">
          <UserForm mode="edit" userId={id} initialData={data} />

          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">最近訂單</h2>
                <p className="mt-1 text-sm text-gray-500">顯示此商城會員最近 10 筆前台訂單。</p>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <dt className="text-xs text-gray-500">累積訂單數</dt>
                  <dd className="mt-1 font-semibold text-gray-900">{orderSummary.totalOrders}</dd>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <dt className="text-xs text-gray-500">累積消費金額</dt>
                  <dd className="mt-1 font-semibold text-gray-900">{formatCurrency(orderSummary.totalAmount)}</dd>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <dt className="text-xs text-gray-500">最後下單時間</dt>
                  <dd className="mt-1 font-semibold text-gray-900">{formatDateTime(orderSummary.lastOrderAt)}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-5 overflow-hidden rounded-lg border border-gray-200">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">訂單編號</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">建立時間</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">訂單狀態</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">付款狀態</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">付款方式</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">物流方式</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                          尚無訂單紀錄
                        </td>
                      </tr>
                    ) : (
                      recentOrders.map((order) => (
                        <tr key={order.id}>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Link href={`/orders/${order.id}`} className="font-medium text-brand-700 hover:underline">
                              {order.orderNumber}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDateTime(order.createdAt)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">{order.status}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">{order.paymentStatus}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                            {getPaymentMethodLabel(order.paymentMethod)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">{order.shippingMethod || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-gray-900">
                            {formatCurrency(order.totalAmount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
