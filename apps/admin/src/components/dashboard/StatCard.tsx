'use client';

import { cn } from '@/lib/utils';

/**
 * StatCard - 營運總覽指標卡
 *
 * 設計決策：
 * - 高資訊密度 SaaS 風格：左側數值 + 標題，右側彩色圖示徽章
 * - accent 控制圖示底色語意（neutral / positive / warning / info）
 * - 數值已在父層以 toNumber 安全轉換
 */

type Accent = 'neutral' | 'positive' | 'warning' | 'info';

const ACCENT_MAP: Record<Accent, string> = {
  neutral: 'bg-gray-100 text-gray-600',
  positive: 'bg-brand-50 text-brand-600',
  warning: 'bg-amber-50 text-amber-600',
  info: 'bg-blue-50 text-blue-600',
};

interface StatCardProps {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  accent?: Accent;
  highlight?: boolean;
}

export function StatCard({
  title,
  value,
  hint,
  icon,
  accent = 'neutral',
  highlight = false,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md',
        highlight ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
        </div>
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', ACCENT_MAP[accent])}>
          {icon}
        </div>
      </div>
    </div>
  );
}
