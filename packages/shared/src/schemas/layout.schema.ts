import { z } from 'zod';

/**
 * 行銷版位與首頁樓層管理 (Layout CMS) Zod Schema
 * 前後端共用驗證契約，嚴格對齊 schema.prisma 的 LayoutSection / LayoutItem
 *
 * 設計決策：
 * - LayoutSection.type 採用列舉常數（CAROUSEL / GRID / BANNER），避免任意字串污染前台渲染邏輯
 * - sortOrder 一律為非負整數
 * - imageUrl 必填且須為有效 URL；linkUrl 選填（允許站內相對路徑或完整 URL）
 */

// 樓層呈現類型（前台據此決定渲染方式）
//
// 設計決策（向後相容）：
// - 新世代大型電商類型：HERO_BANNER / THEME_REC / SALES_RANKING / BRAND_CAROUSEL / CATEGORY_FLOOR
// - 保留舊類型 CAROUSEL / GRID / BANNER（legacy），避免資料庫現有資料與舊前台邏輯損壞
// - type 以字串列舉存儲（Prisma 欄位為 String），前台依此派送至對應區塊元件
export const ECOMMERCE_SECTION_TYPES = [
  'HERO_BANNER',
  'THEME_REC',
  'SALES_RANKING',
  'BRAND_CAROUSEL',
  'CATEGORY_FLOOR',
  // 新增積木（Page Builder 擴充）
  'ICON_NAVIGATION', // 圖文導覽列：一排多格圓形/方形分類按鈕
  'IMAGE_WITH_TEXT', // 圖文精選：左圖右文或右圖左文
  'PROMO_BANNER', // 單張活動橫幅
] as const;

// ==========================================
// 頁面路由（Page Builder）
// ==========================================
//
// 全站可被設計的頁面白名單。pageRoute 用以区隔不同頁面的佈景區塊。
export const PAGE_ROUTES = ['/', '/shop'] as const;
export const PageRouteEnum = z.enum(PAGE_ROUTES);
export type PageRoute = z.infer<typeof PageRouteEnum>;

export const PAGE_ROUTE_LABELS: Record<string, string> = {
  '/': '首頁',
  '/shop': '商城頁',
};

// pageRoute 驗證：預設 '/shop'，限定為白名單內路由
const pageRouteSchema = PageRouteEnum.default('/shop');

// legacy 類型（保留以相容舊資料）
export const LEGACY_SECTION_TYPES = ['CAROUSEL', 'GRID', 'BANNER'] as const;

// 完整可用類型 = 新電商類型 + legacy
export const LAYOUT_SECTION_TYPES = [
  ...ECOMMERCE_SECTION_TYPES,
  ...LEGACY_SECTION_TYPES,
] as const;
export const LayoutSectionTypeEnum = z.enum(LAYOUT_SECTION_TYPES);
export type LayoutSectionType = z.infer<typeof LayoutSectionTypeEnum>;

// linkUrl：允許空字串、站內相對路徑（/ 開頭）或完整 http(s) URL
const linkUrlSchema = z
  .union([
    z.literal(''),
    z.string().trim().regex(/^\//, '站內連結需以 / 開頭'),
    z.string().trim().url('連結必須是有效的網址'),
  ])
  .nullable()
  .optional();

const sortOrderSchema = z
  .number({ invalid_type_error: '排序必須為數字' })
  .int('排序必須為整數')
  .min(0, '排序不可為負數');

// ==========================================
// LayoutSection
// ==========================================

export const CreateLayoutSectionSchema = z.object({
  title: z
    .string({ required_error: '請輸入樓層標題' })
    .trim()
    .min(1, '請輸入樓層標題')
    .max(100, '樓層標題不可超過 100 字'),
  type: LayoutSectionTypeEnum,
  pageRoute: pageRouteSchema,
  sortOrder: sortOrderSchema.default(0),
  isActive: z.boolean().default(true),
});
export type CreateLayoutSectionDTO = z.infer<typeof CreateLayoutSectionSchema>;

export const UpdateLayoutSectionSchema = z.object({
  title: z.string().trim().min(1, '請輸入樓層標題').max(100, '樓層標題不可超過 100 字').optional(),
  type: LayoutSectionTypeEnum.optional(),
  pageRoute: PageRouteEnum.optional(),
  sortOrder: sortOrderSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateLayoutSectionDTO = z.infer<typeof UpdateLayoutSectionSchema>;

// 行內快速切換（僅 isActive 或 sortOrder）
export const PatchLayoutSectionSchema = z
  .object({
    isActive: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .refine((d) => d.isActive !== undefined || d.sortOrder !== undefined, {
    message: '請提供 isActive 或 sortOrder 至少一個欄位',
  });
export type PatchLayoutSectionDTO = z.infer<typeof PatchLayoutSectionSchema>;

// ==========================================
// LayoutItem
// ==========================================

export const CreateLayoutItemSchema = z.object({
  sectionId: z.string({ required_error: '缺少所屬樓層 ID' }).uuid('樓層 ID 必須為有效的 UUID'),
  title: z
    .union([z.string().trim().max(100, '輔助標題不可超過 100 字'), z.literal('')])
    .nullable()
    .optional(),
  imageUrl: z.string({ required_error: '請提供圖檔網址' }).trim().url('圖檔必須是有效的網址'),
  linkUrl: linkUrlSchema,
  sortOrder: sortOrderSchema.default(0),
  isActive: z.boolean().default(true),
});
export type CreateLayoutItemDTO = z.infer<typeof CreateLayoutItemSchema>;

export const UpdateLayoutItemSchema = z.object({
  title: z
    .union([z.string().trim().max(100, '輔助標題不可超過 100 字'), z.literal('')])
    .nullable()
    .optional(),
  imageUrl: z.string().trim().url('圖檔必須是有效的網址').optional(),
  linkUrl: linkUrlSchema,
  sortOrder: sortOrderSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateLayoutItemDTO = z.infer<typeof UpdateLayoutItemSchema>;

// ==========================================
// 批次排序（Reorder）
// ==========================================
//
// 接收 { orderedIds: string[] }，後端依陣列順序將 sortOrder 設為 index + 1。
export const ReorderLayoutSectionsSchema = z.object({
  // 限定該次排序所屬的頁面，確保只在同一 pageRoute 下進行更新
  pageRoute: PageRouteEnum,
  orderedIds: z
    .array(z.string().uuid('版位 ID 必須為有效的 UUID'), {
      required_error: '請提供排序後的版位 ID 陣列',
    })
    .min(1, '排序陣列不可為空'),
});
export type ReorderLayoutSectionsDTO = z.infer<typeof ReorderLayoutSectionsSchema>;

// 表單輸入型別（含 default 欄位於輸入時為 optional）
export type CreateLayoutSectionInput = z.input<typeof CreateLayoutSectionSchema>;
export type CreateLayoutItemInput = z.input<typeof CreateLayoutItemSchema>;
