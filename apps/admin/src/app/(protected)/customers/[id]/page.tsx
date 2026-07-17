'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ErrorAlert, LoadingSpinner, PageHeader } from '@/components/ui/LoadingAndError';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDateTime } from '@/lib/utils';

interface CustomerFormState {
  name: string;
  phone: string;
  email: string;
  facebookName: string;
  lineId: string;
  postalCode: string;
  city: string;
  district: string;
  address: string;
  remark: string;
  source: string;
}

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

interface CustomerDetailResponse extends CustomerFormState {
  id: string;
  createdAt: string;
  updatedAt: string;
  ordersSummary?: OrderSummary;
  recentOrders?: RecentOrder[];
}

const inputClass =
  'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400';
const labelClass = 'block text-sm font-medium text-gray-700';

function getApiErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback;
  const error = (json as { error?: { message?: unknown } }).error;
  return typeof error?.message === 'string' && error.message.trim() ? error.message : fallback;
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

function toFormState(customer: CustomerDetailResponse): CustomerFormState {
  return {
    name: customer.name ?? '',
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    facebookName: customer.facebookName ?? '',
    lineId: customer.lineId ?? '',
    postalCode: customer.postalCode ?? '',
    city: customer.city ?? '',
    district: customer.district ?? '',
    address: customer.address ?? '',
    remark: customer.remark ?? '',
    source: customer.source ?? '',
  };
}

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const { toast } = useToast();

  const [form, setForm] = useState<CustomerFormState | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [orderSummary, setOrderSummary] = useState<OrderSummary>({
    totalOrders: 0,
    totalAmount: 0,
    lastOrderAt: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${id}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(getApiErrorMessage(json, '載入客戶資料失敗'));
      }

      const customer = json.data as CustomerDetailResponse;
      setForm(toFormState(customer));
      setCustomerName(customer.name ?? '');
      setCreatedAt(customer.createdAt ?? null);
      setUpdatedAt(customer.updatedAt ?? null);
      setRecentOrders(Array.isArray(customer.recentOrders) ? customer.recentOrders : []);
      setOrderSummary({
        totalOrders: Number(customer.ordersSummary?.totalOrders) || 0,
        totalAmount: Number(customer.ordersSummary?.totalAmount) || 0,
        lastOrderAt: customer.ordersSummary?.lastOrderAt ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入客戶資料失敗');
      setForm(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  const updateField = (field: keyof CustomerFormState, value: string) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSave = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      toast.error('請輸入客戶姓名');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: normalizeOptional(form.phone),
          email: normalizeOptional(form.email),
          facebookName: normalizeOptional(form.facebookName),
          lineId: normalizeOptional(form.lineId),
          postalCode: normalizeOptional(form.postalCode),
          city: normalizeOptional(form.city),
          district: normalizeOptional(form.district),
          address: normalizeOptional(form.address),
          remark: normalizeOptional(form.remark),
          source: normalizeOptional(form.source),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(getApiErrorMessage(json, '更新客戶資料失敗'));
      }

      const updated = json.data as CustomerDetailResponse;
      setForm(toFormState(updated));
      setCustomerName(updated.name ?? '');
      setCreatedAt(updated.createdAt ?? createdAt);
      setUpdatedAt(updated.updatedAt ?? updatedAt);
      toast.success('客戶資料已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新客戶資料失敗');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/customers" className="transition-colors hover:text-gray-600">
          直播客戶
        </Link>
        <span>/</span>
        <span className="text-gray-700">詳情 / 編輯</span>
      </nav>

      <PageHeader
        title="直播客戶詳情"
        description={customerName ? `正在編輯：${customerName}` : '管理直播人工建單客戶資料'}
        actions={
          <Link
            href="/orders/live-manual/new"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            新增直播訂單
          </Link>
        }
      />

      {isLoading && <LoadingSpinner message="載入客戶資料中..." />}
      {!isLoading && error && <ErrorAlert message={error} onRetry={fetchCustomer} />}

      {!isLoading && !error && form && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">客戶資料</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="name" className={labelClass}>
                    姓名 <span className="text-rose-500">*</span>
                  </label>
                  <input id="name" value={form.name} onChange={(event) => updateField('name', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="phone" className={labelClass}>
                    電話
                  </label>
                  <input id="phone" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="email" className={labelClass}>
                    Email
                  </label>
                  <input id="email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="facebookName" className={labelClass}>
                    Facebook 名稱
                  </label>
                  <input id="facebookName" value={form.facebookName} onChange={(event) => updateField('facebookName', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="lineId" className={labelClass}>
                    LINE ID
                  </label>
                  <input id="lineId" value={form.lineId} onChange={(event) => updateField('lineId', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="source" className={labelClass}>
                    來源
                  </label>
                  <input id="source" value={form.source} onChange={(event) => updateField('source', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="postalCode" className={labelClass}>
                    郵遞區號
                  </label>
                  <input id="postalCode" value={form.postalCode} onChange={(event) => updateField('postalCode', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="city" className={labelClass}>
                    縣市
                  </label>
                  <input id="city" value={form.city} onChange={(event) => updateField('city', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="district" className={labelClass}>
                    鄉鎮市區
                  </label>
                  <input id="district" value={form.district} onChange={(event) => updateField('district', event.target.value)} className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="address" className={labelClass}>
                    地址
                  </label>
                  <textarea id="address" value={form.address} onChange={(event) => updateField('address', event.target.value)} className={`${inputClass} min-h-24 resize-y`} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="remark" className={labelClass}>
                    備註
                  </label>
                  <textarea id="remark" value={form.remark} onChange={(event) => updateField('remark', event.target.value)} className={`${inputClass} min-h-28 resize-y`} />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Link href="/customers" className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                  返回列表
                </Link>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? '儲存中...' : '儲存變更'}
                </button>
              </div>
            </section>

            <aside className="space-y-6">
              <section className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="mb-4 text-sm font-semibold text-gray-900">系統資訊</h2>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-gray-500">建立時間</dt>
                    <dd className="mt-1 font-medium text-gray-900">{formatDateTime(createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">最後更新</dt>
                    <dd className="mt-1 font-medium text-gray-900">{formatDateTime(updatedAt)}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="mb-4 text-sm font-semibold text-gray-900">訂單摘要</h2>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-gray-500">累積訂單數</dt>
                    <dd className="mt-1 font-semibold text-gray-900">{orderSummary.totalOrders}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">累積消費金額</dt>
                    <dd className="mt-1 font-semibold text-gray-900">{formatCurrency(orderSummary.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">最後下單時間</dt>
                    <dd className="mt-1 font-semibold text-gray-900">{formatDateTime(orderSummary.lastOrderAt)}</dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>

          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-900">最近直播訂單</h2>
            <p className="mt-1 text-sm text-gray-500">顯示此 Customer 最近 10 筆人工建單紀錄。</p>

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
                          尚無直播訂單紀錄
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
        </>
      )}
    </div>
  );
}
