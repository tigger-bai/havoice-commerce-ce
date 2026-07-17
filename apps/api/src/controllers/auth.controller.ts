import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

/**
 * AuthController - 認證控制器
 *
 * 設計決策：
 * - 註冊時從 validated body 中解構出 confirmPassword，不傳入 Service 層
 * - 登入成功後回傳 user 資訊與 JWT Token
 * - /me 端點供前端驗證 Token 有效性並取得最新使用者資訊
 */
export class AuthController {
  /**
   * POST /api/auth/register
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { confirmPassword, ...registerData } = req.body;

      const result = await AuthService.register(registerData);

      res.status(201).json({
        success: true,
        message: '註冊成功',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   */
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.login(req.body);

      res.status(200).json({
        success: true,
        message: '登入成功',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   * 需要 authenticateJWT 中間件保護
   */
  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { message: '未認證', code: 'UNAUTHORIZED' },
        });
      }

      const user = await AuthService.getCurrentUser(userId);

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }
}
