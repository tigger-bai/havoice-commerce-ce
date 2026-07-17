//apps/web/src/app/member/MemberSidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface MemberSidebarProps {
  userName: string;
  userEmail: string;
  userImage?: string;
}

const navItems = [
  {
    href: '/member',
    label: '個人資料',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
    exact: true,
  },
  {
    href: '/member/orders',
    label: '我的訂單',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    exact: false,
  },
];

/**
 * 會員中心子導覽列
 *
 * 設計決策：
 * - 桌面版：左側固定寬度卡片式導覽
 * - 行動版：水平滾動 Tab 導覽
 * - 使用 usePathname 偵測 active 狀態
 * - 頂部顯示使用者頭像與基本資訊
 */
export function MemberSidebar({ userName, userEmail, userImage }: MemberSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <nav className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* 使用者資訊卡片 */}
      <div className="border-b border-gray-100 bg-gradient-to-br from-brand-50 to-green-50 p-5">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-brand-100 ring-2 ring-white">
            {userImage ? (
              <img
                src={userImage}
                alt={userName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-bold text-brand-600">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{userName}</p>
            <p className="truncate text-xs text-gray-500">{userEmail}</p>
          </div>
        </div>
      </div>

      {/* 桌面版：垂直導覽列表 */}
      <div className="hidden p-2 lg:block">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span className={cn(active ? 'text-brand-600' : 'text-gray-400')}>
                {item.icon}
              </span>
              {item.label}
              {active && (
                <span className="ml-auto h-2 w-2 rounded-full bg-brand-500" />
              )}
            </Link>
          );
        })}
      </div>

      {/* 行動版：水平 Tab 導覽 */}
      <div className="flex border-t border-gray-100 lg:hidden">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
                active
                  ? 'border-b-2 border-brand-500 text-brand-700'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <span className={cn(active ? 'text-brand-600' : 'text-gray-400')}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
