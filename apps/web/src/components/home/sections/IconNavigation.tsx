import type { LayoutItem } from '@/types';
import { SafeImage, MaybeLink, SectionHeading, itemAlt } from './shared';

/**
 * ICON_NAVIGATION — 圖文導覽列
 *
 * 設計決策：
 * - 一排多格的圓形分類按鈕（圖示 + 文字），常見於電商首頁頂部的快速分類入口
 * - 響應式：手機 4 格、平板 6 格、桌機 8 格，超出自動換行
 * - 每格為圓形縮圖 + 下方標題；item.linkUrl 存在時整格可點擊
 * - 沿用 SafeImage（破圖隱藏）與 MaybeLink（條件連結）慣例
 */
export function IconNavigation({ title, items }: { title: string; items: LayoutItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="bg-white py-8 sm:py-10">
      <div className="container-page">
        {title && <SectionHeading title={title} accentClass="bg-accent-500" />}
        <div className="grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-6 lg:grid-cols-8">
          {items.map((item) => (
            <MaybeLink
              key={item.id}
              href={item.linkUrl}
              className="group flex flex-col items-center gap-2 text-center"
            >
              <span className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200 transition-transform group-hover:scale-105 sm:h-20 sm:w-20">
                {item.imageUrl ? (
                  <SafeImage src={item.imageUrl} alt={itemAlt(item, '分類')} />
                ) : (
                  <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Z" />
                  </svg>
                )}
              </span>
              <span className="line-clamp-1 text-xs font-medium text-gray-700 group-hover:text-brand-600 sm:text-sm">
                {item.title || '—'}
              </span>
            </MaybeLink>
          ))}
        </div>
      </div>
    </section>
  );
}
