'use client';

import { ArticleForm } from '@/components/articles/ArticleForm';
import { PageHeader } from '@/components/ui';

/**
 * 新增文章頁面
 * 路由：/articles/new
 */
export default function NewArticlePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="新增文章"
        description="建立新的文章內容並設定導購推薦商品"
      />
      <ArticleForm />
    </div>
  );
}
