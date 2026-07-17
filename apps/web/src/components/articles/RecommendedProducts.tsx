'use client';

import { ProductCard } from '@/components/shop/ProductCard';
import type { RecommendedProduct } from '@/types';

interface RecommendedProductsProps {
  products: RecommendedProduct[];
}

/**
 * RecommendedProducts - 文章底部導購推薦商品區塊
 *
 * 設計決策：
 * - 商品已依照 sortOrder 升序排列（由後端保證）
 * - 使用 ProductCard 統一渲染商品卡片
 * - 每張卡片具備「加入購物車」按鈕
 * - 響應式網格：行動裝置 1 欄、平板 2 欄、桌面 3-4 欄
 */
export function RecommendedProducts({ products }: RecommendedProductsProps) {
  if (products.length === 0) return null;

  return (
    <section className="mt-12 border-t border-gray-100 pt-10">
      {/* 區塊標題 */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100">
          <svg className="h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            為你推薦
          </h3>
          <p className="text-sm text-gray-500">
            精選與本文相關的優質商品
          </p>
        </div>
      </div>

      {/* 商品網格 */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            showAddToCart={true}
          />
        ))}
      </div>
    </section>
  );
}
