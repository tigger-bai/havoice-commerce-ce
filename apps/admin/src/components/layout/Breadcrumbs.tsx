'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Breadcrumbs - 依路徑自動產生的麵包屑導覽
 *
 * 設計決策：
 * - 將 pathname 拆解為層級，對照中文標籤字典
 * - 動態片段（如 UUID）顯示為「詳情」，避免顯示無意義字串
 * - 最末層為當前頁（不可點擊）
 */

const LABELS: Record<string, string> = {
  '': '營運總覽',
  orders: '訂單管理',
  products: '商品與庫存',
  articles: '文章管理',
  new: '新增',
  'delivery-note': '撿貨單',
  'live-manual': '直播建單',
};

/** 判斷片段是否為動態 id（UUID 或長亂碼） */
function isDynamicSegment(seg: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) || seg.length > 20;
}

export function Breadcrumbs() {
  const pathname = usePathname() || '/';
  const segments = pathname.split('/').filter(Boolean);

  // 累積路徑以建立每一層的連結
  const crumbs = segments.map((seg, idx) => {
    const href = '/' + segments.slice(0, idx + 1).join('/');
    const label = isDynamicSegment(seg) ? '詳情' : LABELS[seg] ?? seg;
    return { href, label, isLast: idx === segments.length - 1 };
  });

  return (
    <nav className="flex items-center gap-1.5 text-sm" aria-label="麵包屑">
      <Link href="/" className="text-gray-400 transition-colors hover:text-brand-600">
        {LABELS['']}
      </Link>
      {crumbs.map((c) => (
        <span key={c.href} className="flex items-center gap-1.5">
          <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          {c.isLast ? (
            <span className="font-semibold text-gray-700">{c.label}</span>
          ) : (
            <Link href={c.href} className="text-gray-400 transition-colors hover:text-brand-600">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
