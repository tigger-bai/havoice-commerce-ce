import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { productController } from '../controllers/product.controller';
import { validate } from '../middlewares/validate.middleware';
import { requireAdmin } from '../middlewares/auth.middleware';
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductQuerySchema,
} from '@havoice/shared';

/**
 * Product Routes
 *
 * 路由設計原則同 Article Routes
 * - GET 為公開端點；POST / PATCH / DELETE 需 ADMIN / EDITOR
 */
const router: ExpressRouter = Router();

// ─── 列表查詢（含分頁與篩選） ───
router.get(
  '/',
  validate(ProductQuerySchema, 'query'),
  productController.findAll.bind(productController)
);

// ─── 透過 slug 取得商品（前台用，需放在 :id 之前） ───
router.get(
  '/slug/:slug',
  productController.findBySlug.bind(productController)
);

// ─── 取得單一商品 ───
router.get(
  '/:id',
  productController.findById.bind(productController)
);

// ─── 建立商品（需 ADMIN / EDITOR） ───
router.post(
  '/',
  ...requireAdmin,
  validate(CreateProductSchema, 'body'),
  productController.create.bind(productController)
);

// ─── 更新商品（部分更新，需 ADMIN / EDITOR） ───
router.patch(
  '/:id',
  ...requireAdmin,
  validate(UpdateProductSchema, 'body'),
  productController.update.bind(productController)
);

// ─── 軟刪除商品（需 ADMIN / EDITOR） ───
router.delete(
  '/:id',
  ...requireAdmin,
  productController.delete.bind(productController)
);

export { router as productRouter };
