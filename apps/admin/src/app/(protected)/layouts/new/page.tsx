'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/ui/LoadingAndError';
import { LayoutSectionForm } from '@/components/layouts/LayoutSectionForm';
import { PAGE_ROUTES, PAGE_ROUTE_LABELS, type PageRoute } from '@havoice/shared';

/**
 * 新增行銷版位頁 /layouts/new?pageRoute=
 *
 * - 由頁面編輯器（第二層）導入時帶上 ?pageRoute，使新版位自動歸屬該頁面
 * - 建立成功後導向 /layouts/[id] 編輯頁，於該頁接續新增內容項目
 */
function NewLayoutContent() {
  const searchParams = useSearchParams();
  const rawPageRoute = searchParams.get('pageRoute') || '';
  const pageRoute: PageRoute = (PAGE_ROUTES as readonly string[]).includes(rawPageRoute)
    ? (rawPageRoute as PageRoute)
    : '/shop';

  const pageLabel = PAGE_ROUTE_LABELS[pageRoute] || pageRoute;
  const editorSlug = pageRoute === '/' ? 'home' : pageRoute.replace(/^\//, '');

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/layouts" className="transition-colors hover:text-gray-600">
          頁面設計
        </Link>
        <span>/</span>
        <Link href={`/layouts/editor/${editorSlug}`} className="transition-colors hover:text-gray-600">
          {pageLabel}
        </Link>
        <span>/</span>
        <span className="text-gray-700">新增版位</span>
      </nav>

      <PageHeader
        title="新增版位"
        description={`於「${pageLabel}」（${pageRoute}）建立一個新的內容版位，建立後即可新增內容項目`}
      />

      <LayoutSectionForm mode="create" defaultPageRoute={pageRoute} />
    </div>
  );
}

export default function NewLayoutPage() {
  return (
    <Suspense fallback={null}>
      <NewLayoutContent />
    </Suspense>
  );
}
