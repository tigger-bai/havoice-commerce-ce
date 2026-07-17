import Link from 'next/link';

import { SUPPORT_EMAIL } from '@/config/public';

export function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-gray-50">
      <div className="container-page py-12">
        <div className="grid gap-8 md:grid-cols-4">
          {/* 品牌區 */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                </svg>
              </div>
              <span className="text-base font-bold text-gray-900">快樂之音</span>
            </div>
            <p className="mt-3 text-sm text-gray-500">
              結合優質內容與精選商品的生活風格平台，讓每一天都充滿快樂的旋律。
            </p>
          </div>

          {/* 快速連結 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">探索</h4>
            <ul className="mt-3 space-y-2">
              <li><Link href="/articles" className="text-sm text-gray-500 hover:text-brand-600">精選文章</Link></li>
              <li><Link href="/shop" className="text-sm text-gray-500 hover:text-brand-600">商品商城</Link></li>
            </ul>
          </div>

          {/* 客戶服務 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">客戶服務</h4>
            <ul className="mt-3 space-y-2">
              <li><Link href="/checkout" className="text-sm text-gray-500 hover:text-brand-600">訂單查詢</Link></li>
              <li><span className="text-sm text-gray-500">退換貨政策</span></li>
              <li><span className="text-sm text-gray-500">隱私權政策</span></li>
            </ul>
          </div>

          {/* 聯絡資訊 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">聯絡我們</h4>
            <ul className="mt-3 space-y-2">
              <li className="text-sm text-gray-500">{SUPPORT_EMAIL}</li>
              <li className="text-sm text-gray-500">02-2345-6789</li>
              <li className="text-sm text-gray-500">週一至週五 09:00 - 18:00</li>
            </ul>
          </div>
        </div>

        {/* 版權資訊 */}
        <div className="mt-10 border-t border-gray-200 pt-6">
          <p className="text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} 快樂之音 Joyful Voice. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
