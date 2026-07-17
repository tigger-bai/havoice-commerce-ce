import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { recommendationController } from '../controllers/recommendation.controller';
import { validate } from '../middlewares/validate.middleware';
import { requireAdmin } from '../middlewares/auth.middleware';
import { SetRecommendationsSchema } from '@havoice/shared';

/**
 * Recommendation Routes
 *
 * 設計決策：
 * - 路由掛載於 /api/articles/:articleId/recommendations
 * - 使用 mergeParams: true 以存取父路由的 :articleId 參數
 * - GET 為前台/後台共用；PUT 為後台專用，需 ADMIN / EDITOR（requireAdmin）
 */
const router: ExpressRouter = Router({ mergeParams: true });

// ─── 取得文章的推薦商品列表 ───
router.get(
  '/:articleId/recommendations',
  recommendationController.getRecommendations.bind(recommendationController)
);

// ─── 設定文章的推薦商品（全量替換，需 ADMIN / EDITOR） ───
router.put(
  '/:articleId/recommendations',
  ...requireAdmin,
  validate(SetRecommendationsSchema, 'body'),
  recommendationController.setRecommendations.bind(recommendationController)
);

export { router as recommendationRouter };
