'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useToast } from '@/components/ui/Toast';
import { ErrorAlert } from '@/components/ui/LoadingAndError';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { CreateUserSchema, UpdateUserSchema } from '@/lib/schemas/user.schema';
import { formatDateTime } from '@/lib/utils';

/**
 * 共用會員表單（新增 / 編輯複用）
 *
 * 設計決策（沿用商品模組 UI/UX 與技術堆疊）：
 * - React Hook Form + zodResolver，複用 user.schema 作為前後端共用驗證契約
 * - 新增模式以 CreateUserSchema（密碼必填）；編輯模式以 UpdateUserSchema（密碼選填、留空不更新）
 * - 左右雙欄佈局：左為基本資訊（姓名/Email/密碼），右為設定（頭像/角色/狀態）
 * - 頭像 image 串接既有 ImageUpload 元件（拖曳上傳 + 即時預覽），透過 Controller 接入 RHF
 * - 固定底部 Action Bar（儲存 / 取消），sticky 於畫面底部；上傳中一併停用提交
 * - 防禦：送出失敗顯示 ErrorAlert 與 Toast；Email 重複（409）以 Toast 顯示「此 Email 已被使用」
 */

type UserFormValues = {
  name: string;
  email: string;
  password?: string;
  role: 'USER';
  status: 'ACTIVE' | 'SUSPENDED';
  image?: string;
  phone?: string;
  address?: string;
  remark?: string;
};

export interface UserFormInitialData extends Partial<UserFormValues> {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface UserFormProps {
  mode: 'create' | 'edit';
  userId?: string;
  initialData?: UserFormInitialData;
}

const STATUS_OPTIONS: { value: UserFormValues['status']; label: string }[] = [
  { value: 'ACTIVE', label: '啟用 (ACTIVE)' },
  { value: 'SUSPENDED', label: '停權 (SUSPENDED)' },
];

const inputClass =
  'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400';
const labelClass = 'block text-sm font-medium text-gray-700';
const errorClass = 'mt-1 text-xs text-rose-600';

export function UserForm({ mode, userId, initialData }: UserFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // 以單一型別變數收斂，避免聯集型別導致 zodResolver 重載比對失敗
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema: any = mode === 'create' ? CreateUserSchema : UpdateUserSchema;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<UserFormValues>,
    defaultValues: {
      name: initialData?.name ?? '',
      email: initialData?.email ?? '',
      password: '',
      role: 'USER',
      status: (initialData?.status as UserFormValues['status']) ?? 'ACTIVE',
      image: initialData?.image ?? '',
      phone: initialData?.phone ?? '',
      address: initialData?.address ?? '',
      remark: initialData?.remark ?? '',
    },
  });

  const onSubmit = useCallback(
    async (values: UserFormValues) => {
      setSubmitError(null);
      try {
        const endpoint = mode === 'create' ? '/api/users' : `/api/users/${userId}`;
        const method = mode === 'create' ? 'POST' : 'PUT';

        // 編輯模式下，密碼留空代表不更新 → 不送出該欄位
        const payload: Record<string, unknown> = {
          name: values.name,
          email: values.email,
          role: 'USER',
          status: values.status,
          image: values.image ?? '',
          phone: values.phone ?? '',
          address: values.address ?? '',
          remark: values.remark ?? '',
        };
        if (mode === 'create') {
          payload.password = values.password;
        } else if (values.password && values.password.trim() !== '') {
          payload.password = values.password;
        }

        const res = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (!res.ok || !json.success) {
          // Email 重複（409）特別處理
          const message =
            json?.error?.code === 'EMAIL_TAKEN'
              ? '此 Email 已被使用'
              : json?.error?.message || '儲存失敗，請稍後再試';
          setSubmitError(message);
          toast.error(message);
          return;
        }

        toast.success(mode === 'create' ? '會員已建立' : '會員已更新');
        router.push('/users');
        router.refresh();
      } catch {
        const message = '網路連線異常，請稍後再試';
        setSubmitError(message);
        toast.error(message);
      }
    },
    [mode, userId, router, toast]
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="pb-24">
      {submitError && (
        <div className="mb-6">
          <ErrorAlert message={submitError} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左側：基本資訊區 */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">基本資訊</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className={labelClass}>
                  姓名 <span className="text-rose-500">*</span>
                </label>
                <input id="name" type="text" className={inputClass} placeholder="例如：王小明" {...register('name')} />
                {errors.name && <p className={errorClass}>{errors.name.message}</p>}
              </div>

              <div>
                <label htmlFor="email" className={labelClass}>
                  Email <span className="text-rose-500">*</span>
                </label>
                <input id="email" type="email" autoComplete="off" className={inputClass} placeholder="例如：user@example.com" {...register('email')} />
                {errors.email && <p className={errorClass}>{errors.email.message}</p>}
              </div>

              <div>
                <label htmlFor="password" className={labelClass}>
                  密碼 {mode === 'create' ? <span className="text-rose-500">*</span> : <span className="text-xs font-normal text-gray-400">（留空表示不變更）</span>}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className={inputClass}
                  placeholder={mode === 'create' ? '至少 8 個字元' : '若要變更密碼才需填寫'}
                  {...register('password')}
                />
                {errors.password && <p className={errorClass}>{errors.password.message}</p>}
              </div>

              <div>
                <label htmlFor="phone" className={labelClass}>
                  電話
                </label>
                <input id="phone" type="tel" className={inputClass} placeholder="例如：0912345678" {...register('phone')} />
                {errors.phone && <p className={errorClass}>{errors.phone.message}</p>}
              </div>

              <div>
                <label htmlFor="address" className={labelClass}>
                  地址
                </label>
                <textarea
                  id="address"
                  className={`${inputClass} min-h-24 resize-y`}
                  placeholder="會員聯絡地址"
                  {...register('address')}
                />
                {errors.address && <p className={errorClass}>{errors.address.message}</p>}
              </div>

              <div>
                <label htmlFor="remark" className={labelClass}>
                  備註
                </label>
                <textarea
                  id="remark"
                  className={`${inputClass} min-h-28 resize-y`}
                  placeholder="後台內部備註"
                  {...register('remark')}
                />
                {errors.remark && <p className={errorClass}>{errors.remark.message}</p>}
              </div>
            </div>
          </section>
        </div>

        {/* 右側：設定區（頭像 + 權限狀態） */}
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">頭像</h2>

            <Controller
              control={control}
              name="image"
              render={({ field }) => (
                <ImageUpload
                  value={field.value ?? ''}
                  onChange={(url) => field.onChange(url)}
                  onUploadingChange={setIsUploading}
                  disabled={isSubmitting}
                />
              )}
            />
            {errors.image && <p className={errorClass}>{errors.image.message}</p>}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">權限與狀態</h2>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>角色 (Role)</label>
                <div className="mt-1 inline-flex items-center rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600">
                  一般會員 (USER)
                </div>
                <p className="mt-1 text-xs text-gray-400">會員管理僅供建立一般消費者帳號；管理人員請至「系統帳號管理」設定。</p>
              </div>

              <div>
                <label htmlFor="status" className={labelClass}>
                  狀態 (Status) <span className="text-rose-500">*</span>
                </label>
                <select id="status" className={inputClass} {...register('status')}>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errors.status && <p className={errorClass}>{errors.status.message}</p>}
              </div>
            </div>
          </section>

          {mode === 'edit' && (
            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">系統資訊</h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">建立時間</dt>
                  <dd className="mt-1 font-medium text-gray-900">{formatDateTime(initialData?.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">最後更新</dt>
                  <dd className="mt-1 font-medium text-gray-900">{formatDateTime(initialData?.updatedAt)}</dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      </div>

      {/* 固定底部 Action Bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-6 py-3">
          <button
            type="button"
            onClick={() => router.push('/users')}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isUploading}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isUploading ? '圖片上傳中…' : mode === 'create' ? '建立會員' : '儲存變更'}
          </button>
        </div>
      </div>

    </form>
  );
}
