'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useToast } from '@/components/ui/Toast';
import { ErrorAlert } from '@/components/ui/LoadingAndError';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { CreateSystemUserSchema, UpdateSystemUserSchema } from '@/lib/schemas/user.schema';

/**
 * 共用系統帳號表單（新增 / 編輯複用）
 *
 * 設計決策（沿用 UserForm 的 UI/UX 與技術堆疊）：
 * - React Hook Form + zodResolver，複用 system-user schema 作為前後端共用驗證契約
 * - 角色限定 ADMIN / EDITOR / VENDOR（不可建立 SUPER_ADMIN / USER）
 * - 新增模式密碼必填；編輯模式密碼選填（留空不更新）
 * - 頭像 image 串接 ImageUpload；Email 重複（409）以 Toast 提示
 */

type SystemUserFormValues = {
  name: string;
  email: string;
  password?: string;
  role: 'ADMIN' | 'EDITOR' | 'VENDOR';
  status: 'ACTIVE' | 'SUSPENDED';
  image?: string;
};

export interface SystemUserFormInitialData extends Partial<SystemUserFormValues> {
  id?: string;
}

interface SystemUserFormProps {
  mode: 'create' | 'edit';
  userId?: string;
  initialData?: SystemUserFormInitialData;
}

const ROLE_OPTIONS: { value: SystemUserFormValues['role']; label: string }[] = [
  { value: 'ADMIN', label: '系統管理員 (ADMIN)' },
  { value: 'EDITOR', label: '內容編輯 (EDITOR)' },
  { value: 'VENDOR', label: '廠商 (VENDOR)' },
];

const STATUS_OPTIONS: { value: SystemUserFormValues['status']; label: string }[] = [
  { value: 'ACTIVE', label: '啟用 (ACTIVE)' },
  { value: 'SUSPENDED', label: '停權 (SUSPENDED)' },
];

const inputClass =
  'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400';
const labelClass = 'block text-sm font-medium text-gray-700';
const errorClass = 'mt-1 text-xs text-rose-600';

export function SystemUserForm({ mode, userId, initialData }: SystemUserFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema: any = mode === 'create' ? CreateSystemUserSchema : UpdateSystemUserSchema;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SystemUserFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<SystemUserFormValues>,
    defaultValues: {
      name: initialData?.name ?? '',
      email: initialData?.email ?? '',
      password: '',
      role: (initialData?.role as SystemUserFormValues['role']) ?? 'EDITOR',
      status: (initialData?.status as SystemUserFormValues['status']) ?? 'ACTIVE',
      image: initialData?.image ?? '',
    },
  });

  const onSubmit = useCallback(
    async (values: SystemUserFormValues) => {
      setSubmitError(null);
      try {
        const endpoint = mode === 'create' ? '/api/system-users' : `/api/system-users/${userId}`;
        const method = mode === 'create' ? 'POST' : 'PUT';

        const payload: Record<string, unknown> = {
          name: values.name,
          email: values.email,
          role: values.role,
          status: values.status,
          image: values.image ?? '',
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
          const message =
            json?.error?.code === 'EMAIL_TAKEN'
              ? '此 Email 已被使用'
              : json?.error?.message || '儲存失敗，請稍後再試';
          setSubmitError(message);
          toast.error(message);
          return;
        }

        toast.success(mode === 'create' ? '系統帳號已建立' : '系統帳號已更新');
        router.push('/system-users');
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
        {/* 左側：基本資訊 */}
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
                <input id="email" type="email" autoComplete="off" className={inputClass} placeholder="例如：staff@example.com" {...register('email')} />
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
            </div>
          </section>
        </div>

        {/* 右側：頭像 + 角色狀態 */}
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
            <h2 className="mb-4 text-sm font-semibold text-gray-900">角色與狀態</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="role" className={labelClass}>
                  角色 (Role) <span className="text-rose-500">*</span>
                </label>
                <select id="role" className={inputClass} {...register('role')}>
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errors.role && <p className={errorClass}>{errors.role.message}</p>}
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
        </div>
      </div>

      {/* 固定底部 Action Bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-6 py-3">
          <button
            type="button"
            onClick={() => router.push('/system-users')}
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
            {isUploading ? '圖片上傳中…' : mode === 'create' ? '建立帳號' : '儲存變更'}
          </button>
        </div>
      </div>
    </form>
  );
}
