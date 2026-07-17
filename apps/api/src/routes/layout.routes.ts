import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { layoutController } from '../controllers/layout.controller';

/**
 * Layout Routes（行銷版位）
 *
 * 路由設計：
 * - GET / 為公開端點（前台首頁讀取啟用中的行銷版位），不需驗證
 * - 寫入操作由 apps/admin 的 Next.js Route Handler 負責，本服務僅提供公開讀取
 */
const router: ExpressRouter = Router();

// ─── 取得啟用中的行銷版位列表（公開） ───
router.get('/', layoutController.findActive.bind(layoutController));

export { router as layoutRouter };
