'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FormField } from '@/components/ui/FormField';
import { ErrorAlert, LoadingSpinner } from '@/components/ui/LoadingAndError';
import { RecommendationSelector } from './RecommendationSelector';
import { useArticleMutations } from '@/hooks/useArticles';
import { CreateArticleSchema, UpdateArticleSchema } from '@havoice/shared';
import type { Article, RecommendedProduct } from '@/types/entities';
import { ZodError } from 'zod';

interface ArticleFormProps {
  article?: Article | null;
  isLoading?: boolean;
}

interface FormData {
  title: string;
  slug: string;
  content: string;
  summary: string;
  coverImage: string;
  authorId: string;
  categoryId: string;
  status: string;
}

/**
 * ArticleForm - 文章建立/編輯表單
 *
 * 設計決策：
 * - 統一處理「新增」與「編輯」兩種模式
 * - 使用 Zod Schema 進行前端即時驗證
 * - 整合 RecommendationSelector 進行導購設定
 * - 儲存時同時呼叫文章更新 API 與推薦商品設定 API
 */
export function ArticleForm({ article, isLoading }: ArticleFormProps) {
  const router = useRouter();
  const isEditMode = !!article;
  const { createArticle, updateArticle, setRecommendations, isSubmitting, error } =
    useArticleMutations();

  const [formData, setFormData] = useState<FormData>({
    title: '',
    slug: '',
    content: '',
    summary: '',
    coverImage: '',
    authorId: '',
    categoryId: '',
    status: 'DRAFT',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [recommendations, setRecommendationsState] = useState<
    { productId: string; sortOrder: number }[]
  >([]);

  // 編輯模式：填入現有資料
  useEffect(() => {
    if (article) {
      setFormData({
        title: article.title,
        slug: article.slug,
        content: article.content,
        summary: article.summary || '',
        coverImage: article.coverImage || '',
        authorId: article.authorId,
        categoryId: article.categoryId,
        status: article.status,
      });

      if (article.recommendedProducts) {
        setRecommendationsState(
          article.recommendedProducts.map((rec) => ({
            productId: rec.id,
            sortOrder: rec.sortOrder,
          }))
        );
      }
    }
  }, [article]);

  const updateField = (field: keyof FormData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // 清除該欄位的錯誤
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // 自動生成 slug
  const handleTitleChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      title: value,
      // 僅在新增模式且 slug 未手動修改時自動生成
      slug:
        !isEditMode && prev.slug === generateSlug(prev.title)
          ? generateSlug(value)
          : prev.slug,
    }));
  };

  const generateSlug = (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    try {
      if (isEditMode) {
        // 編輯模式：使用 UpdateArticleSchema 驗證
        const validated = UpdateArticleSchema.parse({
          title: formData.title,
          slug: formData.slug,
          content: formData.content,
          summary: formData.summary || undefined,
          coverImage: formData.coverImage || undefined,
          categoryId: formData.categoryId,
          status: formData.status,
        });

        const result = await updateArticle(article!.id, validated);
        if (result) {
          // 同時更新推薦商品
          await setRecommendations(article!.id, { recommendations });
          router.push('/articles');
        }
      } else {
        // 新增模式：使用 CreateArticleSchema 驗證
        const validated = CreateArticleSchema.parse({
          title: formData.title,
          slug: formData.slug,
          content: formData.content,
          summary: formData.summary || undefined,
          coverImage: formData.coverImage || undefined,
          authorId: formData.authorId,
          categoryId: formData.categoryId,
          status: formData.status,
        });

        const result = await createArticle(validated);
        if (result) {
          // 新增成功後設定推薦商品
          if (recommendations.length > 0) {
            await setRecommendations(result.id, { recommendations });
          }
          router.push('/articles');
        }
      }
    } catch (err) {
      if (err instanceof ZodError) {
        const errors: Record<string, string> = {};
        err.errors.forEach((issue) => {
          const field = issue.path.join('.');
          errors[field] = issue.message;
        });
        setFieldErrors(errors);
      }
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="載入文章資料中..." />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* API 錯誤提示 */}
      {error && <ErrorAlert message={error} />}

      {/* 基本資訊區塊 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-6 text-lg font-semibold text-gray-900">基本資訊</h3>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField
              type="text"
              label="文章標題"
              name="title"
              value={formData.title}
              onChange={handleTitleChange}
              placeholder="輸入文章標題..."
              error={fieldErrors.title}
              required
            />
          </div>

          <FormField
            type="text"
            label="URL Slug"
            name="slug"
            value={formData.slug}
            onChange={updateField('slug')}
            placeholder="article-url-slug"
            description="僅允許小寫英文、數字與連字號"
            error={fieldErrors.slug}
            required
          />

          <FormField
            type="select"
            label="發佈狀態"
            name="status"
            value={formData.status}
            onChange={updateField('status')}
            options={[
              { label: '草稿', value: 'DRAFT' },
              { label: '已發佈', value: 'PUBLISHED' },
              { label: '已封存', value: 'ARCHIVED' },
            ]}
            error={fieldErrors.status}
            required
          />

          <FormField
            type="text"
            label="分類 ID"
            name="categoryId"
            value={formData.categoryId}
            onChange={updateField('categoryId')}
            placeholder="輸入分類 UUID..."
            error={fieldErrors.categoryId}
            required
          />

          {!isEditMode && (
            <FormField
              type="text"
              label="作者 ID"
              name="authorId"
              value={formData.authorId}
              onChange={updateField('authorId')}
              placeholder="輸入作者 UUID..."
              error={fieldErrors.authorId}
              required
            />
          )}

          <FormField
            type="url"
            label="封面圖片 URL"
            name="coverImage"
            value={formData.coverImage}
            onChange={updateField('coverImage')}
            placeholder="https://example.com/image.jpg"
            error={fieldErrors.coverImage}
          />

          <div className="md:col-span-2">
            <FormField
              type="textarea"
              label="文章摘要"
              name="summary"
              value={formData.summary}
              onChange={updateField('summary')}
              placeholder="簡短描述文章內容（選填，最多 500 字）..."
              rows={3}
              error={fieldErrors.summary}
            />
          </div>

          <div className="md:col-span-2">
            <FormField
              type="textarea"
              label="文章內容"
              name="content"
              value={formData.content}
              onChange={updateField('content')}
              placeholder="輸入文章正文內容..."
              rows={12}
              error={fieldErrors.content}
              required
            />
          </div>
        </div>
      </div>

      {/* 導購推薦設定區塊 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          導購推薦設定
        </h3>
        <RecommendationSelector
          articleId={article?.id}
          initialRecommendations={article?.recommendedProducts}
          onChange={setRecommendationsState}
        />
      </div>

      {/* 操作按鈕 */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/articles')}
          className="btn-secondary"
        >
          取消
        </button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              儲存中...
            </>
          ) : isEditMode ? (
            '更新文章'
          ) : (
            '建立文章'
          )}
        </button>
      </div>
    </form>
  );
}
