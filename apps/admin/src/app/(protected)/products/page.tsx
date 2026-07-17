'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { ErrorAlert, PageHeader } from '@/components/ui/LoadingAndError';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { StockInlineEdit, StatusInlineEdit } from '@/components/products/InlineQuickEdit';
import { formatCurrency, safeNumber } from '@/lib/utils';

/**
 * 商品與庫存管理頁
 *
 * 設計決策（業界標準 B2B 營運後台）：
 * - 列表內「行內快速編輯」：庫存（blur/Enter 觸發 PATCH）、上下架狀態（Select 即時 PATCH）
 * - 樂觀更新：API 成功後僅更新該列對應欄位，無須整頁重抓
 * - 低庫存警示：stock < 10 以紅色強調，並於頁首與橫幅提示
 * - 防禦性：所有數值經 safeNumber 轉換，API 錯誤以 ErrorAlert 呈現，畫面不崩潰
 * - 走後台同源 Next.js Route Handler（/api/products），與 Express 端點隔離
 */

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  status: string;
  coverImage: string;
  categoryName: string;
  vendorId: string | null;
  vendorName: string | null;
  updatedAt: string;
}

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'PUBLISHED', label: '已上架' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'ARCHIVED', label: '已下架' },
];

const LOW_STOCK_THRESHOLD = 10;

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { data: session } = useSession();
  // 多供應商：僅 SUPER_ADMIN / ADMIN 需要辨識商品來源，顯示「供應商」欄；VENDOR 隱藏
  const canSeeVendorColumn = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN';

  const initialStatus = searchParams.get('status') || '';

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState(initialStatus);
  const [keyword, setKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 刪除確認對話框狀態
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '10');
      if (status) params.set('status', status);
      if (keyword.trim()) params.set('keyword', keyword.trim());

      const res = await fetch(`/api/products?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入商品失敗');
      }
      setProducts(Array.isArray(json.data?.items) ? json.data.items : []);
      setTotalPages(safeNumber(json.data?.pagination?.totalPages) || 1);
      setTotal(safeNumber(json.data?.pagination?.total));
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, status, keyword]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleStatusFilter = (s: string) => {
    setStatus(s);
    setPage(1);
    const params = new URLSearchParams();
    if (s) params.set('status', s);
    router.replace(`/products${params.toString() ? `?${params.toString()}` : ''}`);
  };

  // 樂觀更新：行內編輯成功後僅更新該列對應欄位
  const patchRow = (id: string, patch: Partial<ProductRow>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const lowStockCount = products.filter((p) => safeNumber(p.stock) < LOW_STOCK_THRESHOLD).length;

  // 刪除商品（軟刪除），成功後重新載入列表
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '刪除失敗，請稍後再試');
      }
      toast.success('商品已刪除');
      setDeleteTarget(null);
      // 若刪除後當頁可能空了，回退頁碼至合理範圍
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '刪除失敗，請稍後再試');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, toast, fetchProducts]);

  const columns: Column<ProductRow>[] = [
    {
      key: 'product',
      title: '商品',
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
            {p.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.coverImage}
                alt={p.name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 6.75h.008v.008H18V6.75Z" /></svg>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">{p.name || '—'}</p>
            <p className="truncate text-xs text-gray-400">SKU：{p.sku || '—'}．{p.categoryName}</p>
          </div>
        </div>
      ),
    },
    ...(canSeeVendorColumn
      ? [
          {
            key: 'vendor',
            title: '供應商',
            render: (p: ProductRow) =>
              p.vendorName ? (
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                  {p.vendorName}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                  平台自營
                </span>
              ),
          } as Column<ProductRow>,
        ]
      : []),
    {
      key: 'price',
      title: '售價',
      render: (p) => (
        <div>
          <span className="font-semibold text-gray-800">{formatCurrency(p.price)}</span>
          {p.compareAtPrice !== null && safeNumber(p.compareAtPrice) > safeNumber(p.price) && (
            <span className="ml-1.5 text-xs text-gray-400 line-through">
              {formatCurrency(p.compareAtPrice)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'stock',
      title: '現有庫存',
      render: (p) => (
        <StockInlineEdit
          productId={p.id}
          value={p.stock}
          onUpdated={(next) => patchRow(p.id, { stock: next.stock })}
        />
      ),
    },
    {
      key: 'status',
      title: '上下架狀態',
      render: (p) => (
        <StatusInlineEdit
          productId={p.id}
          value={p.status}
          onUpdated={(next) => patchRow(p.id, { status: next.status })}
        />
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/products/${p.id}`}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
            編輯
          </Link>
          <button
            type="button"
            onClick={() => setDeleteTarget(p)}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            刪除
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="商品與庫存"
        description={`共 ${total} 項商品`}
        actions={
          <Link
            href="/products/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新增商品
          </Link>
        }
      />

      {/* 低庫存警示橫幅 */}
      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <svg className="h-5 w-5 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <p className="text-sm font-medium text-rose-800">
            本頁有 <span className="font-bold">{lowStockCount}</span> 項商品庫存低於 {LOW_STOCK_THRESHOLD} 件，請盡快補貨。
          </p>
        </div>
      )}

      {/* 篩選與搜尋列 */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value || 'ALL'}
              type="button"
              onClick={() => handleStatusFilter(s.value)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                status === s.value
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            fetchProducts();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋商品名稱 / SKU"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-56"
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-800 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            搜尋
          </button>
        </form>
      </div>

      {/* 行內編輯提示 */}
      <p className="text-xs text-gray-400">
        提示：庫存數量可直接於欄位中修改，離開欄位（或按 Enter）即自動儲存；狀態下拉選擇後即時生效。庫存低於 {LOW_STOCK_THRESHOLD} 將以紅色標示。
      </p>

      {error && <ErrorAlert message={error} onRetry={fetchProducts} />}

      <DataTable
        columns={columns}
        data={products}
        keyExtractor={(p) => p.id}
        isLoading={isLoading}
        emptyMessage="查無符合條件的商品"
      />

      {totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      )}

      {/* 刪除確認對話框 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="確認刪除商品"
        description={deleteTarget ? `確定要刪除「${deleteTarget.name}」嗎？此操作將商品下架並從列表移除（軟刪除），歷史訂單不受影響。` : ''}
        confirmText="刪除"
        cancelText="取消"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsContent />
    </Suspense>
  );
}
