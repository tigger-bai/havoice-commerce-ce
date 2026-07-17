import { Request, Response, NextFunction } from 'express';
import { articleService } from '../services/article.service';
import type { ApiSuccessResponse } from '@havoice/shared';

/**
 * Article Controller
 *
 * 職責：
 * - 接收已通過驗證中間件的 Request
 * - 呼叫 Service 層執行業務邏輯
 * - 組裝統一格式的 API 回應
 * - 將異常傳遞給全域錯誤處理器
 *
 * 設計原則：
 * - Controller 不包含任何資料庫操作邏輯
 * - Controller 不包含業務驗證邏輯（由 Zod middleware 處理）
 * - 所有方法使用 try-catch + next(error) 模式
 */
export class ArticleController {
  /**
   * GET /api/articles
   * 取得文章列表（含分頁）
   */
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await articleService.findAll(req.query as any);

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
   * GET /api/articles/:id
   * 取得單一文章（含推薦商品）
   */
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const article = await articleService.findById(id);

      const response: ApiSuccessResponse<typeof article> = {
        success: true,
        data: article,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/articles/slug/:slug
   * 透過 slug 取得文章（前台用，自動增加瀏覽次數）
   */
  async findBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const article = await articleService.findBySlug(slug);

      const response: ApiSuccessResponse<typeof article> = {
        success: true,
        data: article,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/articles
   * 建立文章
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const article = await articleService.create(req.body);

      const response: ApiSuccessResponse<typeof article> = {
        success: true,
        data: article,
        message: '文章建立成功',
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/articles/:id
   * 更新文章（部分更新）
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const article = await articleService.update(id, req.body);

      const response: ApiSuccessResponse<typeof article> = {
        success: true,
        data: article,
        message: '文章更新成功',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/articles/:id
   * 軟刪除文章
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await articleService.softDelete(id);

      res.status(200).json({
        success: true,
        data: null,
        message: '文章已刪除',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const articleController = new ArticleController();
