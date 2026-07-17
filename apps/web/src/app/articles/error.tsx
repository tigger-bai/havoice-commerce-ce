'use client';

import { useEffect } from 'react';

/**
 * 文章列表頁 Error Boundary
 *
 * Next.js App Router 的 error.tsx 會自動捕獲同層級 page.tsx 中的未處理錯誤。
 * 必須是 Client Component ('use client')。
 * 提供友善的錯誤訊息與重試按鈕。
 */
export default function ArticlesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 在生產環境中可接入 Sentry 等錯誤追蹤服務
    console.error('[ArticlesPage Error]:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 保持與正常頁面一致的 Hero 區塊 */}
      <section className="bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 pb-16 pt-24">
        <div className="container-page text-center">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            健康知識文章
          </h1>
        </div>
      </section>

      {/* 錯誤訊息區塊 */}
      <div className="container-page -mt-8">
        <div className="rounded-2xl bg-white p-12 text-center shadow-lg shadow-gray-200/50">
          {/* 錯誤圖示 */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>

          {/* 錯誤訊息 */}
          <h2 className="mt-5 text-xl font-semibold text-gray-900">
            載入文章時發生錯誤
          </h2>
          <p className="mt-2 text-gray-500">
            很抱歉，我們暫時無法載入文章列表。這可能是網路連線問題或伺服器暫時無法回應。
          </p>

          {/* 操作按鈕 */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-700 hover:shadow-xl"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
              </svg>
              重新載入
            </button>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-full border-2 border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:border-brand-300 hover:text-brand-700"
            >
              返回首頁
            </a>
          </div>

          {/* 錯誤摘要（開發環境顯示） */}
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-8 text-left">
              <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-600">
                開發者錯誤詳情
              </summary>
              <pre className="mt-2 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-red-600">
                {error.message}
                {error.digest && `\nDigest: ${error.digest}`}
              </pre>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}
