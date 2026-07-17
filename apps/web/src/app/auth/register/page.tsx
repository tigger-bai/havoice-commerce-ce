'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * 前台註冊頁面 - NextAuth.js 整合版
 *
 * 流程：
 * 1. 前端表單驗證（密碼長度、確認密碼一致、密碼強度）
 * 2. 呼叫 /api/auth/register Route Handler 建立帳號
 * 3. 註冊成功後自動呼叫 NextAuth signIn() 進行登入
 * 4. 登入成功後重導向至首頁
 */

interface FormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  name?: string;
}

export default function RegisterPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 前端預驗證
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.email) {
      newErrors.email = '電子郵件為必填';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = '請輸入有效的電子郵件地址';
    }

    if (!formData.password) {
      newErrors.password = '密碼為必填';
    } else if (formData.password.length < 8) {
      newErrors.password = '密碼長度至少需要 8 個字元';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = '密碼必須包含大小寫字母與數字';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = '兩次輸入的密碼不一致';
    }

    if (formData.name && formData.name.length < 2) {
      newErrors.name = '姓名至少需要 2 個字';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      // Step 1: 呼叫 Next.js Route Handler 註冊 API
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.details) {
          // Zod 驗證錯誤：映射到對應欄位
          const fieldErrors: FormErrors = {};
          for (const [key, messages] of Object.entries(data.error.details)) {
            (fieldErrors as any)[key] = (messages as string[])[0];
          }
          setErrors(fieldErrors);
        } else {
          setServerError(data.error?.message || '註冊失敗，請稍後再試');
        }
        return;
      }

      // Step 2: 註冊成功，自動呼叫 NextAuth signIn 進行登入
      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (signInResult?.ok) {
        router.push('/');
        router.refresh();
      } else {
        // 極少數情況：註冊成功但自動登入失敗，導向登入頁
        router.push('/auth/login?registered=true');
      }
    } catch {
      setServerError('網路連線異常，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field as keyof FormErrors]) {
      setErrors({ ...errors, [field]: undefined });
    }
  };

  // 密碼強度指示器
  const getPasswordStrength = () => {
    const { password } = formData;
    if (!password) return { level: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z\d]/.test(password)) score++;

    if (score <= 1) return { level: 1, label: '弱', color: 'bg-red-500' };
    if (score === 2) return { level: 2, label: '中', color: 'bg-yellow-500' };
    if (score === 3) return { level: 3, label: '強', color: 'bg-green-500' };
    return { level: 4, label: '極強', color: 'bg-brand-600' };
  };

  const strength = getPasswordStrength();

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* 品牌標誌 */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
              <span className="text-lg font-bold text-white">J</span>
            </div>
            <span className="text-xl font-bold text-gray-900">快樂之音</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">建立帳號</h1>
          <p className="mt-2 text-sm text-gray-500">
            加入快樂之音，開啟你的健康生活旅程
          </p>
        </div>

        {/* 註冊表單 */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {/* 伺服器錯誤提示 */}
          {serverError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                {serverError}
              </div>
            </div>
          )}

          {/* 姓名（選填） */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              姓名 <span className="text-gray-400">(選填)</span>
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="您的姓名"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              電子郵件 <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              className={`mt-1.5 block w-full rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 ${
                errors.email
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 focus:border-brand-500 focus:ring-brand-500/20'
              }`}
              placeholder="your@email.com"
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              密碼 <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={formData.password}
              onChange={(e) => updateField('password', e.target.value)}
              className={`mt-1.5 block w-full rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 ${
                errors.password
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 focus:border-brand-500 focus:ring-brand-500/20'
              }`}
              placeholder="至少 8 個字元，含大小寫與數字"
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}

            {/* 密碼強度指示器 */}
            {formData.password && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          level <= strength.level ? strength.color : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">{strength.label}</span>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              確認密碼 <span className="text-red-500">*</span>
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              className={`mt-1.5 block w-full rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 ${
                errors.confirmPassword
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 focus:border-brand-500 focus:ring-brand-500/20'
              }`}
              placeholder="再次輸入密碼"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>
            )}
          </div>

          {/* 同意條款 */}
          <div className="flex items-start gap-2">
            <input
              id="terms"
              type="checkbox"
              required
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="terms" className="text-xs text-gray-500">
              我已閱讀並同意{' '}
              <button type="button" className="text-brand-600 hover:underline">服務條款</button>
              {' '}與{' '}
              <button type="button" className="text-brand-600 hover:underline">隱私權政策</button>
            </label>
          </div>

          {/* 提交按鈕 */}
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-700 hover:shadow-xl hover:shadow-brand-600/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                註冊中...
              </>
            ) : (
              '建立帳號'
            )}
          </button>
        </form>

        {/* 分隔線 */}
        <div className="relative mt-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-4 text-gray-400">或</span>
          </div>
        </div>

        {/* 登入連結 */}
        <p className="mt-6 text-center text-sm text-gray-500">
          已經有帳號了？{' '}
          <Link href="/auth/login" className="font-semibold text-brand-600 hover:text-brand-700">
            立即登入
          </Link>
        </p>
      </div>
    </div>
  );
}
