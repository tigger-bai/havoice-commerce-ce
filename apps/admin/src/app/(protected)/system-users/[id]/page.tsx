'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { PageHeader, LoadingSpinner, ErrorAlert } from '@/components/ui/LoadingAndError';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { SystemUserForm, type SystemUserFormInitialData } from '@/components/system-users/SystemUserForm';

/**
 * 編輯系統帳號頁 /system-users/[id]
 *
 * 先以 GET /api/system-users/[id] 取得資料供表單預填
 * 僅 SUPER_ADMIN 可進入（前端 AuthGuard + 後端 requireSuperAdminSession 雙重防護）
 */
export default function EditSystemUserPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [data, setData] = useState<SystemUserFormInitialData | null>(null);
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/system-users/${id}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入系統帳號資料失敗');
      }
      const u = json.data;
      setUserName(u.name ?? u.email ?? '');
      setData({
        id: u.id,
        name: u.name ?? '',
        email: u.email ?? '',
        role: (u.role as SystemUserFormInitialData['role']) ?? 'EDITOR',
        status: (u.status as SystemUserFormInitialData['status']) ?? 'ACTIVE',
        image: u.image ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <AuthGuard allowedRoles={['SUPER_ADMIN']}>
      <div className="space-y-6">
        {/* 麵包屑 */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-400">
          <Link href="/system-users" className="transition-colors hover:text-gray-600">
            系統帳號管理
          </Link>
          <span>/</span>
          <span className="text-gray-700">編輯系統帳號</span>
        </nav>

        <PageHeader title="編輯系統帳號" description={userName ? `正在編輯：${userName}` : '修改系統帳號資訊'} />

        {isLoading && <LoadingSpinner message="載入系統帳號資料中..." />}

        {!isLoading && error && <ErrorAlert message={error} onRetry={fetchUser} />}

        {!isLoading && !error && data && (
          <SystemUserForm mode="edit" userId={id} initialData={data} />
        )}
      </div>
    </AuthGuard>
  );
}
