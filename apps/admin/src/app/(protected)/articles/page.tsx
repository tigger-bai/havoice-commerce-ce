'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useArticles, useArticleMutations } from '@/hooks/useArticles';
import {
  DataTable,
  Pagination,
  StatusBadge,
  getPublishStatusBadge,
  LoadingSpinner,
  ErrorAlert,
  PageHeader,
  type Column,
} from '@/components/ui';
import type { Article } from '@/types/entities';

/**
 * 文章列表頁面
 *
 * 功能：
 * - 分頁表格展示所有文章
 * - 分類篩選器
 * - 狀態篩選器
 * - 點擊行跳轉至編輯頁
 * - 刪除確認
 */
export default function ArticlesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading, error, refetch } = useArticles({
    page,
    limit: 10,
    categoryId: categoryFilter || undefined,
    status: statusFilter || undefined,
  });

  const { deleteArticle, isSubmitting } = useArticleMutations();

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`確定要刪除文章「${title}」嗎？此操作可透過資料庫恢復。`)) return;
    const success = await deleteArticle(id);
    if (success) refetch();
  };

  const columns: Column<Article>[] = [
    {
      key: 'title',
      title: '文章標題',
      render: (item) => (
        <div className="max-w-xs">
          <p className="truncate font-medium text-gray-900">{item.title}</p>
          <p className="truncate text-xs text-gray-500">/{item.slug}</p>
        </div>
      ),
    },
    {
      key: 'category',
      title: '分類',
      render: (item) => (
        <span className="text-sm text-gray-600">{item.category.name}</span>
      ),
    },
    {
      key: 'author',
      title: '作者',
      render: (item) => (
        <span className="text-sm text-gray-600">
          {item.author.name || item.author.email}
        </span>
      ),
    },
    {
      key: 'status',
      title: '狀態',
      render: (item) => {
        const badge = getPublishStatusBadge(item.status);
        return <StatusBadge label={badge.label} variant={badge.variant} />;
      },
    },
    {
      key: 'viewCount',
      title: '瀏覽數',
      render: (item) => (
        <span className="text-sm text-gray-600">
          {item.viewCount.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'createdAt',
      title: '建立時間',
      render: (item) => (
        <span className="text-sm text-gray-500">
          {new Date(item.createdAt).toLocaleDateString('zh-TW')}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '120px',
      render: (item) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/articles/${item.id}`}
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
            onClick={(e) => e.stopPropagation()}
          >
            編輯
          </Link>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(item.id, item.title);
            }}
            disabled={isSubmitting}
            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            刪除
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 頁面標題 */}
      <PageHeader
        title="文章管理"
        description="管理所有文章內容與導購推薦設定"
        actions={
          <Link href="/articles/new" className="btn-primary">
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新增文章
          </Link>
        }
      />

      {/* 篩選器 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="input-field w-auto"
        >
          <option value="">所有狀態</option>
          <option value="DRAFT">草稿</option>
          <option value="PUBLISHED">已發佈</option>
          <option value="ARCHIVED">已封存</option>
        </select>

        <input
          type="text"
          placeholder="輸入分類 ID 篩選..."
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="input-field w-auto max-w-xs"
        />
      </div>

      {/* 資料表格 */}
      {error ? (
        <ErrorAlert message={error} onRetry={refetch} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => router.push(`/articles/${item.id}`)}
            isLoading={isLoading}
            emptyMessage="尚無文章，點擊右上角「新增文章」開始建立"
          />

          {data?.meta && (
            <Pagination
              currentPage={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
