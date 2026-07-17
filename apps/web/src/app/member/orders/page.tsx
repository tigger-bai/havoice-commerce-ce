'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatPrice } from '@/lib/utils';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: string;
  itemCount: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待確認', color: 'bg-yellow-100 text-yellow-800' },
  CONFIRMED: { label: '已確認', color: 'bg-blue-100 text-blue-800' },
  PROCESSING: { label: '處理中', color: 'bg-indigo-100 text-indigo-800' },
  SHIPPED: { label: '已出貨', color: 'bg-purple-100 text-purple-800' },
  DELIVERED: { label: '已送達', color: 'bg-green-100 text-green-800' },
  CANCELLED: { label: '已取消', color: 'bg-red-100 text-red-800' },
  REFUNDED: { label: '已退款', color: 'bg-gray-100 text-gray-800' },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  UNPAID: { label: '未付款', color: 'text-orange-600' },
  PAID: { label: '已付款', color: 'text-green-600' },
  REFUNDED: { label: '已退款', color: 'text-gray-600' },
};

/**
 * 歷史訂單列表頁面
 *
 * 設計決策：
 * - 使用卡片式列表展示訂單（行動裝置友善）
 * - 每張卡片顯示：訂單編號、日期、金額、狀態、商品數量
 * - 點擊可進入訂單詳情頁
 * - 支援分頁載入
 */
export default function MemberOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchOrders = async (page: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/user/orders?page=${page}&limit=10`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || '取得訂單失敗');
      }

      setOrders(data.data);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message || '載入失敗');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(currentPage);
  }, [currentPage]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* 頁面標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">我的訂單</h2>
          <p className="mt-1 text-sm text-gray-500">
            查看您的歷史訂單與配送狀態
          </p>
        </div>
        {pagination && (
          <span className="text-sm text-gray-400">
            共 {pagination.total} 筆訂單
          </span>
        )}
      </div>

      {/* 載入狀態 */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-gray-100 bg-white p-6">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-6 w-16 rounded-full bg-gray-200" />
              </div>
              <div className="mt-4 h-3 w-48 rounded bg-gray-100" />
              <div className="mt-3 flex justify-between">
                <div className="h-4 w-24 rounded bg-gray-100" />
                <div className="h-5 w-20 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 錯誤狀態 */}
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => fetchOrders(currentPage)}
            className="mt-3 text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            重新載入
          </button>
        </div>
      )}

      {/* 空狀態 */}
      {!isLoading && !error && orders.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center">
          <svg className="mx-auto h-16 w-16 text-gray-200" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">尚無訂單</h3>
          <p className="mt-1 text-sm text-gray-500">快去商城逛逛吧！</p>
          <Link
            href="/shop"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700"
          >
            前往商城
          </Link>
        </div>
      )}

      {/* 訂單列表 */}
      {!isLoading && !error && orders.length > 0 && (
        <div className="space-y-4">
          {orders.map((order) => {
            const status = STATUS_MAP[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-800' };
            const paymentStatus = PAYMENT_STATUS_MAP[order.paymentStatus] || { label: order.paymentStatus, color: 'text-gray-600' };

            return (
              <Link
                key={order.id}
                href={`/member/orders/${order.id}`}
                className="group block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-brand-200 hover:shadow-md sm:p-6"
              >
                {/* 頂部：訂單編號 + 狀態 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-gray-900">
                      {order.orderNumber}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  <svg className="h-5 w-5 text-gray-300 transition-colors group-hover:text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>

                {/* 中間：日期與商品數 */}
                <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                    {formatDate(order.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                    </svg>
                    {order.itemCount} 件商品
                  </span>
                </div>

                {/* 底部：金額與付款狀態 */}
                <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-3">
                  <span className={`text-xs font-medium ${paymentStatus.color}`}>
                    {paymentStatus.label}
                  </span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatPrice(order.totalAmount)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* 分頁控制 */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            上一頁
          </button>

          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
            .filter((p) => {
              if (pagination.totalPages <= 5) return true;
              if (p === 1 || p === pagination.totalPages) return true;
              return Math.abs(p - currentPage) <= 1;
            })
            .reduce<(number | string)[]>((acc, p, i, arr) => {
              if (i > 0 && typeof arr[i - 1] === 'number' && p - (arr[i - 1] as number) > 1) {
                acc.push('...');
              }
              acc.push(p);
              return acc;
            }, [])
            .map((item, i) =>
              typeof item === 'string' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-400">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  onClick={() => setCurrentPage(item)}
                  className={`h-9 w-9 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === item
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {item}
                </button>
              )
            )}

          <button
            onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={currentPage === pagination.totalPages}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  );
}
