import { z } from 'zod';

/**
 * 單一推薦項目 Schema
 * 每一筆代表一個商品與其排序權重
 */
export const RecommendationItemSchema = z.object({
  productId: z.string().uuid('商品 ID 必須為有效的 UUID'),
  sortOrder: z
    .number()
    .int('排序權重必須為整數')
    .min(0, '排序權重不可為負數'),
});

export type RecommendationItemDTO = z.infer<typeof RecommendationItemSchema>;

/**
 * 設定文章推薦商品 Schema
 * 用於 PUT /api/articles/:articleId/recommendations 的 Request Body 驗證
 *
 * 設計決策：
 * - 使用「全量替換」策略而非增量操作，確保前端傳入的即為最終狀態
 * - 空陣列代表清除所有推薦關聯
 * - 透過 refine 確保同一商品不會重複出現
 */
export const SetRecommendationsSchema = z.object({
  recommendations: z
    .array(RecommendationItemSchema)
    .max(20, '單篇文章最多關聯 20 個推薦商品')
    .refine(
      (items) => {
        const productIds = items.map((item) => item.productId);
        return new Set(productIds).size === productIds.length;
      },
      { message: '推薦商品不可重複' }
    ),
});

export type SetRecommendationsDTO = z.infer<typeof SetRecommendationsSchema>;
