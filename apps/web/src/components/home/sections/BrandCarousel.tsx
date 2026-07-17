'use client';

import { useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LayoutItem } from '@/types';
import { MaybeLink, SafeImage, itemAlt } from './shared';

interface BrandCarouselProps {
  title: string;
  items: LayoutItem[];
}

/**
 * BRAND_CAROUSEL — 品牌專區（參考附圖「品牌 Boxing Day」）
 *
 * 切版重點：
 * - 卡片為「上半商品情境圖 + 下半深藍底資訊區」結構，下半置中白色品牌 logo 卡與促銷文案
 * - 橫向捲動，右側浮出紅色圓形箭頭可向右捲動
 * - 整體置於淺灰圓角容器內，標題列帶藍色斜角標籤
 * - SafeImage 破圖 fallback、MaybeLink 包裹 linkUrl
 */
export function BrandCarousel({ title, items }: BrandCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (!items || items.length === 0) return null;

  const scrollRight = () => {
    scrollerRef.current?.scrollBy({ left: 360, behavior: 'smooth' });
  };

  return (
    <section className="py-8 sm:py-10">
      <div className="container-page">
        <div className="rounded-2xl bg-gray-100/80 p-4 sm:p-6">
          {/* 標題列：藍色斜角標籤 */}
          <div className="mb-4 flex items-center gap-3">
            <span className="h-7 w-2 -skew-x-12 bg-sky-500" />
            <h2 className="text-lg font-bold text-gray-900 sm:text-2xl">{title || '品牌專區'}</h2>
          </div>

          <div className="relative">
            <div
              ref={scrollerRef}
              className="flex snap-x gap-3 overflow-x-auto pb-2 sm:gap-4 [scrollbar-width:thin]"
            >
              {items.map((item) => (
                <MaybeLink
                  key={item.id}
                  href={item.linkUrl}
                  className="group w-44 shrink-0 snap-start overflow-hidden rounded-xl bg-white shadow-sm transition-transform hover:-translate-y-0.5 sm:w-56"
                >
                  {/* 上半：商品情境圖 */}
                  <div className="relative aspect-square overflow-hidden bg-gray-100">
                    <SafeImage
                      src={item.imageUrl}
                      alt={itemAlt(item, title)}
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  {/* 下半：深藍資訊區 + 促銷文案 */}
                  <div className="bg-[#0e4b78] px-3 py-3 text-center">
                    {item.title && (
                      <p className="line-clamp-2 text-sm font-medium text-white">{item.title}</p>
                    )}
                  </div>
                </MaybeLink>
              ))}
            </div>

            {/* 右側捲動箭頭 */}
            {items.length > 3 && (
              <button
                type="button"
                onClick={scrollRight}
                aria-label="向右捲動"
                className="absolute -right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-colors hover:bg-red-600 sm:flex"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
