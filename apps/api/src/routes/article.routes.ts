import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { articleController } from '../controllers/article.controller';
import { validate } from '../middlewares/validate.middleware';
import { requireAdmin } from '../middlewares/auth.middleware';
import {
  CreateArticleSchema,
  UpdateArticleSchema,
  ArticleQuerySchema,
} from '@havoice/shared';

/**
 * Article Routes
 *
 * 路由設計原則：
 * - RESTful 語義：GET(查詢) / POST(建立) / PATCH(部分更新) / DELETE(刪除)
 * - 驗證中間件在 Controller 之前執行，確保進入 Controller 的資料已通過驗證
 * - slug 路由放在 :id 路由之前，避免路由匹配衝突
 *
 * 權限設計：
 * - GET（列表 / slug / 單筆）為公開端點，供前台讀取
 * - POST / PATCH / DELETE 寫入操作需登入且角色為 ADMIN / EDITOR（requireAdmin）
 */
const router: ExpressRouter = Router();

// ─── 列表查詢（含分頁與篩選） ───
router.get(
  '/',
  validate(ArticleQuerySchema, 'query'),
  articleController.findAll.bind(articleController)
);

// ─── 透過 slug 取得文章（前台用，需放在 :id 之前） ───
router.get(
  '/slug/:slug',
  articleController.findBySlug.bind(articleController)
);

// ─── 取得單一文章 ───
router.get(
  '/:id',
  articleController.findById.bind(articleController)
);

// ─── 建立文章（需 ADMIN / EDITOR） ───
router.post(
  '/',
  ...requireAdmin,
  validate(CreateArticleSchema, 'body'),
  articleController.create.bind(articleController)
);

// ─── 更新文章（部分更新，需 ADMIN / EDITOR） ───
router.patch(
  '/:id',
  ...requireAdmin,
  validate(UpdateArticleSchema, 'body'),
  articleController.update.bind(articleController)
);

// ─── 軟刪除文章（需 ADMIN / EDITOR） ───
router.delete(
  '/:id',
  ...requireAdmin,
  articleController.delete.bind(articleController)
);

export { router as articleRouter };
