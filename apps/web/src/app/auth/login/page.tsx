'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

/**
 * 前台登入頁面 - NextAuth.js 整合版
 *
 * 使用 NextAuth signIn('credentials', { redirect: false }) 進行登入：
 * - 登入成功 → 重導向至 callbackUrl 或首頁
 * - 登入失敗 → 顯示友善的錯誤訊息
 * - 支援 URL 參數中的 error 與 callbackUrl
 */
function LoginForm() {
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
      AccountSuspended: '此帳號已被停權，請聯繫客服',
      OAuthAccountNotLinked: '此電子郵件已使用其他方式註冊',
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
        // NextAuth 回傳的 error 是 authorize() 中 throw 的 Error message
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
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* 品牌標誌 */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
              <span className="text-lg font-bold text-white">J</span>
            </div>
            <span className="text-xl font-bold text-gray-900">快樂之音</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">歡迎回來</h1>
          <p className="mt-2 text-sm text-gray-500">
            登入您的帳號，繼續探索健康生活
          </p>
        </div>

        {/* 登入表單 */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {/* 錯誤提示 */}
          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
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
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              電子郵件
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="your@email.com"
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                密碼
              </label>
              <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                忘記密碼？
              </button>
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="請輸入密碼"
            />
          </div>

          {/* 提交按鈕 */}
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-700 hover:shadow-xl hover:shadow-brand-600/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                登入中...
              </>
            ) : (
              '登入'
            )}
          </button>
        </form>

        {/* 分隔線 */}
        <div className="relative mt-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-4 text-gray-400">或</span>
          </div>
        </div>

        {/* 註冊連結 */}
        <p className="mt-6 text-center text-sm text-gray-500">
          還沒有帳號？{' '}
          <Link href="/auth/register" className="font-semibold text-brand-600 hover:text-brand-700">
            立即免費註冊
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * 登入頁進入點
 *
 * 因 LoginForm 使用 useSearchParams()，依 Next.js 14 規範必須包在 Suspense
 * boundary 中，否則於 prerender / 靜態輸出時會觸發 CSR bailout 錯誤。
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
