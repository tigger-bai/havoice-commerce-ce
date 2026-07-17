'use client';

import { cn } from '@/lib/utils';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusBadgeProps {
  label: string;
  variant: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-green-50 text-green-700 ring-green-600/20',
  warning: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  neutral: 'bg-gray-50 text-gray-700 ring-gray-600/20',
};

export function StatusBadge({ label, variant }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        variantStyles[variant]
      )}
    >
      {label}
    </span>
  );
}

/**
 * 根據發佈狀態回傳對應的 Badge 配置
 */
export function getPublishStatusBadge(status: string): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case 'PUBLISHED':
      return { label: '已發佈', variant: 'success' };
    case 'DRAFT':
      return { label: '草稿', variant: 'neutral' };
    case 'ARCHIVED':
      return { label: '已封存', variant: 'warning' };
    default:
      return { label: status, variant: 'neutral' };
  }
}
