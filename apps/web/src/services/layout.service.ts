import { api } from '@/lib/api-client';
import type { LayoutSection } from '@/types';

/**
 * 行銷版位資料服務（前台）
 *
 * 設計決策：
 * - 透過既有 api-client 呼叫後端公開端點 GET /api/layouts（http://localhost:4000）
 * - 支援 pageRoute 參數：首頁傳 '/'、商城頁傳 '/shop'，各自取得獨立佈景
 * - 採 ISR：revalidate 60 秒，讓小編於後台更新後最多 60 秒內前台即可看到變化
 * - 後端已過濾 isActive 並排序，前台直接使用回傳結果
 * - 具備防禦性 fallback：API 失敗時回傳空陣列，前台不致整頁崩潰
 */

const LAYOUT_REVALIDATE_SECONDS = 60;

export async function getActiveLayoutSections(pageRoute?: string): Promise<LayoutSection[]> {
  try {
    const sections = await api.get<LayoutSection[]>('/api/layouts', {
      params: pageRoute ? { pageRoute } : undefined,
      revalidate: LAYOUT_REVALIDATE_SECONDS,
    });
    return Array.isArray(sections) ? sections : [];
  } catch (error) {
    // 後端不可用或網路異常時，回傳空陣列避免前台崩潰
    console.error('[getActiveLayoutSections] 載入行銷版位失敗：', error);
    return [];
  }
}
