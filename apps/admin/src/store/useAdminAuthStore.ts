'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════════
// 型別定義
// ═══════════════════════════════════════════════════════════════

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface AdminAuthState {
  user: AdminUser | null;
  token: string | null;
  isAuthenticated: boolean;

  login: (user: AdminUser, token: string) => void;
  logout: () => void;
}

// ═══════════════════════════════════════════════════════════════
// Store 實作
// ═══════════════════════════════════════════════════════════════

/**
 * useAdminAuthStore - 後台管理認證狀態
 *
 * 設計決策：
 * - 獨立於前台的 auth store（不同的 localStorage key）
 * - 僅允許 ADMIN / EDITOR 角色登入後台
 * - 登出時清除所有狀態並重導向至登入頁
 */
export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) =>
        set({ user, token, isAuthenticated: true }),

      logout: () =>
        set({ user: null, token: null, isAuthenticated: false }),
    }),
    {
      name: 'havoice-admin-auth',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/**
 * 取得後台 Authorization Header
 */
export function getAdminAuthHeader(): Record<string, string> {
  const token = useAdminAuthStore.getState().token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
