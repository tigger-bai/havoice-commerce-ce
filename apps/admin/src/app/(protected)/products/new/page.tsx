'use client';

import Link from 'next/link';

import { PageHeader } from '@/components/ui/LoadingAndError';
import { ProductForm } from '@/components/products/ProductForm';

/**
 * 新增商品頁 /products/new
 * 掛載空白的共用 ProductForm（create 模式）
 */
export default function NewProductPage() {
  return (
    <div className="space-y-6">
      {/* 麵包屑 */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/products" className="transition-colors hover:text-gray-600">
          商品與庫存
        </Link>
        <span>/</span>
        <span className="text-gray-700">新增商品</span>
      </nav>

      <PageHeader title="新增商品" description="填寫商品資訊後即可上架或儲存為草稿" />

      <ProductForm mode="create" />
    </div>
  );
}
