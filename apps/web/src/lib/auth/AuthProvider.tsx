'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

/**
 * NextAuth SessionProvider 包裝元件
 *
 * 必須在 Client Component 中使用 SessionProvider，
 * 以便子元件可以透過 useSession() Hook 取得登入狀態。
 *
 * 在 Root Layout 中包裝整個應用程式：
 * <AuthProvider>{children}</AuthProvider>
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
