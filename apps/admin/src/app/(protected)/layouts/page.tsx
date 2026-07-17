'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { LayoutGrid, ArrowRight, Home, ShoppingBag } from 'lucide-react';

import { ErrorAlert, PageHeader } from '@/components/ui/LoadingAndError';
import { PAGE_ROUTES, PAGE_ROUTE_LABELS } from '@havoice/shared';

/**
 * 頁面設計（Page Builder）第一層 — 頁面列表頁 /layouts
 *
 * 設計決策：
 * - Page Builder 兩層動線的入口。此層列出全站可設計的頁面（PAGE_ROUTES）
 * - 每張卡片顯示該頁面的版位數量與啟用數量，提供「設計此頁」進入第二層拖曳編輯器
 * - 第二層為 /layouts/editor/[route]（home / shop），沿用拖曳排序邏輯並綁定 pageRoute
 * - 一次抓取全部版位後於前端依 pageRoute 彙總，避免多次請求
 */

interface SectionLite {
  id: string;
  pageRoute: string;
  isActive: boolean;
}

// pageRoute → 編輯器 slug
function routeToSlug(route: string): string {
  return route === '/' ? 'home' : route.replace(/^\//, '');
}

function PageIcon({ route }: { route: string }) {
  if (route === '/') return <Home className="h-6 w-6" />;
  if (route === '/shop') return <ShoppingBag className="h-6 w-6" />;
  return <LayoutGrid className="h-6 w-6" />;
}

const PAGE_DESCRIPTIONS: Record<string, string> = {
  '/': '網站首頁。建議以主視覺輪播開場，搭配主題推薦、品牌牆與活動橫幅。',
  '/shop': '商城列表頁。可規劃分類樓層、銷售排行與圖文導覽，引導使用者探索商品。',
};

export default function LayoutsPage() {
  const [sections, setSections] = useState<SectionLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/layouts', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入頁面資料失敗');
      }
      const items = Array.isArray(json.data?.items) ? json.data.items : [];
      setSections(
        items.map((s: SectionLite) => ({
          id: s.id,
          pageRoute: s.pageRoute ?? '/shop',
          isActive: Boolean(s.isActive),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
      setSections([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const statsFor = (route: string) => {
    const inPage = sections.filter((s) => s.pageRoute === route);
    return { total: inPage.length, active: inPage.filter((s) => s.isActive).length };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="頁面設計"
        description="選擇要設計的頁面，進入拖曳式版位編輯器，自由排列各頁面的內容區塊"
      />

      <p className="text-xs text-gray-400">
        提示：每個頁面擁有獨立的版位佈局。點擊「設計此頁」即可進入拖曳排序編輯器，新增的版位會自動歸屬於該頁面。
      </p>

      {error && <ErrorAlert message={error} onRetry={fetchSections} />}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {Array.from({ length: PAGE_ROUTES.length }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {PAGE_ROUTES.map((route) => {
            const stats = statsFor(route);
            const slug = routeToSlug(route);
            return (
              <div
                key={route}
                className="group flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <PageIcon route={route} />
                    </div>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                      {route}
                    </span>
                  </div>

                  <h3 className="mt-4 text-lg font-bold text-gray-900">
                    {PAGE_ROUTE_LABELS[route] || route}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500">
                    {PAGE_DESCRIPTIONS[route] || '自訂此頁面的內容版位佈局。'}
                  </p>

                  <div className="mt-4 flex items-center gap-4 text-sm">
                    <span className="text-gray-600">
                      版位 <span className="font-semibold text-gray-900">{stats.total}</span> 個
                    </span>
                    <span className="text-gray-600">
                      啟用 <span className="font-semibold text-brand-600">{stats.active}</span> 個
                    </span>
                  </div>
                </div>

                <div className="mt-6">
                  <Link
                    href={`/layouts/editor/${slug}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
                  >
                    設計此頁
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
