import Link from 'next/link';
import type { Article } from '@/types';

interface FeaturedArticlesProps {
  articles: Article[];
}

/**
 * FeaturedArticles - 精選健康文章網格
 *
 * 設計特色：
 * - 第一篇文章為大卡片（佔 2 欄），其餘為小卡片
 * - 圖片 hover 放大效果
 * - 分類標籤、閱讀時間估算
 * - 卡片底部漸層遮罩
 */
export function FeaturedArticles({ articles }: FeaturedArticlesProps) {
  if (articles.length === 0) return null;

  const estimateReadTime = (content: string) => {
    const words = content.length;
    return Math.max(3, Math.ceil(words / 500));
  };

  return (
    <section className="container-page py-20">
      {/* 區塊標題 */}
      <div className="flex items-end justify-between">
        <div>
          <span className="text-sm font-semibold uppercase tracking-wider text-brand-600">
            Knowledge
          </span>
          <h2 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
            精選健康文章
          </h2>
          <p className="mt-2 max-w-lg text-gray-500">
            由專業醫師與營養師撰寫，用科學實證守護你的健康
          </p>
        </div>
        <Link
          href="/articles"
          className="hidden items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 sm:flex"
        >
          查看全部
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>

      {/* 文章網格 */}
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article, index) => (
          <Link
            key={article.id}
            href={`/articles/${article.slug}`}
            className={`group relative overflow-hidden rounded-2xl bg-gray-900 shadow-lg transition-all hover:shadow-2xl hover:-translate-y-1 ${
              index === 0 ? 'md:col-span-2 md:row-span-2' : ''
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
            <div className={`relative flex flex-col justify-end p-6 ${
              index === 0 ? 'min-h-[400px] md:min-h-[500px] md:p-10' : 'min-h-[280px]'
            }`}>
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
              <h3 className={`mt-3 font-bold leading-tight text-white ${
                index === 0 ? 'text-2xl md:text-3xl' : 'text-lg'
              }`}>
                {article.title}
              </h3>

              {/* 摘要（僅大卡片顯示） */}
              {index === 0 && article.summary && (
                <p className="mt-3 line-clamp-2 text-sm text-gray-300">
                  {article.summary}
                </p>
              )}

              {/* 作者資訊 */}
              <div className="mt-4 flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <span className="text-[10px] font-bold text-white">
                    {(article.author.name || 'A')[0]}
                  </span>
                </div>
                <span className="text-xs text-gray-300">
                  {article.author.name}
                </span>
                <span className="text-gray-600">·</span>
                <span className="text-xs text-gray-400">
                  {new Date(article.publishedAt || article.createdAt).toLocaleDateString('zh-TW', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
