// apps/web/src/app/checkout/success/page.tsx
'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { formatPrice } from '@/lib/utils';

interface OrderInfo {
  orderNumber: string;
  totalAmount?: number | string;
  itemCount?: number;
  paymentMethod?: string;
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const urlOrderNo = searchParams.get('orderNo');

  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);

  useEffect(() => {
    if (urlOrderNo) {
      setOrderInfo({ orderNumber: urlOrderNo });
      return;
    }

    const stored = sessionStorage.getItem('lastOrder');
    if (stored) {
      try {
        setOrderInfo(JSON.parse(stored));
      } catch {
        // ignore parse error
      }
      sessionStorage.removeItem('lastOrder');
    }
  }, [urlOrderNo]);

  const display = useMemo(() => {
    if (!orderInfo) {
      return {
        title: '訂單已送出',
        description: '您可以前往會員中心查看訂單狀態。',
        boxTitle: '接下來會發生什麼？',
        items: ['我們將確認您的訂單資料', '您可以隨時在「我的訂單」中查看進度'],
      };
    }

    if (urlOrderNo) {
      return {
        title: '訂單已送出，付款狀態確認中',
        description: '如果您已完成付款，系統會在收到綠界付款通知後更新訂單狀態。',
        boxTitle: '付款後提醒',
        items: [
          '信用卡付款通常會較快完成狀態更新',
          'ATM 虛擬帳號需完成轉帳後才會更新為已付款',
          '若畫面未立即更新，請稍候再到「我的訂單」查看',
        ],
      };
    }

    if (orderInfo.paymentMethod === 'COD') {
      return {
        title: '訂單建立成功！',
        description: '您的訂單已建立，請等待店家確認與安排出貨。',
        boxTitle: '接下來會發生什麼？',
        items: ['我們將在 24 小時內確認您的訂單', '訂單確認後將安排出貨', '您可以隨時在「我的訂單」中查看進度'],
      };
    }

    return {
      title: '訂單已送出',
      description: '您可以前往會員中心查看訂單與付款狀態。',
      boxTitle: '接下來會發生什麼？',
      items: ['系統將確認您的訂單狀態', '付款完成後訂單會更新為已付款', '您可以隨時在「我的訂單」中查看進度'],
    };
  }, [orderInfo, urlOrderNo]);

  return (
    <div className="container-page flex flex-col items-center justify-center py-16 sm:py-24">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-green-100 opacity-75" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
      </div>

      <h1 className="mt-8 text-center text-2xl font-bold text-gray-900 sm:text-3xl">{display.title}</h1>
      <p className="mt-3 max-w-md text-center text-gray-600">{display.description}</p>

      {orderInfo && (
        <div className="mt-8 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500">訂單編號</span>
              <span className="break-all text-right font-mono text-sm font-semibold text-gray-900">{orderInfo.orderNumber}</span>
            </div>

            {orderInfo.itemCount && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">商品數量</span>
                <span className="text-sm font-medium text-gray-900">{orderInfo.itemCount} 件</span>
              </div>
            )}

            {orderInfo.totalAmount && (
              <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                <span className="text-sm font-medium text-gray-700">訂單金額</span>
                <span className="text-lg font-bold text-brand-600">{formatPrice(Number(orderInfo.totalAmount))}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 w-full max-w-md rounded-xl bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
            />
          </svg>
          <div className="text-sm text-blue-700">
            <p className="font-medium">{display.boxTitle}</p>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-blue-600">
              {display.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/member/orders"
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
        >
          查看我的訂單
        </Link>
        <Link href="/shop" className="btn-brand inline-flex items-center gap-2 px-6 py-3">
          繼續購物
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-gray-500">載入中...</div>}>
      <CheckoutSuccessContent />
    </Suspense>
  );
}