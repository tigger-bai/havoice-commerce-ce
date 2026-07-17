import { Request, Response, NextFunction } from 'express';
import { recommendationService } from '../services/recommendation.service';
import type { ApiSuccessResponse } from '@havoice/shared';

/**
 * Recommendation Controller
 *
 * 職責：處理文章導購推薦相關的 HTTP 請求與回應
 */
export class RecommendationController {
  /**
   * GET /api/articles/:articleId/recommendations
   * 取得文章的推薦商品列表（依 sortOrder 升序）
   */
  async getRecommendations(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { articleId } = req.params;
      const recommendations =
        await recommendationService.getByArticleId(articleId);

      const response: ApiSuccessResponse<typeof recommendations> = {
        success: true,
        data: recommendations,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/articles/:articleId/recommendations
   * 設定文章的推薦商品（全量替換）
   *
   * 設計決策：
   * - 使用 PUT 而非 PATCH，因為此操作為「全量替換」語義
   * - 空陣列代表清除所有推薦
   * - 回傳更新後的完整推薦列表，前端無需額外請求
   */
  async setRecommendations(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { articleId } = req.params;
      const recommendations = await recommendationService.setRecommendations(
        articleId,
        req.body
      );

      const response: ApiSuccessResponse<typeof recommendations> = {
        success: true,
        data: recommendations,
        message: '推薦商品更新成功',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const recommendationController = new RecommendationController();
