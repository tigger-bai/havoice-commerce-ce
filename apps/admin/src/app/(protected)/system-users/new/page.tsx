'use client';

import Link from 'next/link';

import { PageHeader } from '@/components/ui/LoadingAndError';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { SystemUserForm } from '@/components/system-users/SystemUserForm';

/**
 * 新增系統帳號頁 /system-users/new
 *
 * 僅 SUPER_ADMIN 可進入（前端 AuthGuard + 後端 requireSuperAdminSession 雙重防護）
 */
export default function NewSystemUserPage() {
  return (
    <AuthGuard allowedRoles={['SUPER_ADMIN']}>
      <div className="space-y-6">
        {/* 麵包屑 */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-400">
          <Link href="/system-users" className="transition-colors hover:text-gray-600">
            系統帳號管理
          </Link>
          <span>/</span>
          <span className="text-gray-700">新增系統帳號</span>
        </nav>

        <PageHeader title="新增系統帳號" description="建立一個內部人員帳號（管理員 / 編輯 / 廠商）" />

        <SystemUserForm mode="create" />
      </div>
    </AuthGuard>
  );
}
