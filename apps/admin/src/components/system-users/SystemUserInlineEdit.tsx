'use client';

import { useState } from 'react';

import { useToast } from '@/components/ui/Toast';

/**
 * 系統帳號行內快速編輯元件
 *
 * 設計決策：
 * - 以 <select> 直接切換 Role（ADMIN/EDITOR/VENDOR）/ Status，PATCH /api/system-users/[id]
 * - 樂觀更新：成功後透過 onUpdated 通知父層；失敗則 Toast 並維持原值
 * - 僅 SUPER_ADMIN 可進入本頁，API 端亦有 requireSuperAdminSession 雙重防護
 */

interface PatchResult {
  role: string;
  status: string;
}

async function patchSystemUser(id: string, data: Record<string, string>): Promise<PatchResult> {
  const res = await fetch(`/api/system-users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message || '更新失敗，請稍後再試');
  }
  return json.data as PatchResult;
}

const selectClass =
  'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60';

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: '管理員' },
  { value: 'EDITOR', label: '編輯' },
  { value: 'VENDOR', label: '廠商' },
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '啟用' },
  { value: 'SUSPENDED', label: '停權' },
];

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function SystemRoleInlineEdit({
  userId,
  value,
  disabled,
  onUpdated,
}: {
  userId: string;
  value: string;
  disabled?: boolean;
  onUpdated: (next: PatchResult) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === value) return;
    setSubmitting(true);
    try {
      const result = await patchSystemUser(userId, { role: next });
      onUpdated(result);
      toast.success('角色已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <select value={value} onChange={handleChange} disabled={disabled || submitting} className={selectClass}>
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {submitting && <Spinner />}
    </div>
  );
}

export function SystemUserStatusInlineEdit({
  userId,
  value,
  disabled,
  onUpdated,
}: {
  userId: string;
  value: string;
  disabled?: boolean;
  onUpdated: (next: PatchResult) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const isDeleted = value === 'DELETED';

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === value) return;
    setSubmitting(true);
    try {
      const result = await patchSystemUser(userId, { status: next });
      onUpdated(result);
      toast.success('狀態已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  if (isDeleted) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
        已刪除
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <select value={value} onChange={handleChange} disabled={disabled || submitting} className={selectClass}>
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {submitting && <Spinner />}
    </div>
  );
}
