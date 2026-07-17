'use client';

import { useParams } from 'next/navigation';
import { useArticle } from '@/hooks/useArticles';
import { ArticleForm } from '@/components/articles/ArticleForm';
import { ErrorAlert, PageHeader } from '@/components/ui';

/**
 * 文章編輯頁面
 * 路由：/articles/:id
 */
export default function EditArticlePage() {
  const params = useParams();
  const articleId = params.id as string;
  const { data: article, isLoading, error } = useArticle(articleId);

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="編輯文章" />
        <ErrorAlert message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={article ? `編輯：${article.title}` : '編輯文章'}
        description="修改文章內容與導購推薦設定"
      />
      <ArticleForm article={article} isLoading={isLoading} />
    </div>
  );
}
