/**
 * 行銷版位類型標籤對照
 *
 * - 新世代大型電商類型（5 種）與 legacy 類型（3 種）皆提供中文標籤與 Badge 樣式
 * - 列表頁、表單下拉皆共用此對照，確保命名一致
 */

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface TypeMeta {
  label: string;
  variant: BadgeVariant;
  /** 對版位類型的簡短描述（供表單下拉提示） */
  hint: string;
}

export const TYPE_META: Record<string, TypeMeta> = {
  // 新世代電商類型
  HERO_BANNER: { label: '主視覺輪播', variant: 'danger', hint: '首頁置頂滿版輪播（固定於最上方）' },
  THEME_REC: { label: '主題推薦', variant: 'info', hint: '雙欄／拼圖式主題推薦佈局' },
  SALES_RANKING: { label: '銷售排行', variant: 'warning', hint: '帶 1/2/3 名次標示的排行區塊' },
  BRAND_CAROUSEL: { label: '品牌牆', variant: 'success', hint: '小型品牌卡片橫向輪播' },
  CATEGORY_FLOOR: { label: '分類樓層', variant: 'neutral', hint: '左側分類選單＋右側多格商品' },
  // Page Builder 新增積木
  ICON_NAVIGATION: { label: '圖文導覽', variant: 'info', hint: '一排多格圓形／方形分類按鈕' },
  IMAGE_WITH_TEXT: { label: '圖文精選', variant: 'success', hint: '左圖右文或右圖左文的圖文區塊' },
  PROMO_BANNER: { label: '活動橫幅', variant: 'warning', hint: '單張活動宣傳橫幅' },
  // legacy
  CAROUSEL: { label: '輪播（舊）', variant: 'info', hint: '舊版滿版輪播' },
  GRID: { label: '宮格（舊）', variant: 'success', hint: '舊版多欄並排' },
  BANNER: { label: '橫幅（舊）', variant: 'warning', hint: '舊版寬版大圖' },
};

export function getTypeMeta(type: string): TypeMeta {
  return TYPE_META[type] ?? { label: type, variant: 'neutral', hint: '' };
}

/** HERO_BANNER 為置頂固定、不參與拖曳的特殊類型 */
export const PINNED_TYPE = 'HERO_BANNER';
