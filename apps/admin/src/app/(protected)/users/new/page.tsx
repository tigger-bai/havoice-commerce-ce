'use client';

import Link from 'next/link';

import { PageHeader } from '@/components/ui/LoadingAndError';
import { UserForm } from '@/components/users/UserForm';

/**
 * 新增會員頁 /users/new
 */
export default function NewUserPage() {
  return (
    <div className="space-y-6">
      {/* 麵包屑 */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/users" className="transition-colors hover:text-gray-600">
          會員管理
        </Link>
        <span>/</span>
        <span className="text-gray-700">新增會員</span>
      </nav>

      <PageHeader title="新增會員" description="建立一個新的後台 / 前台會員帳號" />

      <UserForm mode="create" />
    </div>
  );
}
