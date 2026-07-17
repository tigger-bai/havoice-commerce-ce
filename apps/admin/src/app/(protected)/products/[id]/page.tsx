'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { PageHeader, LoadingSpinner, ErrorAlert } from '@/components/ui/LoadingAndError';
import { ProductForm, type ProductFormInitialData } from '@/components/products/ProductForm';

/**
 * 編輯商品頁 /products/[id]
 * 先以 GET /api/products/[id] 取得完整商品資料供表單預填
 * 防禦：載入中顯示 spinner，找不到 / 錯誤顯示 ErrorAlert
 */
export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [data, setData] = useState<ProductFormInitialData | null>(null);
  const [productName, setProductName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProduct = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${id}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入商品資料失敗');
      }
      const p = json.data;
      setProductName(p.name ?? '');
      setData({
        id: p.id,
        name: p.name ?? '',
        slug: p.slug ?? '',
        description: p.description ?? '',
        price: Number(p.price) || 0,
        compareAtPrice: p.compareAtPrice === null || p.compareAtPrice === undefined ? null : Number(p.compareAtPrice) || 0,
        sku: p.sku ?? '',
        stock: Number(p.stock) || 0,
        coverImage: p.coverImage ?? '',
        categoryId: p.categoryId ?? '',
        status: (p.status as ProductFormInitialData['status']) ?? 'DRAFT',
        vendorId: p.vendorId ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  return (
    <div className="space-y-6">
      {/* 麵包屑 */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/products" className="transition-colors hover:text-gray-600">
          商品與庫存
        </Link>
        <span>/</span>
        <span className="text-gray-700">編輯商品</span>
      </nav>

      <PageHeader title="編輯商品" description={productName ? `正在編輯：${productName}` : '修改商品資訊'} />

      {isLoading && <LoadingSpinner message="載入商品資料中..." />}

      {!isLoading && error && <ErrorAlert message={error} onRetry={fetchProduct} />}

      {!isLoading && !error && data && (
        <ProductForm mode="edit" productId={id} initialData={data} />
      )}
    </div>
  );
}
