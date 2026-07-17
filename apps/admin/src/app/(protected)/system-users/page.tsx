'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';

import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { ErrorAlert, PageHeader } from '@/components/ui/LoadingAndError';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { SystemRoleInlineEdit, SystemUserStatusInlineEdit } from '@/components/system-users/SystemUserInlineEdit';
import { formatDateTime, safeNumber } from '@/lib/utils';

/**
 * 系統帳號管理頁 /system-users
 *
 * 設計決策（沿用會員管理 /users 的 UI/UX 與技術堆疊）：
 * - 僅 SUPER_ADMIN 可進入（前端 AuthGuard + 後端 requireSuperAdminSession 雙重防護）
 * - 管理 ADMIN / EDITOR / VENDOR 三種內部角色；不含 SUPER_ADMIN（保護最高權限）
 * - 行內快速編輯：角色與狀態以下拉切換 PATCH 樂觀更新
 * - 右上「+ 新增系統帳號」；每列操作含「編輯」「刪除」(ConfirmDialog 軟刪除)
 * - 分頁 + 關鍵字搜尋（name / email）+ 角色篩選
 */

interface SystemUserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  status: string;
  createdAt: string;
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  ADMIN: { label: '管理員', cls: 'bg-violet-100 text-violet-700' },
  EDITOR: { label: '編輯', cls: 'bg-sky-100 text-sky-700' },
  VENDOR: { label: '廠商', cls: 'bg-amber-100 text-amber-700' },
};

const ROLE_FILTERS = [
  { value: '', label: '全部角色' },
  { value: 'ADMIN', label: '管理員' },
  { value: 'EDITOR', label: '編輯' },
  { value: 'VENDOR', label: '廠商' },
];

function SystemUsersContent() {
  const { toast } = useToast();

  const [users, setUsers] = useState<SystemUserRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<SystemUserRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '10');
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (roleFilter) params.set('role', roleFilter);

      const res = await fetch(`/api/system-users?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入系統帳號失敗');
      }
      setUsers(Array.isArray(json.data?.items) ? json.data.items : []);
      setTotalPages(safeNumber(json.data?.pagination?.totalPages) || 1);
      setTotal(safeNumber(json.data?.pagination?.total));
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, keyword, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const patchRow = (id: string, patch: Partial<SystemUserRow>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/system-users/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '刪除失敗，請稍後再試');
      }
      toast.success('系統帳號已刪除');
      setDeleteTarget(null);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '刪除失敗，請稍後再試');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, toast, fetchUsers]);

  const columns: Column<SystemUserRow>[] = [
    {
      key: 'user',
      title: '姓名',
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {u.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.image}
                alt={u.name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            ) : (
              <span>{(u.name || u.email || '?').charAt(0).toUpperCase()}</span>
            )}
          </div>
          <span className="truncate font-medium text-gray-900">{u.name || '（未命名）'}</span>
        </div>
      ),
    },
    {
      key: 'email',
      title: 'Email',
      render: (u) => <span className="text-gray-600">{u.email || '—'}</span>,
    },
    {
      key: 'role',
      title: '角色',
      render: (u) => (
        <SystemRoleInlineEdit
          userId={u.id}
          value={u.role}
          onUpdated={(next) => patchRow(u.id, { role: next.role })}
        />
      ),
    },
    {
      key: 'status',
      title: '狀態',
      render: (u) => (
        <SystemUserStatusInlineEdit
          userId={u.id}
          value={u.status}
          onUpdated={(next) => patchRow(u.id, { status: next.status })}
        />
      ),
    },
    {
      key: 'createdAt',
      title: '建立時間',
      render: (u) => <span className="text-sm text-gray-500">{formatDateTime(u.createdAt)}</span>,
    },
    {
      key: 'actions',
      title: '操作',
      render: (u) => (
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/system-users/${u.id}`}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
            編輯
          </Link>
          <button
            type="button"
            onClick={() => setDeleteTarget(u)}
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
        title="系統帳號管理"
        description={`共 ${total} 個系統帳號（管理員 / 編輯 / 廠商）`}
        actions={
          <Link
            href="/system-users/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新增系統帳號
          </Link>
        }
      />

      {/* 搜尋與篩選列 */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-40"
        >
          {ROLE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            fetchUsers();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋姓名 / Email"
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

      <p className="text-xs text-gray-400">
        提示：本頁僅供最高權限管理員（SUPER_ADMIN）使用，管理內部人員帳號（ADMIN / EDITOR / VENDOR）。角色與狀態可直接於欄位中以下拉切換即時儲存。
      </p>

      {error && <ErrorAlert message={error} onRetry={fetchUsers} />}

      <DataTable
        columns={columns}
        data={users}
        keyExtractor={(u) => u.id}
        isLoading={isLoading}
        emptyMessage="查無符合條件的系統帳號"
      />

      {totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="確認刪除系統帳號"
        description={
          deleteTarget
            ? `確定要刪除「${deleteTarget.name || deleteTarget.email}」（${ROLE_BADGE[deleteTarget.role]?.label || deleteTarget.role}）嗎？此操作為軟刪除，該帳號將立即停權並無法再登入。`
            : ''
        }
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

export default function SystemUsersPage() {
  return (
    <AuthGuard allowedRoles={['SUPER_ADMIN']}>
      <Suspense fallback={null}>
        <SystemUsersContent />
      </Suspense>
    </AuthGuard>
  );
}
