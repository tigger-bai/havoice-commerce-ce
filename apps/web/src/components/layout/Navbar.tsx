'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCartStore } from '@/store/useCartStore';
import { UserMenu } from './UserMenu';
import { cn } from '@/lib/utils';

const navLinks = [
  { label: '首頁', href: '/' },
  { label: '文章', href: '/articles' },
  { label: '商城', href: '/shop' },
];

/**
 * Navbar - 品牌導覽列
 *
 * 設計升級：
 * - 使用 usePathname 偵測當前路由，提供 active 視覺指示
 * - active 狀態使用品牌綠色文字 + 底部指示線
 * - 響應式設計：桌面水平導航 / 行動裝置下拉選單
 * - 購物車 badge 即時顯示商品數量
 * - 整合 NextAuth UserMenu（登入/未登入自動切換）
 */
export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { items, toggleDrawer } = useCartStore();
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  /**
   * 判斷導航連結是否為 active 狀態
   * - 首頁 (/): 僅完全匹配
   * - 其他頁面: 前綴匹配（如 /articles/xxx 也會高亮「文章」）
   */
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/80 backdrop-blur-lg">
      <nav className="container-page flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/20">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900">
            快樂之音
          </span>
        </Link>

        {/* 桌面導航連結 */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative rounded-lg px-4 py-2 text-sm font-medium transition-all',
                  active
                    ? 'text-brand-700 bg-brand-50'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {link.label}
                {/* Active 底部指示線 */}
                {active && (
                  <span className="absolute bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-brand-600" />
                )}
              </Link>
            );
          })}
        </div>

        {/* 右側操作區 */}
        <div className="flex items-center gap-3">
          {/* 購物車按鈕 */}
          <button
            type="button"
            onClick={toggleDrawer}
            className="relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            aria-label="購物車"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white shadow-sm">
                {totalItems > 99 ? '99+' : totalItems}
              </span>
            )}
          </button>

          {/* 會員選單（登入/未登入自動切換） */}
          <div className="hidden sm:block">
            <UserMenu />
          </div>

          {/* 行動裝置選單按鈕 */}
          <button
            type="button"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-50 md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="選單"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* 行動裝置選單 */}
      <div
        className={cn(
          'overflow-hidden border-t border-gray-100 bg-white transition-all duration-300 md:hidden',
          mobileMenuOpen ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0 border-t-0'
        )}
      >
        <div className="px-4 py-3">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'block rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
              >
                <span className="flex items-center gap-2">
                  {active && (
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                  )}
                  {link.label}
                </span>
              </Link>
            );
          })}
          {/* 行動裝置會員選單 */}
          <div className="mt-3 border-t border-gray-100 pt-3">
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
