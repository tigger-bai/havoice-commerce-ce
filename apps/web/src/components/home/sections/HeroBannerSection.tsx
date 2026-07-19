'use client';

import { itemAlt } from './item-utils';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LayoutItem } from '@/types';
import { MaybeLink, SafeImage } from './shared';

interface HeroBannerSectionProps {
  items: LayoutItem[];
}

/**
 * HERO_BANNER — 首頁/商城置頂滿版主視覺輪播（參考附圖 PChome 式大橫幅）
 *
 * 切版重點：
 * - 滿版寬度、寬幅比例（桌機接近 5:2），自動輪播（5s）、滑鼠移入暫停
 * - 左右為白色圓形半透明箭頭（附圖風格）；底部為一排圓點指示器
 * - 每張圖以 MaybeLink 包裹 linkUrl；SafeImage 處理破圖 fallback
 * - 單張時不顯示箭頭與指示器
 */
export function HeroBannerSection({ items }: HeroBannerSectionProps) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;

  const go = useCallback((idx: number) => setCurrent((idx + count) % count), [count]);
  const next = useCallback(() => go(current + 1), [current, go]);
  const prev = useCallback(() => go(current - 1), [current, go]);

  useEffect(() => {
    if (paused || count <= 1) return;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % count), 5000);
    return () => clearInterval(timer);
  }, [paused, count]);

  if (count === 0) return null;

  return (
    <section className="container-page pt-4">
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-gray-900 shadow-sm"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="relative aspect-[16/7] sm:aspect-[5/2]">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={cn(
                'absolute inset-0 transition-opacity duration-700 ease-in-out',
                idx === current ? 'opacity-100' : 'pointer-events-none opacity-0'
              )}
            >
              <MaybeLink href={item.linkUrl} className="block h-full w-full">
                <div className="relative h-full w-full bg-gradient-to-br from-sky-600 via-brand-700 to-brand-900">
                  <SafeImage src={item.imageUrl} alt={itemAlt(item, '主視覺輪播')} />
                </div>
              </MaybeLink>
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="上一張"
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-brand-700 shadow transition-colors hover:bg-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="下一張"
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-brand-700 shadow transition-colors hover:bg-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/20 px-3 py-1.5 backdrop-blur">
              {items.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`切換至第 ${idx + 1} 張`}
                  onClick={() => go(idx)}
                  className={cn(
                    'h-2 rounded-full transition-all',
                    idx === current ? 'w-6 bg-white' : 'w-2 bg-white/60 hover:bg-white/90'
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
