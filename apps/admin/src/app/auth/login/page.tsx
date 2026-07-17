'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * 後台管理系統登入頁面 - NextAuth.js 整合版
 *
 * 設計特色：
 * - 簡潔專業的深色主題設計
 * - 使用 NextAuth signIn('credentials') 進行認證
 * - 後台 auth-options 中已額外檢查角色（僅允許 ADMIN/EDITOR）
 * - 支援 callbackUrl 與 error 參數
 */
function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const errorParam = searchParams.get('error');

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(
    errorParam ? decodeErrorMessage(errorParam) : null
  );
  const [isLoading, setIsLoading] = useState(false);

  function decodeErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      CredentialsSignin: '電子郵件或密碼錯誤',
      AccountSuspended: '此帳號已被停權，請聯繫系統管理員',
    };
    return messages[code] || '登入時發生錯誤，請稍後再試';
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError('網路連線異常，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
      {/* 背景裝飾 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-brand-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* 品牌標誌 */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30">
            <span className="text-2xl font-bold text-white">J</span>
          </div>
          <h1 className="mt-5 text-xl font-bold text-white">快樂之音管理後台</h1>
          <p className="mt-2 text-sm text-gray-400">
            請使用管理員帳號登入
          </p>
        </div>

        {/* 登入卡片 */}
        <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-800/50 p-8 backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 錯誤提示 */}
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  {error}
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                電子郵件
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1.5 block w-full rounded-lg border border-gray-700 bg-gray-900/50 px-4 py-3 text-sm text-white transition-all placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="demo.admin@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                密碼
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="mt-1.5 block w-full rounded-lg border border-gray-700 bg-gray-900/50 px-4 py-3 text-sm text-white transition-all placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="請輸入密碼"
              />
            </div>

            {/* 提交按鈕 */}
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  驗證中...
                </>
              ) : (
                '登入管理後台'
              )}
            </button>
          </form>
        </div>

        {/* 底部提示 */}
        <p className="mt-6 text-center text-xs text-gray-500">
          僅限授權管理人員使用 · 所有操作均會被記錄
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginContent />
    </Suspense>
  );
}
