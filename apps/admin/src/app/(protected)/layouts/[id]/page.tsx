'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { PageHeader, LoadingSpinner, ErrorAlert } from '@/components/ui/LoadingAndError';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { LayoutSectionForm, type LayoutSectionInitialData } from '@/components/layouts/LayoutSectionForm';
import { LayoutItemFormModal, type LayoutItemData } from '@/components/layouts/LayoutItemFormModal';
import { getTypeMeta } from '@/components/layouts/layout-types';
import { safeNumber } from '@/lib/utils';
import { PAGE_ROUTE_LABELS } from '@havoice/shared';

/**
 * 樓層編輯頁 /layouts/[id]（行銷版位 CMS 核心頁）
 *
 * 設計決策：
 * - 上半部：LayoutSection 基本資料表單（複用 LayoutSectionForm，edit 模式）
 * - 下半部：內容項目（LayoutItem）管理區塊
 *   - 卡片式呈現現有 items（縮圖、輔助標題、連結、排序、啟用狀態）
 *   - 「新增內容」→ LayoutItemFormModal（整合 ImageUpload 上傳 imageUrl）
 *   - 每張卡片可「編輯」（Modal）與「刪除」（ConfirmDialog）
 *   - 每張卡片可即時切換 isActive（PATCH /api/layouts/[id]/items/[itemId]）
 * - 載入時顯示 LoadingSpinner，GET /api/layouts/[id] 預填資料
 * - 所有操作皆中文 Toast 提示，數值經 safeNumber 防禦
 */

interface SectionData {
  id: string;
  title: string;
  type: string;
  pageRoute: string;
  sortOrder: number;
  isActive: boolean;
  items: LayoutItemData[];
}

export default function LayoutEditPage() {
  const params = useParams();
  const sectionId = String(params?.id ?? '');
  const { toast } = useToast();

  const [section, setSection] = useState<SectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Item Modal 狀態
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LayoutItemData | null>(null);

  // Item 刪除狀態
  const [deleteTarget, setDeleteTarget] = useState<LayoutItemData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 逐列 isActive 切換中的 itemId
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchSection = useCallback(async () => {
    if (!sectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/layouts/${sectionId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入版位資料失敗');
      }
      const d = json.data;
      setSection({
        id: d.id,
        title: d.title,
        type: d.type,
        pageRoute: d.pageRoute ?? '/shop',
        sortOrder: safeNumber(d.sortOrder),
        isActive: Boolean(d.isActive),
        items: Array.isArray(d.items)
          ? d.items.map((it: LayoutItemData) => ({
              id: it.id,
              sectionId: it.sectionId,
              title: it.title ?? null,
              imageUrl: it.imageUrl,
              linkUrl: it.linkUrl ?? null,
              sortOrder: safeNumber(it.sortOrder),
              isActive: Boolean(it.isActive),
            }))
          : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
      setSection(null);
    } finally {
      setIsLoading(false);
    }
  }, [sectionId]);

  useEffect(() => {
    fetchSection();
  }, [fetchSection]);

  const handleToggleItem = async (item: LayoutItemData) => {
    if (togglingId) return;
    setTogglingId(item.id);
    const next = !item.isActive;
    try {
      const res = await fetch(`/api/layouts/${sectionId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '更新失敗，請稍後再試');
      }
      setSection((prev) =>
        prev
          ? { ...prev, items: prev.items.map((it) => (it.id === item.id ? { ...it, isActive: next } : it)) }
          : prev
      );
      toast.success(next ? '內容項目已啟用' : '內容項目已停用');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失敗，請稍後再試');
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDeleteItem = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/layouts/${sectionId}/items/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '刪除失敗，請稍後再試');
      }
      toast.success('內容項目已刪除');
      setSection((prev) =>
        prev ? { ...prev, items: prev.items.filter((it) => it.id !== deleteTarget.id) } : prev
      );
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '刪除失敗，請稍後再試');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, sectionId, toast]);

  const openCreateModal = () => {
    setEditingItem(null);
    setModalOpen(true);
  };

  const openEditModal = (item: LayoutItemData) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-1.5 text-sm text-gray-400">
          <Link href="/layouts" className="transition-colors hover:text-gray-600">
            頁面設計
          </Link>
          <span>/</span>
          <span className="text-gray-700">編輯版位</span>
        </nav>
        <LoadingSpinner message="載入版位資料中…" />
      </div>
    );
  }

  if (error || !section) {
    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-1.5 text-sm text-gray-400">
          <Link href="/layouts" className="transition-colors hover:text-gray-600">
            頁面設計
          </Link>
          <span>/</span>
          <span className="text-gray-700">編輯版位</span>
        </nav>
        <ErrorAlert message={error || '找不到指定的版位'} onRetry={fetchSection} />
      </div>
    );
  }

  const sectionInitial: LayoutSectionInitialData = {
    id: section.id,
    title: section.title,
    type: section.type as LayoutSectionInitialData['type'],
    pageRoute: section.pageRoute as LayoutSectionInitialData['pageRoute'],
    sortOrder: section.sortOrder,
    isActive: section.isActive,
  };

  const typeMeta = getTypeMeta(section.type);
  const editorSlug = section.pageRoute === '/' ? 'home' : section.pageRoute.replace(/^\//, '');
  const pageLabel = PAGE_ROUTE_LABELS[section.pageRoute] || section.pageRoute;

  return (
    <div className="space-y-6 pb-12">
      <nav className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/layouts" className="transition-colors hover:text-gray-600">
          頁面設計
        </Link>
        <span>/</span>
        <Link href={`/layouts/editor/${editorSlug}`} className="transition-colors hover:text-gray-600">
          {pageLabel}
        </Link>
        <span>/</span>
        <span className="text-gray-700">編輯版位</span>
      </nav>

      <PageHeader
        title={section.title || '編輯版位'}
        description={`所屬頁面：${pageLabel}（${section.pageRoute}）・編輯版位基本資料並管理其下的內容項目`}
        actions={<StatusBadge label={typeMeta.label} variant={typeMeta.variant} />}
      />

      {/* 上半部：版位基本資料 */}
      <LayoutSectionForm mode="edit" sectionId={section.id} initialData={sectionInitial} />

      {/* 下半部：內容項目管理 */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">內容項目</h2>
            <p className="mt-0.5 text-xs text-gray-400">共 {section.items.length} 項．依排序由小到大顯示</p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新增內容
          </button>
        </div>

        {section.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-400">
            尚未新增任何內容項目，點擊右上角「新增內容」開始建立
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-xl border border-gray-200">
                <div className="relative aspect-[16/9] w-full bg-gray-100">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.title || '內容項目'}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-300">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 6.75h.008v.008H18V6.75Z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute left-2 top-2">
                    <StatusBadge
                      label={item.isActive ? '已啟用' : '已停用'}
                      variant={item.isActive ? 'success' : 'neutral'}
                    />
                  </div>
                </div>

                <div className="space-y-2 p-3">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {item.title || <span className="text-gray-400">（無輔助標題）</span>}
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    連結：{item.linkUrl || '—'}
                  </p>
                  <p className="text-xs text-gray-400">排序：{safeNumber(item.sortOrder)}</p>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleItem(item)}
                      disabled={togglingId === item.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {togglingId === item.id ? '處理中…' : item.isActive ? '停用' : '啟用'}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 內容項目新增 / 編輯 Modal */}
      <LayoutItemFormModal
        open={modalOpen}
        sectionId={section.id}
        item={editingItem}
        onClose={() => setModalOpen(false)}
        onSaved={fetchSection}
      />

      {/* 內容項目刪除確認 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="確認刪除內容項目"
        description={
          deleteTarget
            ? `確定要刪除此內容項目${deleteTarget.title ? `「${deleteTarget.title}」` : ''}嗎？此操作無法復原。`
            : ''
        }
        confirmText="刪除"
        cancelText="取消"
        loading={isDeleting}
        onConfirm={handleConfirmDeleteItem}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
