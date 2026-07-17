'use client';

import Link from 'next/link';
import { useCartStore } from '@/store/useCartStore';
import { formatPrice } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * CartDrawer - 購物車側邊欄
 *
 * 設計決策：
 * - 從右側優雅滑入，搭配半透明遮罩
 * - 即時顯示商品清單、數量調整與小計金額
 * - 提供「前往結帳」按鈕跳轉至結帳頁面
 */
export function CartDrawer() {
  const { items, isDrawerOpen, toggleDrawer, updateQuantity, removeItem, getTotalPrice } = useCartStore();

  return (
    <>
      {/* 遮罩層 */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={toggleDrawer}
        />
      )}

      {/* 側邊欄本體 */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out',
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* 標題列 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">
            購物車
            {items.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({items.reduce((sum, i) => sum + i.quantity, 0)} 件商品)
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={toggleDrawer}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="關閉購物車"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 商品清單 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <svg className="h-16 w-16 text-gray-200" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              <p className="mt-4 text-sm text-gray-500">購物車是空的</p>
              <button
                type="button"
                onClick={toggleDrawer}
                className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                繼續購物
              </button>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="flex gap-4 rounded-xl border border-gray-100 p-3"
                >
                  {/* 商品圖片 */}
                  <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    <img
                      src={item.coverImage}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23e5e7eb"><rect width="24" height="24"/></svg>';
                      }}
                    />
                  </div>

                  {/* 商品資訊 */}
                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 line-clamp-1">
                        {item.name}
                      </h3>
                      <p className="mt-0.5 text-sm font-semibold text-brand-600">
                        {formatPrice(item.price)}
                      </p>
                    </div>

                    {/* 數量控制 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                          </svg>
                        </button>
                        <span className="min-w-[24px] text-center text-sm font-medium">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        </button>
                      </div>

                      {/* 移除按鈕 */}
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        className="text-xs text-gray-400 hover:text-red-500"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 底部結帳區 */}
        {items.length > 0 && (
          <div className="border-t border-gray-100 px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-500">小計</span>
              <span className="text-lg font-bold text-gray-900">
                {formatPrice(getTotalPrice())}
              </span>
            </div>
            <Link
              href="/checkout"
              onClick={toggleDrawer}
              className="btn-brand w-full text-center"
            >
              前往結帳
            </Link>
            <p className="mt-2 text-center text-xs text-gray-400">
              運費將於結帳時計算
            </p>
          </div>
        )}
      </div>
    </>
  );
}
