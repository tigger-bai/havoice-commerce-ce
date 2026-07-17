import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合併 Tailwind CSS 類名的工具函式
 * 結合 clsx 的條件類名與 tailwind-merge 的衝突解決能力
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 安全數值轉換（前端版本）：等同 Number(value) || 0，並處理非有限數
 */
export function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 格式化金額為新台幣字串（防禦性：非法值轉為 NT$0）
 */
export function formatCurrency(value: unknown): string {
  const n = safeNumber(value);
  return `NT$${n.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
}

/**
 * 格式化日期時間（防禦性：無效日期回傳 '—'）
 */
export function formatDateTime(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 格式化日期（不含時間）
 */
export function formatDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
