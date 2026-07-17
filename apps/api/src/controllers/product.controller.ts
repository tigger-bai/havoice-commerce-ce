import { Request, Response, NextFunction } from 'express';
import { productService } from '../services/product.service';
import type { ApiSuccessResponse } from '@havoice/shared';

/**
 * Product Controller
 *
 * 職責：處理商品相關的 HTTP 請求與回應
 */
export class ProductController {
  /**
   * GET /api/products
   * 取得商品列表（含分頁）
   */
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await productService.findAll(req.query as any);

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products/:id
   * 取得單一商品
   */
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const product = await productService.findById(id);

      const response: ApiSuccessResponse<typeof product> = {
        success: true,
        data: product,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products/slug/:slug
   * 透過 slug 取得商品（前台用）
   */
  async findBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const product = await productService.findBySlug(slug);

      const response: ApiSuccessResponse<typeof product> = {
        success: true,
        data: product,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/products
   * 建立商品
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productService.create(req.body);

      const response: ApiSuccessResponse<typeof product> = {
        success: true,
        data: product,
        message: '商品建立成功',
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/products/:id
   * 更新商品（部分更新）
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const product = await productService.update(id, req.body);

      const response: ApiSuccessResponse<typeof product> = {
        success: true,
        data: product,
        message: '商品更新成功',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/products/:id
   * 軟刪除商品
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await productService.softDelete(id);

      res.status(200).json({
        success: true,
        data: null,
        message: '商品已刪除',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const productController = new ProductController();
