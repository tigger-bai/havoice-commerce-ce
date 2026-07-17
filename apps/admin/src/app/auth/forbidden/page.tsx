'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';

/**
 * 403 Forbidden 頁面
 *
 * 當使用者已登入但角色不符合後台存取權限時顯示。
 * 提供「登出並切換帳號」與「返回前台」兩個操作選項。
 */
export default function ForbiddenPage() {
  const webUrl =
    process.env.NEXT_PUBLIC_WEB_URL ||
    (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '/');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        {/* 禁止圖示 */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
          <svg
            className="h-10 w-10 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-gray-900">
          存取權限不足
        </h1>
        <p className="mt-3 text-gray-500">
          您的帳號沒有管理後台的存取權限。如果您認為這是一個錯誤，請聯繫系統管理員。
        </p>

        {/* 操作按鈕 */}
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/auth/login' })}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          >
            登出並切換帳號
          </button>
          <Link
            href={webUrl}
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            返回前台網站
          </Link>
        </div>
      </div>
    </div>
  );
}
