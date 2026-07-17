import { api } from '@/lib/api-client';
import { FeaturedArticles } from '@/components/home/FeaturedArticles';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { SectionRenderer } from '@/components/home/SectionRenderer';
import { getActiveLayoutSections } from '@/services/layout.service';
import type { Article, Product, PaginatedData } from '@/types';

/**
 * 首頁 - Server Component
 *
 * 設計決策：
 * - 首頁現支援動態頁面編輯器：向 API 請求 pageRoute='/' 的佈景區塊，交給 SectionRenderer 渲染
 * - 動態版位置於靜態 Hero 之後、精選文章之前；無啟用版位時自動隱藏（向後相容）
 * - 資料以 Promise.all 並行獲取，各自 catch fallback，任一來源失敗不影響整頁
 * - 採 ISR（revalidate 60s）
 */
export default async function HomePage() {
  const [layoutSections, articlesData, productsData] = await Promise.all([
    getActiveLayoutSections('/'),
    api
      .get<PaginatedData<Article>>('/api/articles', {
        params: { page: 1, limit: 5, status: 'PUBLISHED' },
        revalidate: 60,
      })
      .catch(() => ({
        data: [] as Article[],
        meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
      })),
    api
      .get<PaginatedData<Product>>('/api/products', {
        params: { page: 1, limit: 8, status: 'PUBLISHED' },
        revalidate: 60,
      })
      .catch(() => ({
        data: [] as Product[],
        meta: { total: 0, page: 1, limit: 8, totalPages: 0 },
      })),
  ]);

  const articles = articlesData.data;
  const products = productsData.data;

  return (
    <>
      {/* ═══ 區塊 1：靜態 Hero 佔位（動態行銷版位已移至 /shop） ═══ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900">
        <div className="absolute -left-32 -top-32 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-64 w-64 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="container-page relative py-20 text-center sm:py-28">
          <span className="inline-block rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white backdrop-blur">
            快樂之音・健康生活提案
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl">
            每天一點點，<br className="sm:hidden" />讓健康成為一種習慣
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-brand-100/90 sm:text-lg">
            專業健康知識搭配嚴選保健好物，陪你打造更好的自己。最新檔期活動與主題推薦，盡在商城。
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="/shop"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-semibold text-brand-700 shadow-xl transition-all hover:scale-[1.02] hover:bg-brand-50 active:scale-[0.98]"
            >
              立即逛商城
            </a>
            <a
              href="/articles"
              className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-8 py-4 text-sm font-semibold text-white transition-all hover:border-white/60 hover:bg-white/10"
            >
              瀏覽健康文章
            </a>
          </div>
        </div>
      </section>

      {/* ═══ 動態行銷版位（由後台 Page Builder 控制，pageRoute='/'） ═══ */}
      {layoutSections.length > 0 && (
        <div className="space-y-2">
          {layoutSections.map((section) => (
            <SectionRenderer key={section.id} section={section} />
          ))}
        </div>
      )}

      {/* ═══ 區塊 2：精選健康文章網格 ═══ */}
      <FeaturedArticles articles={articles} />

      {/* ═══ 區塊 3：熱銷保健推薦（水平滑動卡片） ═══ */}
      <FeaturedProducts products={products} />

      {/* ═══ 區塊 4：品牌 CTA 行動呼籲 ═══ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 py-20">
        {/* 裝飾元素 */}
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-64 w-64 rounded-full bg-accent-500/20 blur-3xl" />

        <div className="container-page relative text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              開始你的健康旅程
            </h2>
            <p className="mt-4 text-lg text-brand-100/90">
              每天一篇專業健康知識，搭配嚴選保健食品，讓快樂之音陪你打造更好的自己
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <a
                href="/articles"
                className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-semibold text-brand-700 shadow-xl transition-all hover:bg-brand-50 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                瀏覽健康文章
              </a>
              <a
                href="/shop"
                className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-8 py-4 text-sm font-semibold text-white transition-all hover:border-white/60 hover:bg-white/10"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                逛逛保健商城
              </a>
            </div>
          </div>

          {/* 信任指標 */}
          <div className="mt-16 grid grid-cols-2 gap-8 border-t border-white/10 pt-10 sm:grid-cols-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white sm:text-3xl">50+</div>
              <div className="mt-1 text-sm text-brand-200">專業健康文章</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white sm:text-3xl">15K+</div>
              <div className="mt-1 text-sm text-brand-200">每月活躍讀者</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white sm:text-3xl">98%</div>
              <div className="mt-1 text-sm text-brand-200">顧客滿意度</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white sm:text-3xl">100%</div>
              <div className="mt-1 text-sm text-brand-200">正品保證</div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
