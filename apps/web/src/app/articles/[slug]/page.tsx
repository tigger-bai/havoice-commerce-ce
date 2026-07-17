import { notFound } from 'next/navigation';
import { api } from '@/lib/api-client';
import { RecommendedProducts } from '@/components/articles/RecommendedProducts';
import type { Article } from '@/types';
import type { Metadata } from 'next';

interface ArticlePageProps {
  params: { slug: string };
}

/**
 * 文章閱讀頁面 - Server Component
 *
 * 設計決策：
 * - 根據 slug 獲取文章內容（SEO 友善的 URL）
 * - 動態生成 metadata 以優化搜尋引擎收錄
 * - 文章底部自動帶出依 sortOrder 排序的導購推薦商品
 * - 使用 ISR (revalidate: 60) 確保內容更新即時性
 */
export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  try {
    const article = await api.get<Article>(`/api/articles/slug/${params.slug}`, {
      revalidate: 60,
    });
    return {
      title: `${article.title} — 快樂之音`,
      description: article.summary || article.content.slice(0, 160),
      openGraph: {
        title: article.title,
        description: article.summary || undefined,
        images: article.coverImage ? [article.coverImage] : undefined,
      },
    };
  } catch {
    return { title: '文章不存在 — 快樂之音' };
  }
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  let article: Article;

  try {
    article = await api.get<Article>(`/api/articles/slug/${params.slug}`, {
      revalidate: 60,
    });
  } catch {
    notFound();
  }

  return (
    <article className="container-page py-10">
      {/* 文章標題區 */}
      <header className="mx-auto max-w-3xl">
        {/* 分類標籤 */}
        <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          {article.category.name}
        </span>

        {/* 標題 */}
        <h1 className="mt-4 text-3xl font-bold leading-tight text-gray-900 sm:text-4xl lg:text-5xl">
          {article.title}
        </h1>

        {/* 作者與日期 */}
        <div className="mt-6 flex items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center">
              <span className="text-xs font-semibold text-brand-700">
                {(article.author.name || article.author.email)[0].toUpperCase()}
              </span>
            </div>
            <span className="font-medium text-gray-700">
              {article.author.name || article.author.email}
            </span>
          </div>
          <span>·</span>
          <time dateTime={article.publishedAt || article.createdAt}>
            {new Date(article.publishedAt || article.createdAt).toLocaleDateString(
              'zh-TW',
              { year: 'numeric', month: 'long', day: 'numeric' }
            )}
          </time>
          <span>·</span>
          <span>{article.viewCount.toLocaleString()} 次閱讀</span>
        </div>
      </header>

      {/* 封面圖片 */}
      {article.coverImage && (
        <div className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-2xl">
          <img
            src={article.coverImage}
            alt={article.title}
            className="h-auto w-full object-cover"
          />
        </div>
      )}

      {/* 文章正文 */}
      <div className="mx-auto mt-10 max-w-3xl">
        <div className="prose prose-lg prose-gray max-w-none prose-headings:font-bold prose-a:text-brand-600 prose-img:rounded-xl">
          {/* 將文章內容按段落渲染 */}
          {article.content.split('\n').map((paragraph, index) => {
            if (!paragraph.trim()) return null;
            return (
              <p key={index} className="mb-4 leading-relaxed text-gray-700">
                {paragraph}
              </p>
            );
          })}
        </div>

        {/* ═══ 導購推薦商品區塊 ═══ */}
        {article.recommendedProducts && article.recommendedProducts.length > 0 && (
          <RecommendedProducts products={article.recommendedProducts} />
        )}
      </div>
    </article>
  );
}
