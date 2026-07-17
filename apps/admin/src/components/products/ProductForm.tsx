'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { CreateProductSchema } from '@havoice/shared';

import { useToast } from '@/components/ui/Toast';
import { ErrorAlert } from '@/components/ui/LoadingAndError';
import { ImageUpload } from '@/components/ui/ImageUpload';

/**
 * 共用商品表單（新增 / 編輯複用）
 *
 * 設計決策（業界 SaaS 標準）：
 * - React Hook Form + zodResolver，複用 shared 的 CreateProductSchema 作為前後端共用驗證契約
 * - 左右雙欄佈局：左為主資訊（名稱/slug/描述/封面圖），右為設定（價格/原價/SKU/庫存/狀態）
 * - 固定底部 Action Bar（儲存 / 取消），sticky 於畫面底部
 * - 封面圖 URL 即時預覽
 * - 新增模式下，名稱輸入時自動由其生成 slug（使用者尚未手動修改 slug 時）
 * - 防禦：送出失敗顯示 ErrorAlert 與 Toast，欄位錯誤逐一顯示，畫面不崩潰
 */

// 使用 schema 的 input 型別（含 default 的欄位於輸入時為 optional）
type ProductFormValues = {
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice?: number | null;
  sku: string;
  stock: number;
  coverImage: string;
  categoryId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  vendorId?: string | null;
};

interface CategoryOption {
  id: string;
  name: string;
}

interface VendorOption {
  id: string;
  name: string;
  email: string;
}

export interface ProductFormInitialData extends Partial<ProductFormValues> {
  id?: string;
}

interface ProductFormProps {
  mode: 'create' | 'edit';
  productId?: string;
  initialData?: ProductFormInitialData;
}

const STATUS_OPTIONS: { value: ProductFormValues['status']; label: string }[] = [
  { value: 'DRAFT', label: '草稿 (DRAFT)' },
  { value: 'PUBLISHED', label: '已上架 (PUBLISHED)' },
  { value: 'ARCHIVED', label: '已下架 (ARCHIVED)' },
];

/** 由名稱生成 slug：轉小寫、空白與非法字元轉連字號 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/[\u4e00-\u9fa5]/g, ''); // 中文無法直接成為合法 slug，移除以避免 regex 驗證失敗
}

const inputClass =
  'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400';
const labelClass = 'block text-sm font-medium text-gray-700';
const errorClass = 'mt-1 text-xs text-rose-600';

export function ProductForm({ mode, productId, initialData }: ProductFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const { data: session } = useSession();
  // 多供應商：僅 SUPER_ADMIN / ADMIN 可指派 vendorId；VENDOR 徹底隱藏此欄
  const canAssignVendor = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN';

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  // 圖片上傳中：用於停用提交按鈕，防止尚未上傳完成即送出
  const [isUploading, setIsUploading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(CreateProductSchema) as unknown as Resolver<ProductFormValues>,
    defaultValues: {
      name: initialData?.name ?? '',
      slug: initialData?.slug ?? '',
      description: initialData?.description ?? '',
      price: initialData?.price ?? 0,
      compareAtPrice: initialData?.compareAtPrice ?? null,
      sku: initialData?.sku ?? '',
      stock: initialData?.stock ?? 0,
      coverImage: initialData?.coverImage ?? '',
      categoryId: initialData?.categoryId ?? '',
      status: initialData?.status ?? 'DRAFT',
      vendorId: initialData?.vendorId ?? null,
    },
  });

  const nameValue = watch('name');

  // 載入分類清單
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/categories', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json?.error?.message || '載入分類失敗');
        if (active) setCategories(Array.isArray(json.data?.items) ? json.data.items : []);
      } catch {
        if (active) toast.error('無法載入分類清單，請重新整理頁面');
      }
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  // 載入供應商清單（僅 SUPER_ADMIN / ADMIN 需要指派）
  useEffect(() => {
    if (!canAssignVendor) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/vendors', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json?.error?.message || '載入供應商失敗');
        if (active) setVendors(Array.isArray(json.data?.items) ? json.data.items : []);
      } catch {
        if (active) toast.error('無法載入供應商清單，請重新整理頁面');
      }
    })();
    return () => {
      active = false;
    };
  }, [canAssignVendor, toast]);

  // 新增模式：名稱變動時自動生成 slug（使用者尚未手動修改 slug）
  useEffect(() => {
    if (mode === 'create' && !slugTouched && nameValue) {
      setValue('slug', slugify(nameValue), { shouldValidate: false });
    }
  }, [nameValue, slugTouched, mode, setValue]);

  const onSubmit = useCallback(
    async (values: ProductFormValues) => {
      setSubmitError(null);
      try {
        const endpoint = mode === 'create' ? '/api/products' : `/api/products/${productId}`;
        const method = mode === 'create' ? 'POST' : 'PUT';

        const payload: Record<string, unknown> = {
          ...values,
          compareAtPrice:
            values.compareAtPrice === null || values.compareAtPrice === undefined || Number.isNaN(values.compareAtPrice)
              ? null
              : values.compareAtPrice,
        };

        // 多供應商：VENDOR 不可指派 vendorId（後端亦會強制忽略），前端移除以避免誤傳
        if (!canAssignVendor) {
          delete payload.vendorId;
        } else {
          payload.vendorId =
            values.vendorId === '' || values.vendorId === undefined ? null : values.vendorId;
        }

        const res = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (!res.ok || !json.success) {
          const message = json?.error?.message || '儲存失敗，請稍後再試';
          setSubmitError(message);
          toast.error(message);
          return;
        }

        toast.success(mode === 'create' ? '商品已建立' : '商品已更新');
        router.push('/products');
        router.refresh();
      } catch {
        const message = '網路連線異常，請稍後再試';
        setSubmitError(message);
        toast.error(message);
      }
    },
    [mode, productId, router, toast, canAssignVendor]
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="pb-24">
      {submitError && (
        <div className="mb-6">
          <ErrorAlert message={submitError} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左側：主資訊區 */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">基本資訊</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className={labelClass}>
                  商品名稱 <span className="text-rose-500">*</span>
                </label>
                <input id="name" type="text" className={inputClass} placeholder="例如：經典藍牙耳機" {...register('name')} />
                {errors.name && <p className={errorClass}>{errors.name.message}</p>}
              </div>

              <div>
                <label htmlFor="slug" className={labelClass}>
                  Slug <span className="text-rose-500">*</span>
                </label>
                <input
                  id="slug"
                  type="text"
                  className={inputClass}
                  placeholder="例如：classic-bluetooth-earphone"
                  {...register('slug', {
                    onChange: () => setSlugTouched(true),
                  })}
                />
                <p className="mt-1 text-xs text-gray-400">僅允許小寫英文、數字與連字號。新增時會依名稱自動生成，亦可手動修改。</p>
                {errors.slug && <p className={errorClass}>{errors.slug.message}</p>}
              </div>

              <div>
                <label htmlFor="description" className={labelClass}>
                  商品描述 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="description"
                  rows={8}
                  className={`${inputClass} resize-y`}
                  placeholder="請輸入商品的詳細描述..."
                  {...register('description')}
                />
                {errors.description && <p className={errorClass}>{errors.description.message}</p>}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">商品圖片</h2>
            <div>
              <label className={labelClass}>
                封面圖片 <span className="text-rose-500">*</span>
              </label>
              <p className="mb-2 text-xs text-gray-400">上傳成功後將自動儲存至雲端（Cloudinary）並套用於商品封面。</p>
              <Controller
                control={control}
                name="coverImage"
                render={({ field }) => (
                  <ImageUpload
                    value={field.value}
                    onChange={field.onChange}
                    onUploadingChange={setIsUploading}
                    disabled={isSubmitting}
                  />
                )}
              />
              {errors.coverImage && <p className={`${errorClass} mt-2`}>{errors.coverImage.message}</p>}
            </div>
          </section>
        </div>

        {/* 右側：設定區 */}
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">價格與庫存</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="price" className={labelClass}>
                  售價 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  {...register('price', { valueAsNumber: true })}
                />
                {errors.price && <p className={errorClass}>{errors.price.message}</p>}
              </div>

              <div>
                <label htmlFor="compareAtPrice" className={labelClass}>
                  原價（選填，用於顯示折扣）
                </label>
                <Controller
                  control={control}
                  name="compareAtPrice"
                  render={({ field }) => (
                    <input
                      id="compareAtPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      className={inputClass}
                      value={field.value === null || field.value === undefined ? '' : field.value}
                      onChange={(e) => {
                        const v = e.target.value;
                        field.onChange(v === '' ? null : Number(v));
                      }}
                    />
                  )}
                />
                {errors.compareAtPrice && <p className={errorClass}>{errors.compareAtPrice.message}</p>}
              </div>

              <div>
                <label htmlFor="sku" className={labelClass}>
                  SKU <span className="text-rose-500">*</span>
                </label>
                <input id="sku" type="text" className={inputClass} placeholder="例如：BT-EAR-001" {...register('sku')} />
                {errors.sku && <p className={errorClass}>{errors.sku.message}</p>}
              </div>

              <div>
                <label htmlFor="stock" className={labelClass}>
                  庫存數量 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="stock"
                  type="number"
                  min="0"
                  step="1"
                  className={inputClass}
                  {...register('stock', { valueAsNumber: true })}
                />
                {errors.stock && <p className={errorClass}>{errors.stock.message}</p>}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">分類與狀態</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="categoryId" className={labelClass}>
                  商品分類 <span className="text-rose-500">*</span>
                </label>
                <select id="categoryId" className={inputClass} {...register('categoryId')}>
                  <option value="">請選擇分類...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.categoryId && <p className={errorClass}>{errors.categoryId.message}</p>}
              </div>

              <div>
                <label htmlFor="status" className={labelClass}>
                  上下架狀態 <span className="text-rose-500">*</span>
                </label>
                <select id="status" className={inputClass} {...register('status')}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {errors.status && <p className={errorClass}>{errors.status.message}</p>}
              </div>
            </div>
          </section>

          {/* 多供應商：指派供應商（僅 SUPER_ADMIN / ADMIN 可見） */}
          {canAssignVendor && (
            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">供應商指派</h2>
              <div>
                <label htmlFor="vendorId" className={labelClass}>
                  指派供應商
                </label>
                <Controller
                  control={control}
                  name="vendorId"
                  render={({ field }) => (
                    <select
                      id="vendorId"
                      className={inputClass}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                    >
                      <option value="">平台自營（不指派供應商）</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name ? `${v.name}（${v.email}）` : v.email}
                        </option>
                      ))}
                    </select>
                  )}
                />
                <p className="mt-1 text-xs text-gray-400">
                  指派後該商品歸屬於對應廠商，廠商登入後可於自己的後台管理此商品。未指派則為平台自營。
                </p>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 固定底部 Action Bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/90 backdrop-blur-md lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-6 py-3">
          <button
            type="button"
            onClick={() => router.push('/products')}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isUploading}
            title={isUploading ? '圖片上傳中，請稍後' : undefined}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {mode === 'create' ? '建立商品' : '儲存變更'}
          </button>
        </div>
      </div>
    </form>
  );
}
