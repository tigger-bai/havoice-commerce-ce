import { Request, Response, NextFunction } from 'express';
import { layoutService } from '../services/layout.service';
import type { ApiSuccessResponse } from '@havoice/shared';

/**
 * Layout Controller（行銷版位 — 公開讀取）
 *
 * 職責：處理前台行銷版位的 HTTP 請求與回應
 */
export class LayoutController {
  /**
   * GET /api/layouts?pageRoute=
   * 取得指定頁面（或全部）啟用中的行銷版位（含啟用中的內容項目）
   * pageRoute 為選填：'/' 首頁、'/shop' 商城頁；未傳則回傳全部
   */
  async findActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pageRoute = typeof req.query.pageRoute === 'string' ? req.query.pageRoute : undefined;
      const sections = await layoutService.findActiveSections(pageRoute);

      const response: ApiSuccessResponse<typeof sections> = {
        success: true,
        data: sections,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const layoutController = new LayoutController();
