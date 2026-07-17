'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect, useTransition } from 'react';

interface OrderListOption {
  id: string;
  orderNumber: string;
  customerName: string;
}

interface OrderItemSnapshot {
  id: string;
  productName: string;
  productPrice: number;
  quantity: number;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  totalAmount: number;
  shippingAddress: string;
  status: 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  createdAt: string;
  notes: string | null;
  user: {
    name: string | null;
    phone: string | null;
  };
  items: OrderItemSnapshot[];
}

interface OrderInspectorProps {
  initialOptions: OrderListOption[]; // 初始下拉選單簡短清單（可由 Server Component 預先撈取傳入）
}

export function OrderInspector({ initialOptions }: OrderInspectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // 從網址取得目前選定的 orderId
  const currentOrderId = searchParams.get('orderId') || '';

  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 監聽網址當中的 orderId 變化，動態向 API 撈取完整明細快照
  useEffect(() => {
    if (!currentOrderId) {
      setOrderDetail(null);
      return;
    }

    async function fetchOrderDetail() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/orders/${currentOrderId}`);
        if (!res.ok) throw new Error('撈取訂單明細失敗');
        const data = await res.json();
        setOrderDetail(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '未知的系統錯誤');
        setOrderDetail(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchOrderDetail();
  }, [currentOrderId]);

  // 下拉選單切換事件：動態更新 URL 參數
  const handleOrderChange = (orderId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (orderId) {
      params.set('orderId', orderId);
    } else {
      params.delete('orderId');
    }

    // 使用 useTransition 優化 Next.js 路由路由切換時的效能體驗
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* 頂部控制列 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900">直播歷史訂單精密檢視器</h1>
          <p className="text-sm text-gray-500 mt-1">選取訂單編號以即時連動完整關聯快照</p>
        </div>

        {/* 生產環境標準 Select 下拉選單 */}
        <div className="relative min-w-[280px]">
          <select
            id="order-select"
            value={currentOrderId}
            onChange={(e) => handleOrderChange(e.target.value)}
            disabled={isPending}
            className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/10 disabled:bg-gray-50"
          >
            <option value="">-- 請選擇歷史訂單 --</option>
            {initialOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.orderNumber} ({opt.customerName})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
      </div>

      {/* 下方明細渲染區塊 */}
      {isLoading ? (
        <OrderSkeleton />
      ) : error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 shadow-sm">
          ⚠️ 系統提示：{error}
        </div>
      ) : orderDetail ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
          {/* 左側：訂單核心資訊與品項快照 */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="border-b border-gray-50 bg-gray-50/50 px-6 py-4 flex items-center justify-between">
                <span className="text-sm font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-md">
                  單號：{orderDetail.orderNumber}
                </span>
                <span className="text-xs text-gray-400">
                  成交時間：{new Date(orderDetail.createdAt).toLocaleString('zh-TW')}
                </span>
              </div>

              {/* 商品表格快照 */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-500">
                  <thead className="bg-gray-50 text-xs text-gray-700 uppercase font-semibold">
                    <tr>
                      <th className="px-6 py-3">購買品項明細 (歷史快照)</th>
                      <th className="px-6 py-3 text-center">數量</th>
                      <th className="px-6 py-3 text-right">單價</th>
                      <th className="px-6 py-3 text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orderDetail.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{item.productName}</td>
                        <td className="px-6 py-4 text-center text-gray-700 font-medium">{item.quantity}</td>
                        <td className="px-6 py-4 text-right">NT$ {item.productPrice.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900">
                          NT$ {(item.productPrice * item.quantity).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 結帳總計總覽 */}
              <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/30 flex justify-end">
                <div className="text-right space-y-1">
                  <span className="text-xs text-gray-500 block">實付總金額 (Total Amount)</span>
                  <span className="text-xl font-black text-emerald-600">
                    NT$ {Number(orderDetail.totalAmount).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* 備註區塊 */}
            {orderDetail.notes && (
              <div className="bg-amber-50/60 rounded-xl border border-amber-100 p-4">
                <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider">備註欄 / 系統遷移註記</h4>
                <p className="text-sm text-amber-900 mt-1 whitespace-pre-line">{orderDetail.notes}</p>
              </div>
            )}
          </div>

          {/* 右側：客戶與物流照會資訊 */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">收件人與通訊照會</h3>
              
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-xs text-gray-400 block">客戶姓名</span>
                  <span className="font-semibold text-gray-800">{orderDetail.user.name || '未提供名稱'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block">聯絡電話</span>
                  <span className="font-mono text-gray-800">{orderDetail.user.phone || '未提供電話'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block">收件實體地址</span>
                  <span className="text-gray-700 leading-relaxed block mt-0.5">{orderDetail.shippingAddress}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center text-sm text-gray-400 bg-white">
          📭 尚未選取任何訂單，請從右上方選單挑選一筆歷史紀錄。
        </div>
      )}
    </div>
  );
}

// 骨架屏 Skeleton 元件，提供優雅的非同步過渡視覺
function OrderSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
      <div className="md:col-span-2 space-y-4">
        <div className="h-48 bg-gray-100 rounded-xl" />
        <div className="h-12 bg-gray-100 rounded-xl" />
      </div>
      <div className="h-48 bg-gray-100 rounded-xl" />
    </div>
  );
}