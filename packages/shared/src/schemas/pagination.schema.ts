import { z } from 'zod';

/**
 * 通用分頁查詢參數 Schema
 * 用於所有列表 API 的 Query Parameters 驗證
 */
export const PaginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
  limit: z
    .string()
    .optional()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100)),
});

export type PaginationQueryDTO = z.infer<typeof PaginationQuerySchema>;

/**
 * 通用分頁回應結構
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
