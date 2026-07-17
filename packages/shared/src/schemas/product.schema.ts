import { z } from 'zod';
import { PaginationQuerySchema } from './pagination.schema';
import { PublishStatusEnum } from './article.schema';

/**
 * 建立商品 Schema
 * 用於 POST /api/products 的 Request Body 驗證
 */
export const CreateProductSchema = z.object({
  name: z
    .string()
    .min(1, '商品名稱不可為空')
    .max(200, '商品名稱不可超過 200 字元'),
  slug: z
    .string()
    .min(1, 'Slug 不可為空')
    .max(200, 'Slug 不可超過 200 字元')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug 僅允許小寫英文、數字與連字號，且不可以連字號開頭或結尾'
    ),
  description: z.string().min(1, '商品描述不可為空'),
  price: z
    .number()
    .positive('價格必須為正數')
    .multipleOf(0.01, '價格最小單位為 0.01'),
  compareAtPrice: z
    .number()
    .positive('原價必須為正數')
    .multipleOf(0.01, '原價最小單位為 0.01')
    .nullable()
    .optional(),
  sku: z
    .string()
    .min(1, 'SKU 不可為空')
    .max(100, 'SKU 不可超過 100 字元'),
  stock: z.number().int('庫存必須為整數').min(0, '庫存不可為負數').default(0),
  coverImage: z.string().url('封面圖片必須為有效的 URL'),
  images: z.string().optional(), // JSON 字串格式的圖片陣列
  categoryId: z.string().uuid('分類 ID 必須為有效的 UUID'),
  // 多供應商：指派廠商（可空，平台自營為 null）。VENDOR 新增時後端會強制覆寫為本人。
  vendorId: z.string().uuid('供應商 ID 必須為有效的 UUID').nullable().optional(),
  status: PublishStatusEnum.optional().default('DRAFT'),
  tagIds: z
    .array(z.string().uuid('標籤 ID 必須為有效的 UUID'))
    .optional()
    .default([]),
});

export type CreateProductDTO = z.infer<typeof CreateProductSchema>;

/**
 * 更新商品 Schema
 * 所有欄位皆為可選 (Partial Update)
 */
export const UpdateProductSchema = z.object({
  name: z
    .string()
    .min(1, '商品名稱不可為空')
    .max(200, '商品名稱不可超過 200 字元')
    .optional(),
  slug: z
    .string()
    .min(1, 'Slug 不可為空')
    .max(200, 'Slug 不可超過 200 字元')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug 僅允許小寫英文、數字與連字號'
    )
    .optional(),
  description: z.string().min(1, '商品描述不可為空').optional(),
  price: z
    .number()
    .positive('價格必須為正數')
    .multipleOf(0.01, '價格最小單位為 0.01')
    .optional(),
  compareAtPrice: z
    .number()
    .positive('原價必須為正數')
    .multipleOf(0.01, '原價最小單位為 0.01')
    .nullable()
    .optional(),
  sku: z
    .string()
    .min(1, 'SKU 不可為空')
    .max(100, 'SKU 不可超過 100 字元')
    .optional(),
  stock: z.number().int('庫存必須為整數').min(0, '庫存不可為負數').optional(),
  coverImage: z.string().url('封面圖片必須為有效的 URL').optional(),
  images: z.string().nullable().optional(),
  categoryId: z.string().uuid('分類 ID 必須為有效的 UUID').optional(),
  // 多供應商：指派廠商（可空）。VENDOR 編輯時後端會忽略此欄位。
  vendorId: z.string().uuid('供應商 ID 必須為有效的 UUID').nullable().optional(),
  status: PublishStatusEnum.optional(),
  tagIds: z
    .array(z.string().uuid('標籤 ID 必須為有效的 UUID'))
    .optional(),
});

export type UpdateProductDTO = z.infer<typeof UpdateProductSchema>;

/**
 * 商品列表查詢參數 Schema
 * 擴展通用分頁，加入 categoryId 篩選
 */
export const ProductQuerySchema = PaginationQuerySchema.extend({
  categoryId: z.string().uuid('分類 ID 必須為有效的 UUID').optional(),
  status: PublishStatusEnum.optional(),
});

export type ProductQueryDTO = z.infer<typeof ProductQuerySchema>;
