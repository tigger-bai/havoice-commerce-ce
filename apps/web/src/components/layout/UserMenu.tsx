// apps/web/src/components/layout/UserMenu.tsx
'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useState, useRef, useEffect, KeyboardEvent } from 'react';

/**
 * UserMenu - 導覽列使用者選單元件
 */
export function UserMenu() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 點擊外部關閉選單
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    // 支援 Escape 鍵關閉選單 (無障礙設計)
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Loading 狀態
  if (status === 'loading') {
    return (
      <div 
        className="h-8 w-8 animate-pulse rounded-full bg-gray-200" 
        aria-hidden="true"
      />
    );
  }

  // 未登入狀態
  if (status === 'unauthenticated' || !session) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/auth/login"
          className="text-sm font-medium text-gray-600 transition-colors hover:text-brand-600"
        >
          登入
        </Link>
        <Link
          href="/auth/register"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/25"
        >
          免費註冊
        </Link>
      </div>
    );
  }

  // 已登入狀態
  const initials = session.user.name
    ? session.user.name.charAt(0).toUpperCase()
    : session.user.email?.charAt(0).toUpperCase() || 'U';

  // 由於已經定義了 next-auth.d.ts，這裡可以直接取得 role 而不會報錯
  const userRole = session.user.role;
  const isAdminOrVendor = userRole && ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VENDOR'].includes(userRole);
  
  // 透過環境變數取得管理後台 URL；localhost fallback 僅限開發環境。
  const adminUrl =
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    (process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : '');

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="開啟使用者選單"
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white p-1 pr-3 transition-all hover:border-brand-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {initials}
        </div>
        <span className="hidden text-sm font-medium text-gray-700 sm:block">
          {session.user.name || '會員'}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* 下拉選單 */}
      {isOpen && (
        <div 
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-gray-100 bg-white py-2 shadow-xl shadow-gray-200/50 focus:outline-none"
        >
          {/* 使用者資訊 */}
          <div className="border-b border-gray-100 px-4 py-3" role="none">
            <p className="text-sm font-medium text-gray-900 truncate" role="none">
              {session.user.name || '會員'}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 truncate" role="none">
              {session.user.email}
            </p>
          </div>

          {/* 選單項目 */}
          <div className="py-1" role="none">
            <Link
              href="/member"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            >
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
              </svg>
              我的帳號
            </Link>
            <Link
              href="/orders"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            >
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
              </svg>
              我的訂單
            </Link>

            {/* 後台管理員捷徑 */}
            {isAdminOrVendor && adminUrl && (
              <a 
                href={adminUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                role="menuitem"
                onClick={() => setIsOpen(false)} 
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-emerald-600 font-medium transition-colors hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none"
              >
                <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                進入管理後台
              </a>
            )}
          </div>

          {/* 登出 */}
          <div className="border-t border-gray-100 pt-1" role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                signOut({ callbackUrl: '/' });
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 focus:bg-red-50 focus:outline-none"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              登出
            </button>
          </div>
        </div>
      )}
    </div>
  );
}