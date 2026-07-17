'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════════
// 型別定義
// ═══════════════════════════════════════════════════════════════

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface AuthState {
  // 狀態
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // 動作
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

// ═══════════════════════════════════════════════════════════════
// Store 實作
// ═══════════════════════════════════════════════════════════════

/**
 * useAuthStore - 前台認證狀態管理
 *
 * 設計決策：
 * - 使用 persist 中間件將 user 與 token 持久化至 localStorage
 * - isLoading 不持久化（每次頁面載入時重新驗證 Token）
 * - 提供 getAuthHeader() 工具函式供 API 客戶端使用
 * - logout 時清除所有認證狀態
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // 初始狀態
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      // 登入：設定使用者資訊與 Token
      login: (user, token) =>
        set({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
        }),

      // 登出：清除所有認證狀態
      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        }),

      // 設定載入狀態
      setLoading: (loading) => set({ isLoading: loading }),

      // 部分更新使用者資訊
      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),
    }),
    {
      name: 'havoice-auth',
      storage: createJSONStorage(() => localStorage),
      // 僅持久化 user 與 token，不持久化 isLoading
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// ═══════════════════════════════════════════════════════════════
// 工具函式
// ═══════════════════════════════════════════════════════════════

/**
 * 取得 Authorization Header（供 API 客戶端使用）
 */
export function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
