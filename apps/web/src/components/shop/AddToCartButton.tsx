'use client';

import { useState } from 'react';
import { useCartStore } from '@/store/useCartStore';

interface AddToCartButtonProps {
  product: {
    productId: string;
    name: string;
    slug: string;
    price: number;
    coverImage: string;
  };
  disabled?: boolean;
}

/**
 * AddToCartButton - 加入購物車按鈕 (Client Component)
 *
 * 設計決策：
 * - 獨立為 Client Component，因為需要存取 Zustand Store
 * - 加入後顯示短暫的成功動畫反饋
 * - 售罄時禁用按鈕
 */
export function AddToCartButton({ product, disabled }: AddToCartButtonProps) {
  const addItem = useCartStore((state) => state.addItem);
  const [isAdded, setIsAdded] = useState(false);

  const handleClick = () => {
    addItem(product);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="w-full rounded-xl bg-gray-200 px-8 py-4 text-base font-semibold text-gray-400 cursor-not-allowed"
      >
        已售罄
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-xl bg-brand-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-700 hover:shadow-xl active:scale-[0.98]"
    >
      {isAdded ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          已加入購物車
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
          加入購物車
        </span>
      )}
    </button>
  );
}
