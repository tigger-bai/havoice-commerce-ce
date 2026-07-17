import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { RegisterSchema, LoginSchema } from '@havoice/shared';
import { AuthController } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router: ExpressRouter = Router();

/**
 * Auth Routes
 *
 * POST   /api/auth/register  - 使用者註冊
 * POST   /api/auth/login     - 使用者登入
 * GET    /api/auth/me        - 取得當前使用者資訊（需認證）
 */

router.post('/register', validate(RegisterSchema), AuthController.register);
router.post('/login', validate(LoginSchema), AuthController.login);
router.get('/me', authenticateJWT, AuthController.me);

export { router as authRoutes };
