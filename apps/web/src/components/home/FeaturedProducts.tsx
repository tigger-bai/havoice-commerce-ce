'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useCartStore } from '@/store/useCartStore';
import { formatPrice, cn } from '@/lib/utils';
import type { Product } from '@/types';

interface FeaturedProductsProps {
  products: Product[];
}

/**
 * FeaturedProducts - 熱銷保健推薦（水平滑動卡片）
 *
 * 設計特色：
 * - 水平滾動容器，支援觸控滑動
 * - 左右箭頭按鈕控制滾動
 * - 卡片 hover 上浮 + 陰影加深
 * - 折扣標籤 + 加入購物車按鈕
 * - 漸層背景區塊增加視覺層次
 */
export function FeaturedProducts({ products }: FeaturedProductsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const addItem = useCartStore((state) => state.addItem);

  if (products.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 340;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-gray-50 via-brand-50/30 to-gray-50 py-20">
      {/* 裝飾背景 */}
      <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-brand-100/40 blur-3xl" />
      <div className="absolute -left-20 bottom-0 h-60 w-60 rounded-full bg-accent-100/30 blur-3xl" />

      <div className="container-page relative">
        {/* 區塊標題 */}
        <div className="flex items-end justify-between">
          <div>
            <span className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              Best Sellers
            </span>
            <h2 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
              熱銷保健推薦
            </h2>
            <p className="mt-2 max-w-lg text-gray-500">
              經過嚴格篩選的高品質保健食品，為你的健康加分
            </p>
          </div>

          {/* 滾動控制按鈕 */}
          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scroll('left')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-all hover:border-brand-300 hover:text-brand-600 hover:shadow-md"
              aria-label="向左滾動"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-all hover:border-brand-300 hover:text-brand-600 hover:shadow-md"
              aria-label="向右滾動"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>

        {/* 商品滑動容器 */}
        <div
          ref={scrollRef}
          className="mt-10 flex gap-6 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {products.map((product) => {
            const price = parseFloat(product.price);
            const compareAtPrice = product.compareAtPrice
              ? parseFloat(product.compareAtPrice)
              : null;
            const discountPercent =
              compareAtPrice && compareAtPrice > price
                ? Math.round((1 - price / compareAtPrice) * 100)
                : null;

            return (
              <div
                key={product.id}
                className="w-[300px] flex-shrink-0 snap-start"
              >
                <div className="group h-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-xl hover:-translate-y-2">
                  {/* 圖片區 */}
                  <Link href={`/shop/${product.slug}`} className="relative block aspect-square overflow-hidden bg-gray-50">
                    <img
                      src={product.coverImage}
                      alt={product.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f9fafb"/><text x="100" y="100" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12">No Image</text></svg>';
                      }}
                    />
                    {/* 折扣標籤 */}
                    {discountPercent && (
                      <div className="absolute left-3 top-3 rounded-lg bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow-lg shadow-red-500/30">
                        -{discountPercent}%
                      </div>
                    )}
                  </Link>

                  {/* 資訊區 */}
                  <div className="p-5">
                    <Link href={`/shop/${product.slug}`}>
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 transition-colors group-hover:text-brand-700">
                        {product.name}
                      </h3>
                    </Link>

                    {/* 價格 */}
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-xl font-bold text-brand-600">
                        {formatPrice(price)}
                      </span>
                      {compareAtPrice && (
                        <span className="text-sm text-gray-400 line-through">
                          {formatPrice(compareAtPrice)}
                        </span>
                      )}
                    </div>

                    {/* 加入購物車 */}
                    <button
                      type="button"
                      onClick={() =>
                        addItem({
                          productId: product.id,
                          name: product.name,
                          slug: product.slug,
                          price,
                          coverImage: product.coverImage,
                        })
                      }
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[0.97]"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      加入購物車
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
