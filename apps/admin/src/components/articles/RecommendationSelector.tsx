'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Product, PaginatedData, RecommendedProduct } from '@/types/entities';

interface RecommendationItem {
  productId: string;
  productName: string;
  productImage: string;
  productPrice: string;
  sortOrder: number;
}

interface RecommendationSelectorProps {
  articleId?: string;
  initialRecommendations?: RecommendedProduct[];
  onChange: (recommendations: { productId: string; sortOrder: number }[]) => void;
}

/**
 * RecommendationSelector - 雙欄導購商品設定器
 *
 * 設計決策：
 * - 左側：可搜尋的商品列表，支援勾選/取消勾選
 * - 右側：已選商品列表，可手動輸入 sortOrder 或拖曳排序
 * - 即時同步 onChange 回傳最新的推薦設定
 * - 搜尋使用防抖 (debounce) 避免過多 API 請求
 */
export function RecommendationSelector({
  initialRecommendations = [],
  onChange,
}: RecommendationSelectorProps) {
  // ─── 左側：可選商品列表 ───
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // ─── 右側：已選推薦商品 ───
  const [selectedItems, setSelectedItems] = useState<RecommendationItem[]>([]);

  // 初始化已選商品
  useEffect(() => {
    if (initialRecommendations.length > 0) {
      setSelectedItems(
        initialRecommendations.map((rec) => ({
          productId: rec.id,
          productName: rec.name,
          productImage: rec.coverImage,
          productPrice: rec.price,
          sortOrder: rec.sortOrder,
        }))
      );
    }
  }, [initialRecommendations]);

  // 搜尋商品（含防抖）
  const searchProducts = useCallback(async (query: string) => {
    setIsSearching(true);
    try {
      const result = await apiClient.get<PaginatedData<Product>>(
        '/api/products',
        { page: 1, limit: 20, status: 'PUBLISHED' }
      );
      // 前端過濾（實際生產環境應在後端加上搜尋功能）
      const filtered = query
        ? result.data.filter(
            (p) =>
              p.name.toLowerCase().includes(query.toLowerCase()) ||
              p.sku.toLowerCase().includes(query.toLowerCase())
          )
        : result.data;
      setAvailableProducts(filtered);
    } catch {
      setAvailableProducts([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchProducts(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchProducts]);

  // 勾選商品（加入右側）
  const handleSelect = (product: Product) => {
    const exists = selectedItems.find((item) => item.productId === product.id);
    if (exists) return;

    const newItem: RecommendationItem = {
      productId: product.id,
      productName: product.name,
      productImage: product.coverImage,
      productPrice: product.price,
      sortOrder: selectedItems.length, // 自動遞增排序
    };

    const updated = [...selectedItems, newItem];
    setSelectedItems(updated);
    notifyChange(updated);
  };

  // 取消勾選（從右側移除）
  const handleDeselect = (productId: string) => {
    const updated = selectedItems.filter((item) => item.productId !== productId);
    setSelectedItems(updated);
    notifyChange(updated);
  };

  // 更新排序權重
  const handleSortOrderChange = (productId: string, sortOrder: number) => {
    const updated = selectedItems.map((item) =>
      item.productId === productId ? { ...item, sortOrder } : item
    );
    setSelectedItems(updated);
    notifyChange(updated);
  };

  // 上移
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...selectedItems];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    // 重新計算 sortOrder
    const reordered = updated.map((item, i) => ({ ...item, sortOrder: i }));
    setSelectedItems(reordered);
    notifyChange(reordered);
  };

  // 下移
  const handleMoveDown = (index: number) => {
    if (index === selectedItems.length - 1) return;
    const updated = [...selectedItems];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    const reordered = updated.map((item, i) => ({ ...item, sortOrder: i }));
    setSelectedItems(reordered);
    notifyChange(reordered);
  };

  // 通知父元件
  const notifyChange = (items: RecommendationItem[]) => {
    onChange(
      items.map((item) => ({
        productId: item.productId,
        sortOrder: item.sortOrder,
      }))
    );
  };

  const isSelected = (productId: string) =>
    selectedItems.some((item) => item.productId === productId);

  return (
    <div className="space-y-3">
      <label className="label-text">導購推薦商品設定</label>
      <p className="text-xs text-gray-500">
        從左側搜尋並勾選商品，右側可調整顯示順序（數字越小越靠前，最多 20 個）
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ═══ 左側：可選商品列表 ═══ */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-3">
            <h4 className="mb-2 text-sm font-semibold text-gray-700">
              可選商品
            </h4>
            <input
              type="text"
              placeholder="搜尋商品名稱或 SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field text-sm"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {isSearching ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-primary-600" />
                <span className="ml-2 text-sm text-gray-500">搜尋中...</span>
              </div>
            ) : availableProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                無符合條件的商品
              </p>
            ) : (
              <div className="space-y-1">
                {availableProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleSelect(product)}
                    disabled={isSelected(product.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors',
                      isSelected(product.id)
                        ? 'cursor-not-allowed bg-green-50 opacity-60'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    {/* 勾選狀態 */}
                    <div
                      className={cn(
                        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border',
                        isSelected(product.id)
                          ? 'border-green-500 bg-green-500'
                          : 'border-gray-300'
                      )}
                    >
                      {isSelected(product.id) && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </div>

                    {/* 商品圖片 */}
                    <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                      <img
                        src={product.coverImage}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><rect width="24" height="24"/></svg>';
                        }}
                      />
                    </div>

                    {/* 商品資訊 */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {product.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        NT$ {product.price} | SKU: {product.sku}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ 右側：已選商品（可排序） ═══ */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-3">
            <h4 className="text-sm font-semibold text-gray-700">
              已選推薦商品
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({selectedItems.length} / 20)
              </span>
            </h4>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {selectedItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                尚未選擇任何推薦商品
              </p>
            ) : (
              <div className="space-y-1">
                {selectedItems
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((item, index) => (
                    <div
                      key={item.productId}
                      className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2.5"
                    >
                      {/* 排序控制 */}
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          aria-label="上移"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === selectedItems.length - 1}
                          className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          aria-label="下移"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </div>

                      {/* 商品圖片 */}
                      <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded bg-gray-200">
                        <img
                          src={item.productImage}
                          alt={item.productName}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><rect width="24" height="24"/></svg>';
                          }}
                        />
                      </div>

                      {/* 商品名稱 */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {item.productName}
                        </p>
                        <p className="text-xs text-gray-500">
                          NT$ {item.productPrice}
                        </p>
                      </div>

                      {/* 排序權重輸入 */}
                      <input
                        type="number"
                        min={0}
                        value={item.sortOrder}
                        onChange={(e) =>
                          handleSortOrderChange(
                            item.productId,
                            parseInt(e.target.value, 10) || 0
                          )
                        }
                        className="w-14 rounded border border-gray-300 px-2 py-1 text-center text-xs"
                        title="排序權重"
                      />

                      {/* 移除按鈕 */}
                      <button
                        type="button"
                        onClick={() => handleDeselect(item.productId)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="移除"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
