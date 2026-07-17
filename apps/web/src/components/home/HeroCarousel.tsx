'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Article } from '@/types';

interface HeroCarouselProps {
  articles: Article[];
}

/**
 * HeroCarousel - 全滿版大圖輪播
 *
 * 設計升級：
 * - 全螢幕寬度 (100vw) 大圖背景
 * - 黑色漸層遮罩確保白色文字可讀性
 * - 自動輪播 (5s) + 滑鼠懸停暫停
 * - 底部進度條動畫指示當前輪播進度
 * - 左右箭頭導航 + 底部指示器
 */
export function HeroCarousel({ articles }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const INTERVAL = 5000; // 5 秒自動切換

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setProgress(0);
  }, []);

  const next = useCallback(() => {
    goTo((currentIndex + 1) % articles.length);
  }, [currentIndex, articles.length, goTo]);

  const prev = useCallback(() => {
    goTo((currentIndex - 1 + articles.length) % articles.length);
  }, [currentIndex, articles.length, goTo]);

  // 自動輪播
  useEffect(() => {
    if (isPaused || articles.length <= 1) return;
    const timer = setInterval(next, INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused, next, articles.length]);

  // 進度條動畫
  useEffect(() => {
    if (isPaused || articles.length <= 1) return;
    const step = 50; // 每 50ms 更新一次
    const increment = (step / INTERVAL) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => Math.min(prev + increment, 100));
    }, step);
    return () => clearInterval(timer);
  }, [isPaused, currentIndex, articles.length]);

  if (articles.length === 0) return null;

  return (
    <section
      className="relative h-[85vh] min-h-[500px] max-h-[800px] w-full overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 輪播項目 */}
      {articles.map((article, index) => (
        <div
          key={article.id}
          className={cn(
            'absolute inset-0 transition-all duration-1000 ease-in-out',
            index === currentIndex
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-105 pointer-events-none'
          )}
        >
          {/* 全滿版背景圖片 */}
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: article.coverImage
                ? `url(${article.coverImage})`
                : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
            }}
          />

          {/* 多層漸層遮罩 — 確保文字可讀性 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />
        </div>
      ))}

      {/* 內容區域 */}
      <div className="relative z-10 flex h-full items-end">
        <div className="container-page w-full pb-20 sm:pb-24">
          {articles.map((article, index) => (
            <div
              key={article.id}
              className={cn(
                'transition-all duration-700',
                index === currentIndex
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8 absolute pointer-events-none'
              )}
            >
              {index === currentIndex && (
                <div className="max-w-3xl">
                  {/* 分類標籤 */}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-md">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                    {article.category.name}
                  </span>

                  {/* 標題 */}
                  <h1 className="mt-5 text-3xl font-bold leading-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
                    {article.title}
                  </h1>

                  {/* 摘要 */}
                  {article.summary && (
                    <p className="mt-4 line-clamp-2 max-w-2xl text-base text-gray-200/90 sm:text-lg">
                      {article.summary}
                    </p>
                  )}

                  {/* 作者與 CTA */}
                  <div className="mt-8 flex flex-wrap items-center gap-4">
                    <Link
                      href={`/articles/${article.slug}`}
                      className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-gray-900 shadow-xl transition-all hover:bg-brand-50 hover:shadow-2xl hover:shadow-brand-500/10"
                    >
                      閱讀全文
                      <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
                        <span className="text-xs font-semibold text-white">
                          {(article.author.name || 'A')[0]}
                        </span>
                      </div>
                      <span>{article.author.name}</span>
                      <span className="text-gray-500">·</span>
                      <span>{article.viewCount.toLocaleString()} 次閱讀</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 左右箭頭導航 */}
      {articles.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/20 bg-black/30 p-3 text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:left-8"
            aria-label="上一篇"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/20 bg-black/30 p-3 text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:right-8"
            aria-label="下一篇"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </>
      )}

      {/* 底部進度條 + 指示器 */}
      {articles.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-20">
          {/* 指示器圓點 */}
          <div className="container-page flex items-center gap-3 pb-6">
            {articles.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goTo(index)}
                className="group relative h-1 flex-1 max-w-[80px] overflow-hidden rounded-full bg-white/20"
                aria-label={`切換至第 ${index + 1} 張`}
              >
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full bg-white transition-all',
                    index === currentIndex ? 'opacity-100' : 'opacity-0 w-0'
                  )}
                  style={{
                    width: index === currentIndex ? `${progress}%` : '0%',
                  }}
                />
                {index < currentIndex && (
                  <div className="absolute inset-0 rounded-full bg-white/60" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
