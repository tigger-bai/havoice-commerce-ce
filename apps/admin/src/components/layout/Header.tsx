'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Breadcrumbs } from './Breadcrumbs';

/**
 * Header - 後台頂部列
 *
 * 設計決策：
 * - 左側：行動裝置選單按鈕 + 麵包屑導覽
 * - 右側：useSession 取得管理員名稱/角色 + 頭像下拉選單（登出）
 * - 防禦性處理：session 載入中或缺欄位時顯示安全 fallback
 */

interface HeaderProps {
  onMenuToggle: () => void;
}

/** 角色中文對照 */
const ROLE_LABELS: Record<string, string> = {
  ADMIN: '系統管理員',
  EDITOR: '內容編輯',
  USER: '一般使用者',
};

export function Header({ onMenuToggle }: HeaderProps) {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 點擊外部關閉下拉選單
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 防禦性取值
  const userName = session?.user?.name || session?.user?.email || '管理員';
  const userRole = (session?.user as { role?: string } | undefined)?.role || '';
  const roleLabel = ROLE_LABELS[userRole] || '管理人員';
  const avatarChar = userName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm lg:px-6">
      {/* 左側：選單按鈕 + 麵包屑 */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 lg:hidden"
          aria-label="開啟選單"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <div className="hidden sm:block">
          <Breadcrumbs />
        </div>
      </div>

      {/* 右側：使用者選單 */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-gray-100"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
            {status === 'loading' ? '…' : avatarChar}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-semibold text-gray-800">{userName}</p>
            <p className="text-xs text-gray-500">{roleLabel}</p>
          </div>
          <svg className="hidden h-4 w-4 text-gray-400 sm:block" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {/* 下拉選單 */}
        {menuOpen && (
          <div className="animate-fade-in absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="truncate text-sm font-semibold text-gray-800">{userName}</p>
              <p className="truncate text-xs text-gray-500">{session?.user?.email || '—'}</p>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/auth/login' })}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              登出
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
