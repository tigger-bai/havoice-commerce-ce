'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

import { ToastProvider } from '@/components/ui/Toast';

/**
 * 後台 NextAuth SessionProvider 包裝元件
 *
 * 同時注入全域 ToastProvider，讓所有後台頁面皆可使用 useToast() 進行互動回饋。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
