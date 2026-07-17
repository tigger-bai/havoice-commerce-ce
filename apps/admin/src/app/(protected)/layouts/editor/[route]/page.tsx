'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { GripVertical, Pencil, Trash2, Plus, Lock, ChevronLeft } from 'lucide-react';

import { ErrorAlert, PageHeader } from '@/components/ui/LoadingAndError';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { ActiveInlineEdit } from '@/components/layouts/LayoutInlineEdit';
import { getTypeMeta, PINNED_TYPE } from '@/components/layouts/layout-types';
import { safeNumber } from '@/lib/utils';
import { PAGE_ROUTES, PAGE_ROUTE_LABELS, type PageRoute } from '@havoice/shared';

/**
 * 頁面設計（Page Builder）第二層 — 單一頁面拖曳排序編輯器
 * 路由：/layouts/editor/[route]（route slug：home → '/'，shop → '/shop'）
 *
 * 設計決策（沿用原 /layouts 拖曳排序版）：
 * - 依 slug 解析 pageRoute；非法 slug 顯示錯誤並提供返回連結
 * - GET /api/layouts?pageRoute= 僅載入該頁面版位
 * - 置頂邏輯：HERO_BANNER 固定置頂，不參與拖曳
 * - onDragEnd 樂觀更新後 PATCH /api/layouts/reorder（帶 pageRoute 範圍）；失敗回滾
 * - 新增版位導向 /layouts/new?pageRoute=，使新版位自動歸屬當前頁面
 * - 行內快切 isActive、編輯（/layouts/[id]）、刪除（ConfirmDialog）
 */

interface SectionRow {
  id: string;
  title: string;
  type: string;
  pageRoute: string;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

// slug ↔ pageRoute 映射
function slugToRoute(slug: string): PageRoute | null {
  if (slug === 'home') return '/';
  const candidate = `/${slug}`;
  return (PAGE_ROUTES as readonly string[]).includes(candidate) ? (candidate as PageRoute) : null;
}

function TypeBadge({ type }: { type: string }) {
  const meta = getTypeMeta(type);
  return <StatusBadge label={meta.label} variant={meta.variant} />;
}

function RowContent({
  section,
  onActiveUpdated,
  onDelete,
  dragHandle,
  pinned,
}: {
  section: SectionRow;
  onActiveUpdated: (next: { isActive: boolean }) => void;
  onDelete: () => void;
  dragHandle?: React.ReactNode;
  pinned?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
      <div className="flex w-6 shrink-0 justify-center text-gray-400">
        {pinned ? (
          <span title="置頂固定，不可拖曳">
            <Lock className="h-4 w-4 text-gray-300" />
          </span>
        ) : (
          dragHandle
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900">{section.title || '—'}</p>
        <p className="truncate text-xs text-gray-400">ID：{section.id.slice(0, 8)}…</p>
      </div>

      <div className="hidden w-28 shrink-0 sm:block">
        <TypeBadge type={section.type} />
      </div>

      <div className="hidden w-20 shrink-0 text-sm text-gray-700 md:block">
        {safeNumber(section.itemCount)} 項
      </div>

      <div className="hidden w-14 shrink-0 text-sm text-gray-700 lg:block">
        {pinned ? '置頂' : safeNumber(section.sortOrder)}
      </div>

      <div className="w-[120px] shrink-0">
        <ActiveInlineEdit sectionId={section.id} value={section.isActive} onUpdated={onActiveUpdated} />
      </div>

      <div className="flex w-[150px] shrink-0 items-center justify-end gap-2">
        <Link
          href={`/layouts/${section.id}`}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Pencil className="h-3.5 w-3.5" />
          編輯
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          刪除
        </button>
      </div>
    </div>
  );
}

export default function LayoutEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const slug = String(params?.route ?? '');
  const pageRoute = useMemo(() => slugToRoute(slug), [slug]);

  const [sections, setSections] = useState<SectionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SectionRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchSections = useCallback(async () => {
    if (!pageRoute) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/layouts?pageRoute=${encodeURIComponent(pageRoute)}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入版位失敗');
      }
      setSections(Array.isArray(json.data?.items) ? json.data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
      setSections([]);
    } finally {
      setIsLoading(false);
    }
  }, [pageRoute]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const patchRow = (id: string, patch: Partial<SectionRow>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const pinnedSections = sections.filter((s) => s.type === PINNED_TYPE);
  const draggableSections = sections.filter((s) => s.type !== PINNED_TYPE);

  const persistOrder = useCallback(
    async (orderedIds: string[]) => {
      if (!pageRoute) return false;
      setIsSavingOrder(true);
      try {
        const res = await fetch('/api/layouts/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds, pageRoute }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message || '排序更新失敗');
        }
        toast.success('版位排序已更新');
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '排序更新失敗，請稍後再試');
        return false;
      } finally {
        setIsSavingOrder(false);
      }
    },
    [toast, pageRoute]
  );

  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      const { source, destination } = result;
      if (!destination || destination.index === source.index) return;

      const prevSections = sections;
      const reordered = Array.from(draggableSections);
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);

      const reorderedWithOrder = reordered.map((s, idx) => ({ ...s, sortOrder: idx + 1 }));
      setSections([...pinnedSections, ...reorderedWithOrder]);

      const orderedIds = reordered.map((s) => s.id);
      const ok = await persistOrder(orderedIds);
      if (!ok) setSections(prevSections);
    },
    [sections, draggableSections, pinnedSections, persistOrder]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/layouts/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '刪除失敗，請稍後再試');
      }
      toast.success('版位已刪除');
      setSections((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '刪除失敗，請稍後再試');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, toast]);

  // 非法 slug：顯示錯誤
  if (!pageRoute) {
    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-1.5 text-sm text-gray-400">
          <Link href="/layouts" className="transition-colors hover:text-gray-600">
            頁面設計
          </Link>
          <span>/</span>
          <span className="text-gray-700">未知頁面</span>
        </nav>
        <ErrorAlert message={`找不到對應的頁面：${slug}`} />
        <Link href="/layouts" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
          <ChevronLeft className="h-4 w-4" />
          返回頁面列表
        </Link>
      </div>
    );
  }

  const pageLabel = PAGE_ROUTE_LABELS[pageRoute] || pageRoute;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/layouts" className="transition-colors hover:text-gray-600">
          頁面設計
        </Link>
        <span>/</span>
        <span className="text-gray-700">{pageLabel}</span>
      </nav>

      <PageHeader
        title={`設計：${pageLabel}`}
        description={`頁面路由 ${pageRoute}．共 ${sections.length} 個版位．拖曳調整顯示順序`}
        actions={
          <button
            type="button"
            onClick={() => router.push(`/layouts/new?pageRoute=${encodeURIComponent(pageRoute)}`)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            新增版位
          </button>
        }
      />

      <p className="text-xs text-gray-400">
        提示：拖曳左側把手即可調整樓層順序，放開後自動儲存。「主視覺輪播（HERO_BANNER）」固定置頂，不參與排序。點擊「編輯」可管理該版位的圖片、連結與內容項目。
      </p>

      {error && <ErrorAlert message={error} onRetry={fetchSections} />}

      {!isLoading && sections.length > 0 && (
        <div className="hidden items-center gap-3 px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400 sm:flex sm:px-4">
          <div className="w-6 shrink-0" />
          <div className="min-w-0 flex-1">版位標題</div>
          <div className="w-28 shrink-0">類型</div>
          <div className="hidden w-20 shrink-0 md:block">內容項目</div>
          <div className="hidden w-14 shrink-0 lg:block">排序</div>
          <div className="w-[120px] shrink-0">啟用狀態</div>
          <div className="w-[150px] shrink-0 text-right">操作</div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center text-sm text-gray-500">
          此頁面尚未建立任何版位，點擊右上角「新增版位」開始設計
        </div>
      ) : (
        <div className="space-y-4">
          {pinnedSections.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-rose-100 bg-rose-50/40">
              <div className="border-b border-rose-100 bg-rose-50/60 px-4 py-1.5 text-xs font-semibold text-rose-500">
                置頂固定版位
              </div>
              <div className="divide-y divide-rose-100/70">
                {pinnedSections.map((s) => (
                  <RowContent
                    key={s.id}
                    section={s}
                    pinned
                    onActiveUpdated={(next) => patchRow(s.id, { isActive: next.isActive })}
                    onDelete={() => setDeleteTarget(s)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white">
            {isSavingOrder && (
              <div className="absolute right-3 top-2 z-10 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600">
                排序儲存中…
              </div>
            )}
            {draggableSections.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">
                目前沒有可排序的版位（除主視覺輪播外）
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="layout-sections">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="divide-y divide-gray-100">
                      {draggableSections.map((s, index) => (
                        <Draggable key={s.id} draggableId={s.id} index={index}>
                          {(dragProvided, snapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={
                                snapshot.isDragging
                                  ? 'bg-brand-50/80 shadow-lg ring-1 ring-brand-200'
                                  : 'bg-white'
                              }
                            >
                              <RowContent
                                section={s}
                                onActiveUpdated={(next) => patchRow(s.id, { isActive: next.isActive })}
                                onDelete={() => setDeleteTarget(s)}
                                dragHandle={
                                  <button
                                    type="button"
                                    {...dragProvided.dragHandleProps}
                                    className="cursor-grab touch-none rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
                                    aria-label="拖曳排序把手"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </button>
                                }
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="確認刪除版位"
        description={
          deleteTarget
            ? `確定要刪除「${deleteTarget.title}」嗎？此版位下的 ${deleteTarget.itemCount} 項內容也會一併刪除，且無法復原。`
            : ''
        }
        confirmText="刪除"
        cancelText="取消"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
