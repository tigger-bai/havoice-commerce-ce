import { prisma } from '@havoice/database';
import type { SetRecommendationsDTO } from '@havoice/shared';
import { NotFoundError } from '../utils/app-error';

/**
 * Recommendation Service
 *
 * 職責：管理文章與商品之間的導購推薦關聯
 * 設計原則：
 * - 使用 Prisma $transaction 確保「刪除舊關聯 + 寫入新關聯」的原子性
 * - 採用「全量替換」策略：前端傳入的即為最終狀態，無需差異比對
 * - 空陣列代表清除所有推薦
 */
export class RecommendationService {
  /**
   * 取得文章的推薦商品列表（依 sortOrder 升序）
   */
  async getByArticleId(articleId: string) {
    // 先確認文章存在
    const article = await prisma.article.findFirst({
      where: { id: articleId, deletedAt: null },
    });
    if (!article) {
      throw new NotFoundError('文章', articleId);
    }

    const recommendations = await prisma.articleProductRecommendation.findMany({
      where: { articleId },
      orderBy: { sortOrder: 'asc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            compareAtPrice: true,
            coverImage: true,
            stock: true,
            status: true,
          },
        },
      },
    });

    return recommendations.map((rec) => ({
      ...rec.product,
      sortOrder: rec.sortOrder,
    }));
  }

  /**
   * 設定文章的推薦商品（全量替換）
   *
   * 使用 $transaction 確保原子性：
   * 1. 刪除該文章所有現有推薦關聯
   * 2. 批量寫入新的推薦關聯
   *
   * 若任一步驟失敗，整個操作將自動回滾
   */
  async setRecommendations(articleId: string, data: SetRecommendationsDTO) {
    // 確認文章存在
    const article = await prisma.article.findFirst({
      where: { id: articleId, deletedAt: null },
    });
    if (!article) {
      throw new NotFoundError('文章', articleId);
    }

    // 若有推薦商品，驗證所有商品 ID 都存在且未被軟刪除
    if (data.recommendations.length > 0) {
      const productIds = data.recommendations.map((r) => r.productId);
      const existingProducts = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          deletedAt: null,
        },
        select: { id: true },
      });

      const existingIds = new Set(existingProducts.map((p) => p.id));
      const missingIds = productIds.filter((id) => !existingIds.has(id));

      if (missingIds.length > 0) {
        throw new NotFoundError(
          '商品',
          `以下 ID 不存在或已被刪除: ${missingIds.join(', ')}`
        );
      }
    }

    // 使用 Transaction 確保原子性
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: 刪除該文章所有現有推薦關聯
      await tx.articleProductRecommendation.deleteMany({
        where: { articleId },
      });

      // Step 2: 批量寫入新的推薦關聯
      if (data.recommendations.length > 0) {
        await tx.articleProductRecommendation.createMany({
          data: data.recommendations.map((rec) => ({
            articleId,
            productId: rec.productId,
            sortOrder: rec.sortOrder,
          })),
        });
      }

      // Step 3: 回傳更新後的完整推薦列表
      return tx.articleProductRecommendation.findMany({
        where: { articleId },
        orderBy: { sortOrder: 'asc' },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              compareAtPrice: true,
              coverImage: true,
              status: true,
            },
          },
        },
      });
    });

    return result.map((rec) => ({
      ...rec.product,
      sortOrder: rec.sortOrder,
    }));
  }
}

export const recommendationService = new RecommendationService();
