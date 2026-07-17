'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

/**
 * 會員個人資料頁面
 *
 * 設計決策：
 * - 使用 useSession 取得當前使用者資訊作為表單預設值
 * - 編輯後呼叫 PATCH /api/user/profile 更新資料庫
 * - 成功後呼叫 session.update() 即時刷新 NextAuth Session
 * - 頭像預覽：輸入 URL 後即時顯示圖片預覽
 */
export default function MemberProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: '',
    image: '',
  });

  // 從 Session 載入初始值
  useEffect(() => {
    if (session?.user) {
      setFormData({
        name: session.user.name || '',
        image: session.user.image || '',
      });
    }
  }, [session]);

  const updateField = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setIsSaved(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setFieldErrors({});
    setIsSaved(false);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.errors) {
          const errors: Record<string, string> = {};
          data.errors.forEach((err: { field: string; message: string }) => {
            errors[err.field] = err.message;
          });
          setFieldErrors(errors);
        } else {
          setError(data.message || '更新失敗');
        }
        return;
      }

      // 更新 NextAuth Session（觸發 jwt callback 重新讀取 DB）
      await updateSession({
        name: data.data.name,
        image: data.data.image,
      });

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 頁面標題 */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">個人資料</h2>
        <p className="mt-1 text-sm text-gray-500">
          管理您的帳號資訊與個人偏好設定
        </p>
      </div>

      {/* 表單卡片 */}
      <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* 頭像區域 */}
        <div className="border-b border-gray-100 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-4">
            個人頭像
          </label>
          <div className="flex items-center gap-6">
            {/* 頭像預覽 */}
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gray-100 ring-4 ring-gray-50">
              {formData.image ? (
                <img
                  src={formData.image}
                  alt="頭像預覽"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-brand-600 bg-brand-50">
                  {formData.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
            </div>

            {/* 圖片 URL 輸入 */}
            <div className="flex-1">
              <input
                type="url"
                value={formData.image}
                onChange={updateField('image')}
                placeholder="https://example.com/avatar.jpg"
                className={`block w-full rounded-xl border px-4 py-3 text-sm transition-colors ${
                  fieldErrors.image
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-200 focus:border-brand-500 focus:ring-brand-500'
                } focus:outline-none focus:ring-1`}
              />
              {fieldErrors.image && (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.image}</p>
              )}
              <p className="mt-1.5 text-xs text-gray-400">
                請輸入圖片的網址（支援 JPG、PNG、WebP 格式）
              </p>
            </div>
          </div>
        </div>

        {/* 基本資訊 */}
        <div className="space-y-5 p-6">
          {/* 姓名 */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
              顯示名稱 <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={updateField('name')}
              placeholder="請輸入您的姓名"
              className={`block w-full rounded-xl border px-4 py-3 text-sm transition-colors ${
                fieldErrors.name
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-200 focus:border-brand-500 focus:ring-brand-500'
              } focus:outline-none focus:ring-1`}
            />
            {fieldErrors.name && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors.name}</p>
            )}
          </div>

          {/* Email（唯讀） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              電子郵件
            </label>
            <input
              type="email"
              value={session?.user?.email || ''}
              disabled
              className="block w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500 cursor-not-allowed"
            />
            <p className="mt-1.5 text-xs text-gray-400">
              電子郵件為帳號識別，無法修改
            </p>
          </div>

          {/* 帳號資訊 */}
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-xs text-gray-500">帳號角色</span>
                <p className="mt-0.5 text-sm font-medium text-gray-700">
                  {session?.user?.role === 'ADMIN' ? '管理員' : '一般會員'}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500">註冊時間</span>
                <p className="mt-0.5 text-sm font-medium text-gray-700">
                  {session?.user ? '已驗證帳號' : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 表單底部：儲存按鈕 */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            {isSaved && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                已儲存
              </span>
            )}
            {error && (
              <span className="text-sm text-red-600">{error}</span>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                儲存中...
              </>
            ) : (
              '儲存變更'
            )}
          </button>
        </div>
      </form>

      {/* 危險操作區域 */}
      <div className="rounded-2xl border border-red-100 bg-red-50/50 p-6">
        <h3 className="text-sm font-semibold text-red-800">危險操作</h3>
        <p className="mt-1 text-sm text-red-600">
          刪除帳號後，所有資料將無法復原。
        </p>
        <button
          type="button"
          className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          onClick={() => alert('此功能尚未開放')}
        >
          刪除我的帳號
        </button>
      </div>
    </div>
  );
}
