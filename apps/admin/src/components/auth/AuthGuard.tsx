'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

/**
 * AuthGuard - 後台路由守衛元件 (NextAuth.js 整合版)
 *
 * 設計決策：
 * - 使用 NextAuth useSession() 取代 Zustand persist 認證狀態
 * - 不再有 hydration 問題（NextAuth Session 由 SessionProvider 統一管理）
 * - 未登入 → 重導向至 /auth/login
 * - 角色不符 → 重導向至 /auth/forbidden
 * - 帳號停權 → 重導向至 /auth/login 並帶上 error 參數
 * - Session loading 期間顯示全螢幕 Loading 動畫
 *
 * 注意：此元件作為第二道防線（備援），
 * 主要的路由保護已由 middleware.ts 在 Edge Runtime 層級處理。
 */
export function AuthGuard({
  children,
  allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'EDITOR'],
}: AuthGuardProps) {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return;

    // 未登入
    if (status === 'unauthenticated' || !session) {
      router.replace('/auth/login');
      return;
    }

    // 帳號停權
    if (session.user.status === 'SUSPENDED') {
      router.replace('/auth/login?error=AccountSuspended');
      return;
    }

    // 角色不符
    if (!allowedRoles.includes(session.user.role)) {
      router.replace('/auth/forbidden');
      return;
    }
  }, [status, session, allowedRoles, router]);

  // Session 載入中
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600" />
          <p className="mt-4 text-sm text-gray-500">驗證身份中...</p>
        </div>
      </div>
    );
  }

  // 未認證或角色不符（等待重導向）
  if (
    status === 'unauthenticated' ||
    !session ||
    !allowedRoles.includes(session.user.role)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600" />
          <p className="mt-4 text-sm text-gray-500">重新導向中...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
