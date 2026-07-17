import { z } from 'zod';
import { PaginationQuerySchema } from './pagination.schema';

/**
 * 文章發佈狀態列舉
 */
export const PublishStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export type PublishStatus = z.infer<typeof PublishStatusEnum>;

/**
 * 建立文章 Schema
 * 用於 POST /api/articles 的 Request Body 驗證
 */
export const CreateArticleSchema = z.object({
  title: z
    .string()
    .min(1, '文章標題不可為空')
    .max(200, '文章標題不可超過 200 字元'),
  slug: z
    .string()
    .min(1, 'Slug 不可為空')
    .max(200, 'Slug 不可超過 200 字元')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug 僅允許小寫英文、數字與連字號，且不可以連字號開頭或結尾'
    ),
  content: z.string().min(1, '文章內容不可為空'),
  summary: z.string().max(500, '摘要不可超過 500 字元').optional(),
  coverImage: z.string().url('封面圖片必須為有效的 URL').optional(),
  authorId: z.string().uuid('作者 ID 必須為有效的 UUID'),
  categoryId: z.string().uuid('分類 ID 必須為有效的 UUID'),
  status: PublishStatusEnum.optional().default('DRAFT'),
  tagIds: z
    .array(z.string().uuid('標籤 ID 必須為有效的 UUID'))
    .optional()
    .default([]),
});

export type CreateArticleDTO = z.infer<typeof CreateArticleSchema>;

/**
 * 更新文章 Schema
 * 所有欄位皆為可選，僅更新有提供的欄位 (Partial Update)
 */
export const UpdateArticleSchema = z.object({
  title: z
    .string()
    .min(1, '文章標題不可為空')
    .max(200, '文章標題不可超過 200 字元')
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
  content: z.string().min(1, '文章內容不可為空').optional(),
  summary: z.string().max(500, '摘要不可超過 500 字元').nullable().optional(),
  coverImage: z.string().url('封面圖片必須為有效的 URL').nullable().optional(),
  categoryId: z.string().uuid('分類 ID 必須為有效的 UUID').optional(),
  status: PublishStatusEnum.optional(),
  tagIds: z
    .array(z.string().uuid('標籤 ID 必須為有效的 UUID'))
    .optional(),
});

export type UpdateArticleDTO = z.infer<typeof UpdateArticleSchema>;

/**
 * 文章列表查詢參數 Schema
 * 擴展通用分頁，加入 categoryId 篩選
 */
export const ArticleQuerySchema = PaginationQuerySchema.extend({
  categoryId: z.string().uuid('分類 ID 必須為有效的 UUID').optional(),
  status: PublishStatusEnum.optional(),
});

export type ArticleQueryDTO = z.infer<typeof ArticleQuerySchema>;
