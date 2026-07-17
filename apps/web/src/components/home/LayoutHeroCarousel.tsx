'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { LayoutItem } from '@/types';

interface LayoutHeroCarouselProps {
  items: LayoutItem[];
}

/**
 * LayoutHeroCarousel — 行銷版位「輪播 (CAROUSEL)」全滿版渲染元件
 *
 * 設計決策（沿用既有 HeroCarousel 的視覺與互動，改為資料驅動）：
 * - 全寬大圖背景 + 漸層遮罩（即使無輔助標題也維持沉浸式視覺）
 * - 自動輪播 (5s) + 滑鼠懸停暫停 + 左右箭頭 + 底部進度指示器
 * - 每張圖以 Link 包裹（linkUrl 存在才可點擊；否則為靜態展示）
 * - 圖片載入失敗時以漸層底色 fallback，不破壞版面（透過 onError 隱藏 <img>）
 * - RWD：高度隨斷點調整，手機版仍維持合理比例
 */
export function LayoutHeroCarousel({ items }: LayoutHeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const INTERVAL = 5000;
  const count = items.length;

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setProgress(0);
  }, []);

  const next = useCallback(() => {
    goTo((currentIndex + 1) % count);
  }, [currentIndex, count, goTo]);

  const prev = useCallback(() => {
    goTo((currentIndex - 1 + count) % count);
  }, [currentIndex, count, goTo]);

  // 自動輪播
  useEffect(() => {
    if (isPaused || count <= 1) return;
    const timer = setInterval(next, INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused, next, count]);

  // 進度條動畫
  useEffect(() => {
    if (isPaused || count <= 1) return;
    const step = 50;
    const increment = (step / INTERVAL) * 100;
    const timer = setInterval(() => {
      setProgress((p) => Math.min(p + increment, 100));
    }, step);
    return () => clearInterval(timer);
  }, [isPaused, currentIndex, count]);

  if (count === 0) return null;

  return (
    <section
      className="relative h-[60vh] min-h-[360px] max-h-[760px] w-full overflow-hidden bg-gray-900 sm:h-[72vh]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {items.map((item, index) => {
        const active = index === currentIndex;

        const slide = (
          <div className="absolute inset-0">
            {/* fallback 漸層底色（圖片載入前 / 失敗時可見） */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-800 via-brand-900 to-gray-900" />

            {/* 背景圖片 */}
            {item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt={item.title || '行銷輪播圖'}
                className="absolute inset-0 h-full w-full object-cover"
                loading={index === 0 ? 'eager' : 'lazy'}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}

            {/* 漸層遮罩 — 提升輔助標題可讀性 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />

            {/* 輔助標題（選填） */}
            {item.title && (
              <div className="absolute inset-x-0 bottom-0 z-10">
                <div className="container-page pb-16 sm:pb-20">
                  <h2 className="max-w-3xl text-2xl font-bold leading-tight text-white drop-shadow-lg sm:text-4xl md:text-5xl">
                    {item.title}
                  </h2>
                </div>
              </div>
            )}
          </div>
        );

        return (
          <div
            key={item.id}
            className={cn(
              'absolute inset-0 transition-all duration-1000 ease-in-out',
              active ? 'opacity-100 scale-100' : 'pointer-events-none scale-105 opacity-0'
            )}
            aria-hidden={!active}
          >
            {item.linkUrl ? (
              <Link href={item.linkUrl} className="block h-full w-full" tabIndex={active ? 0 : -1}>
                {slide}
              </Link>
            ) : (
              slide
            )}
          </div>
        );
      })}

      {/* 左右箭頭 */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/20 bg-black/30 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:left-8 sm:p-3"
            aria-label="上一張"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/20 bg-black/30 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:right-8 sm:p-3"
            aria-label="下一張"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </>
      )}

      {/* 底部進度指示器 */}
      {count > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <div className="container-page flex items-center gap-3 pb-5">
            {items.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goTo(index)}
                className="group relative h-1 max-w-[80px] flex-1 overflow-hidden rounded-full bg-white/20"
                aria-label={`切換至第 ${index + 1} 張`}
              >
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full bg-white transition-all',
                    index === currentIndex ? 'opacity-100' : 'w-0 opacity-0'
                  )}
                  style={{ width: index === currentIndex ? `${progress}%` : '0%' }}
                />
                {index < currentIndex && <div className="absolute inset-0 rounded-full bg-white/60" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
