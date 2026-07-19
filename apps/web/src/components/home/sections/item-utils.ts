import type { LayoutItem } from '@/types';

/** 取得版位項目顯示用的替代文字 */
export function itemAlt(item: LayoutItem, fallback: string): string {
  return item.title || fallback;
}
