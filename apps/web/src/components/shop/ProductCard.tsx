'use client';

import Link from 'next/link';
import { useCartStore } from '@/store/useCartStore';
import { formatPrice } from '@/lib/utils';
import type { Product, RecommendedProduct } from '@/types';

type ProductCardItem = Product | RecommendedProduct;

interface ProductCardProps {
  product: ProductCardItem;
  showAddToCart?: boolean;
}

/**
 * ProductCard - 商品卡片元件
 *
 * 設計決策：
 * - 支援 Product 與 RecommendedProduct 兩種型別
 * - 顯示原價劃線與折扣標籤
 * - 「加入購物車」按鈕帶有微互動 (active:scale-95)
 * - 圖片載入失敗時顯示佔位符
 */
export function ProductCard({ product, showAddToCart = true }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const price = parseFloat(product.price);
  const compareAtPrice = product.compareAtPrice
    ? parseFloat(product.compareAtPrice)
    : null;
  const discountPercent =
    compareAtPrice && compareAtPrice > price
      ? Math.round((1 - price / compareAtPrice) * 100)
      : null;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price,
      coverImage: product.coverImage,
    });
  };

  return (
    <Link
      href={`/shop/${product.slug}`}
      className="group block overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-lg hover:-translate-y-1"
    >
      {/* 圖片區 */}
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        <img
          src={product.coverImage}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f3f4f6"/><text x="100" y="100" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="14">No Image</text></svg>';
          }}
        />
        {/* 折扣標籤 */}
        {discountPercent && (
          <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
            -{discountPercent}%
          </span>
        )}
      </div>

      {/* 資訊區 */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-brand-700">
          {product.name}
        </h3>

        {/* 價格 */}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-brand-600">
            {formatPrice(price)}
          </span>
          {compareAtPrice && (
            <span className="text-sm text-gray-400 line-through">
              {formatPrice(compareAtPrice)}
            </span>
          )}
        </div>

        {/* 加入購物車按鈕 */}
        {showAddToCart && (
          <button
            type="button"
            onClick={handleAddToCart}
            className="btn-cart mt-3 w-full"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            加入購物車
          </button>
        )}
      </div>
    </Link>
  );
}
