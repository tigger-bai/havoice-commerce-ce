'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useToast } from '@/components/ui/Toast';
import { ErrorAlert } from '@/components/ui/LoadingAndError';
import {
  CreateLayoutSectionSchema,
  UpdateLayoutSectionSchema,
  LAYOUT_SECTION_TYPES,
  PAGE_ROUTES,
  PAGE_ROUTE_LABELS,
  type PageRoute,
} from '@havoice/shared';

/**
 * 共用行銷版位（LayoutSection）基本資料表單
 *
 * 設計決策（沿用商品 / 會員模組 UI/UX 與技術堆疊）：
 * - React Hook Form + zodResolver，複用 shared 的 layout schema 作為前後端共用驗證契約
 * - 新增模式以 CreateLayoutSectionSchema；編輯模式以 UpdateLayoutSectionSchema
 * - 聯集型別以 `const schema: any` 收斂，避免 zodResolver 重載比對失敗（沿用 UserForm 做法）
 * - pageRoute：Page Builder 兩層動線核心欄位。新增時由編輯器帶入當前頁面（隱藏唯讀顯示），
 *   編輯時亦顯示其所屬頁面（可切換以搬移版位至其他頁面）
 * - 內容項目（LayoutItem）的管理不在此元件，於版位編輯頁另以 Item 管理區塊處理
 * - 新增 / 儲存成功後導向「該 pageRoute 的頁面編輯器」，維持動線一致
 * - 防禦：送出失敗顯示 ErrorAlert 與中文 Toast
 */

type SectionType = (typeof LAYOUT_SECTION_TYPES)[number];

type SectionFormValues = {
  title: string;
  type: SectionType;
  pageRoute: PageRoute;
  sortOrder: number;
  isActive: boolean;
};

export interface LayoutSectionInitialData extends Partial<SectionFormValues> {
  id?: string;
}

interface LayoutSectionFormProps {
  mode: 'create' | 'edit';
  sectionId?: string;
  initialData?: LayoutSectionInitialData;
  /** 新增模式下由編輯器帶入的當前頁面；編輯模式以 initialData.pageRoute 為準 */
  defaultPageRoute?: PageRoute;
}

const TYPE_OPTIONS: { value: SectionType; label: string }[] = [
  // 新世代大型電商類型
  { value: 'HERO_BANNER', label: '主視覺輪播 (HERO_BANNER)' },
  { value: 'THEME_REC', label: '主題推薦 (THEME_REC)' },
  { value: 'SALES_RANKING', label: '銷售排行 (SALES_RANKING)' },
  { value: 'BRAND_CAROUSEL', label: '品牌牆 (BRAND_CAROUSEL)' },
  { value: 'CATEGORY_FLOOR', label: '分類樓層 (CATEGORY_FLOOR)' },
  // Page Builder 新增積木
  { value: 'ICON_NAVIGATION', label: '圖文導覽 (ICON_NAVIGATION)' },
  { value: 'IMAGE_WITH_TEXT', label: '圖文精選 (IMAGE_WITH_TEXT)' },
  { value: 'PROMO_BANNER', label: '活動橫幅 (PROMO_BANNER)' },
  // legacy（保留相容舊資料）
  { value: 'CAROUSEL', label: '輪播（舊 CAROUSEL）' },
  { value: 'GRID', label: '宮格（舊 GRID）' },
  { value: 'BANNER', label: '橫幅（舊 BANNER）' },
];

// pageRoute → 編輯器路由 slug（'/' → 'home'，'/shop' → 'shop'）
function routeToSlug(route: string): string {
  return route === '/' ? 'home' : route.replace(/^\//, '');
}

const inputClass =
  'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400';
const labelClass = 'block text-sm font-medium text-gray-700';
const errorClass = 'mt-1 text-xs text-rose-600';

export function LayoutSectionForm({ mode, sectionId, initialData, defaultPageRoute }: LayoutSectionFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [submitError, setSubmitError] = useState<string | null>(null);

  // 以單一型別變數收斂，避免聯集型別導致 zodResolver 重載比對失敗
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema: any = mode === 'create' ? CreateLayoutSectionSchema : UpdateLayoutSectionSchema;

  const resolvedPageRoute: PageRoute =
    (initialData?.pageRoute as PageRoute) ?? defaultPageRoute ?? '/shop';

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SectionFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<SectionFormValues>,
    defaultValues: {
      title: initialData?.title ?? '',
      type: (initialData?.type as SectionType) ?? 'HERO_BANNER',
      pageRoute: resolvedPageRoute,
      sortOrder: initialData?.sortOrder ?? 0,
      isActive: initialData?.isActive ?? true,
    },
  });

  const currentPageRoute = watch('pageRoute');

  const onSubmit = useCallback(
    async (values: SectionFormValues) => {
      setSubmitError(null);
      try {
        const endpoint = mode === 'create' ? '/api/layouts' : `/api/layouts/${sectionId}`;
        const method = mode === 'create' ? 'POST' : 'PUT';

        const payload = {
          title: values.title,
          type: values.type,
          pageRoute: values.pageRoute,
          sortOrder: Number(values.sortOrder) || 0,
          isActive: Boolean(values.isActive),
        };

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

        toast.success(mode === 'create' ? '版位已建立' : '版位已更新');
        if (mode === 'create') {
          // 新增後導向該版位編輯頁，方便接續新增內容項目
          router.push(`/layouts/${json.data.id}`);
        } else {
          router.refresh();
        }
      } catch {
        const message = '網路連線異常，請稍後再試';
        setSubmitError(message);
        toast.error(message);
      }
    },
    [mode, sectionId, router, toast]
  );

  const editorSlug = routeToSlug(currentPageRoute ?? resolvedPageRoute);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {submitError && (
        <div className="mb-6">
          <ErrorAlert message={submitError} />
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">版位基本資料</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className={labelClass}>
              版位標題 <span className="text-rose-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              className={inputClass}
              placeholder="例如：首頁主視覺輪播"
              {...register('title')}
            />
            {errors.title && <p className={errorClass}>{errors.title.message}</p>}
          </div>

          <div>
            <label htmlFor="type" className={labelClass}>
              版位類型 <span className="text-rose-500">*</span>
            </label>
            <select id="type" className={inputClass} {...register('type')}>
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.type && <p className={errorClass}>{errors.type.message}</p>}
          </div>

          <div>
            <label htmlFor="pageRoute" className={labelClass}>
              所屬頁面 <span className="text-rose-500">*</span>
            </label>
            <select id="pageRoute" className={inputClass} {...register('pageRoute')}>
              {PAGE_ROUTES.map((route) => (
                <option key={route} value={route}>
                  {PAGE_ROUTE_LABELS[route] || route}（{route}）
                </option>
              ))}
            </select>
            {errors.pageRoute && <p className={errorClass}>{errors.pageRoute.message}</p>}
            <p className="mt-1 text-xs text-gray-400">此版位會渲染於所選頁面，可切換以搬移至其他頁面。</p>
          </div>

          <div>
            <label htmlFor="sortOrder" className={labelClass}>
              排序 (數字越小越前面)
            </label>
            <input
              id="sortOrder"
              type="number"
              min={0}
              step={1}
              className={inputClass}
              placeholder="0"
              {...register('sortOrder', { valueAsNumber: true })}
            />
            {errors.sortOrder && <p className={errorClass}>{errors.sortOrder.message}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                {...register('isActive')}
              />
              <span className="text-sm font-medium text-gray-700">啟用此版位（前台顯示）</span>
            </label>
            {errors.isActive && <p className={errorClass}>{errors.isActive.message}</p>}
          </div>
        </div>
      </section>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(`/layouts/editor/${editorSlug}`)}
          disabled={isSubmitting}
          className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {mode === 'create' ? '建立版位' : '儲存變更'}
        </button>
      </div>
    </form>
  );
}
