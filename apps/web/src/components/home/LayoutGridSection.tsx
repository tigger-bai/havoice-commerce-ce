'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { LayoutItem } from '@/types';

interface LayoutGridSectionProps {
  title: string;
  items: LayoutItem[];
  /** BANNER 多為單張 / 少量大圖；GRID 為多欄並排 */
  variant: 'GRID' | 'BANNER';
}

/**
 * LayoutGridSection — 行銷版位「宮格 (GRID)」與「橫幅 (BANNER)」渲染元件
 *
 * 設計決策：
 * - 純展示，無互動，採 Server Component 友善寫法（不含 'use client'）
 * - BANNER：寬版大圖（單欄；若多張則上下堆疊），比例 21:9，適合首頁形象橫幅
 * - GRID：多欄並排（手機 1 欄、平板 2 欄、桌機 3 欄），比例 4:3
 * - 每張圖以 Link 包裹（linkUrl 存在才可點擊）
 * - 圖片載入失敗以漸層底色 fallback，並保留輔助標題，避免版面塌陷
 * - RWD：container-page 統一邊距，gap 與欄數隨斷點調整
 */
export function LayoutGridSection({ title, items, variant }: LayoutGridSectionProps) {
  if (!items || items.length === 0) return null;

  const isBanner = variant === 'BANNER';

  return (
    <section className="py-10 sm:py-14">
      <div className="container-page">
        {title && (
          <div className="mb-6 flex items-center gap-3">
            <span className="h-6 w-1.5 rounded-full bg-brand-500" />
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{title}</h2>
          </div>
        )}

        <div
          className={cn(
            'grid gap-4 sm:gap-5',
            isBanner ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          )}
        >
          {items.map((item) => {
            const card = (
              <div
                className={cn(
                  'group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-gray-900 shadow-sm transition-shadow hover:shadow-lg',
                  isBanner ? 'aspect-[21/9]' : 'aspect-[4/3]'
                )}
              >
                {item.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.title || title || '行銷圖片'}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}

                {/* 輔助標題（選填）：底部漸層提升可讀性 */}
                {item.title && (
                  <>
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                    <h3
                      className={cn(
                        'absolute bottom-0 left-0 right-0 p-4 font-semibold text-white drop-shadow',
                        isBanner ? 'text-lg sm:text-2xl' : 'text-base sm:text-lg'
                      )}
                    >
                      {item.title}
                    </h3>
                  </>
                )}
              </div>
            );

            return item.linkUrl ? (
              <Link key={item.id} href={item.linkUrl} className="block">
                {card}
              </Link>
            ) : (
              <div key={item.id}>{card}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
