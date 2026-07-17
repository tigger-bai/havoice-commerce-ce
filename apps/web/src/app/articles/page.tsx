import Link from 'next/link';
import { api } from '@/lib/api-client';
import type { Article, Category, PaginatedData } from '@/types';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '健康文章 — 快樂之音',
  description: '由專業醫師與營養師撰寫的健康知識文章，涵蓋飲食、睡眠、保健等主題。',
};

interface ArticlesPageProps {
  searchParams: {
    page?: string;
    categoryId?: string;
  };
}

/**
 * 文章列表頁 - Server Component
 *
 * 設計決策：
 * - 使用 Server Component + searchParams 實現 SSR 分頁與篩選
 * - 頂部分類標籤列提供快速篩選
 * - 使用與首頁「精選文章」相同的卡片風格 (Grid 排版)
 * - 支援 ISR (revalidate: 30) 確保內容即時更新
 */
export default async function ArticlesPage({ searchParams }: ArticlesPageProps) {
  const currentPage = Number(searchParams.page) || 1;
  const categoryId = searchParams.categoryId || undefined;

  // 並行獲取文章列表與分類列表
  const [articlesData, categories] = await Promise.all([
    api
      .get<PaginatedData<Article>>('/api/articles', {
        params: {
          page: currentPage,
          limit: 9,
          status: 'PUBLISHED',
          categoryId,
        },
        revalidate: 30,
      })
      .catch(() => ({
        data: [] as Article[],
        meta: { total: 0, page: 1, limit: 9, totalPages: 0 },
      })),
    api
      .get<Category[]>('/api/categories', { revalidate: 300 })
      .catch(() => [] as Category[]),
  ]);

  const { data: articles, meta } = articlesData;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* ═══ 頁面 Hero 區塊 ═══ */}
      <section className="bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 pb-16 pt-24">
        <div className="container-page text-center">
          <h1 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            健康知識文章
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-100/80">
            由專業醫師與營養師撰寫，用科學實證守護你的每一天
          </p>
        </div>
      </section>

      <div className="container-page -mt-8">
        {/* ═══ 分類篩選標籤列 ═══ */}
        <nav className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-lg shadow-gray-200/50">
          <Link
            href="/articles"
            className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all ${
              !categoryId
                ? 'bg-brand-600 text-white shadow-md shadow-brand-500/30'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            全部文章
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/articles?categoryId=${cat.id}`}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all ${
                categoryId === cat.id
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-500/30'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
            >
              {cat.name}
            </Link>
          ))}
        </nav>

        {/* ═══ 文章網格 ═══ */}
        {articles.length > 0 ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                featured={index === 0 && currentPage === 1 && !categoryId}
              />
            ))}
          </div>
        ) : (
          <div className="mt-20 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
              <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">尚無文章</h3>
            <p className="mt-2 text-gray-500">目前此分類下暫無已發佈的文章</p>
          </div>
        )}

        {/* ═══ 分頁控制 ═══ */}
        {meta.totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-2 pb-16">
            {/* 上一頁 */}
            {currentPage > 1 && (
              <Link
                href={`/articles?page=${currentPage - 1}${categoryId ? `&categoryId=${categoryId}` : ''}`}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-all hover:border-brand-300 hover:text-brand-600 hover:shadow-md"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </Link>
            )}

            {/* 頁碼 */}
            {Array.from({ length: meta.totalPages }, (_, i) => i + 1)
              .filter((page) => {
                // 智慧分頁：顯示首頁、末頁、當前頁前後各 1 頁
                if (page === 1 || page === meta.totalPages) return true;
                if (Math.abs(page - currentPage) <= 1) return true;
                return false;
              })
              .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
                if (idx > 0 && page - (arr[idx - 1] as number) > 1) {
                  acc.push('ellipsis');
                }
                acc.push(page);
                return acc;
              }, [])
              .map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                    ...
                  </span>
                ) : (
                  <Link
                    key={item}
                    href={`/articles?page=${item}${categoryId ? `&categoryId=${categoryId}` : ''}`}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-all ${
                      item === currentPage
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-500/30'
                        : 'border border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-brand-600 hover:shadow-md'
                    }`}
                  >
                    {item}
                  </Link>
                )
              )}

            {/* 下一頁 */}
            {currentPage < meta.totalPages && (
              <Link
                href={`/articles?page=${currentPage + 1}${categoryId ? `&categoryId=${categoryId}` : ''}`}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-all hover:border-brand-300 hover:text-brand-600 hover:shadow-md"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

/* ═══ 文章卡片子元件 ═══ */
function ArticleCard({
  article,
  featured = false,
}: {
  article: Article;
  featured?: boolean;
}) {
  const estimateReadTime = (content: string) => {
    return Math.max(3, Math.ceil(content.length / 500));
  };

  return (
    <Link
      href={`/articles/${article.slug}`}
      className={`group relative overflow-hidden rounded-2xl bg-gray-900 shadow-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${
        featured ? 'sm:col-span-2 sm:row-span-2' : ''
      }`}
    >
      {/* 背景圖片 */}
      <div className="absolute inset-0">
        <img
          src={article.coverImage || ''}
          alt={article.title}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        {/* 漸層遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
      </div>

      {/* 內容 */}
      <div
        className={`relative flex flex-col justify-end p-6 ${
          featured ? 'min-h-[400px] sm:min-h-[500px] sm:p-10' : 'min-h-[280px]'
        }`}
      >
        {/* 分類與閱讀時間 */}
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-brand-500/90 px-3 py-1 text-xs font-semibold text-white">
            {article.category.name}
          </span>
          <span className="text-xs text-gray-300">
            {estimateReadTime(article.content)} 分鐘閱讀
          </span>
        </div>

        {/* 標題 */}
        <h3
          className={`mt-3 font-bold leading-tight text-white ${
            featured ? 'text-2xl sm:text-3xl' : 'text-lg'
          }`}
        >
          {article.title}
        </h3>

        {/* 摘要（僅 featured 大卡片顯示） */}
        {featured && article.summary && (
          <p className="mt-3 line-clamp-2 text-sm text-gray-300">
            {article.summary}
          </p>
        )}

        {/* 作者資訊 */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <span className="text-[10px] font-bold text-white">
              {(article.author.name || 'A')[0]}
            </span>
          </div>
          <span className="text-xs text-gray-300">
            {article.author.name || article.author.email}
          </span>
          <span className="text-gray-600">·</span>
          <span className="text-xs text-gray-400">
            {new Date(article.publishedAt || article.createdAt).toLocaleDateString(
              'zh-TW',
              { month: 'short', day: 'numeric' }
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}
