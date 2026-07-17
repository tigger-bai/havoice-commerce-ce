/**
 * 文章列表頁 Loading UI (Streaming SSR)
 *
 * Next.js App Router 會在 Server Component 資料獲取期間自動顯示此元件。
 * 使用骨架屏 (Skeleton) 動畫模擬真實佈局，提升使用者感知效能。
 */
export default function ArticlesLoading() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero 區塊骨架 */}
      <section className="bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 pb-16 pt-24">
        <div className="container-page text-center">
          <div className="mx-auto h-10 w-64 animate-pulse rounded-lg bg-white/20" />
          <div className="mx-auto mt-4 h-6 w-96 max-w-full animate-pulse rounded-lg bg-white/10" />
        </div>
      </section>

      <div className="container-page -mt-8">
        {/* 分類標籤列骨架 */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-lg shadow-gray-200/50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-full bg-gray-100"
              style={{ width: `${60 + i * 20}px` }}
            />
          ))}
        </div>

        {/* 文章卡片網格骨架 */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`overflow-hidden rounded-2xl bg-gray-200 ${
                i === 0 ? 'sm:col-span-2 sm:row-span-2' : ''
              }`}
            >
              <div className={`animate-pulse ${i === 0 ? 'h-[500px]' : 'h-[280px]'}`}>
                <div className="flex h-full flex-col justify-end p-6">
                  <div className="h-5 w-20 rounded-full bg-gray-300" />
                  <div className="mt-3 h-7 w-3/4 rounded-lg bg-gray-300" />
                  <div className="mt-2 h-5 w-1/2 rounded-lg bg-gray-300" />
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-gray-300" />
                    <div className="h-4 w-24 rounded bg-gray-300" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
