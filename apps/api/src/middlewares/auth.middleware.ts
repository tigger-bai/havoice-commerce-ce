// apps/api/src/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import type { AuthTokenPayload } from '@havoice/shared';
// ✨ 改用官方推薦的 getToken，取代底層的 decode
import { getToken } from 'next-auth/jwt'; 

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload | any;
    }
  }
}

/**
 * 終極清理 Secret，把所有可能殘留的引號清乾淨
 */
const getCleanSecret = (): string => {
  const rawSecret = process.env.NEXTAUTH_SECRET || '';
  return rawSecret.replace(/['"]/g, ''); // 拔除任何單雙引號
};

export async function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  try {
    const secret = getCleanSecret();

    // 🔴 測試用 Log：如果還是失敗，看一下這行印出的前5碼是否前後端一致
    // console.log('API 使用的 Secret 前5碼:', secret.substring(0, 5));

    // ✨ 策略一：使用官方 getToken，它會自動掃描 req.cookies 與 req.headers
    // 將 Express req 強制轉型為 any 傳入即可，因為它內部只需要 req.cookies 與 req.headers
    const token = await getToken({ 
      req: req as any, 
      secret 
    });

    if (token && token.sub) {
      req.user = {
        id: token.sub,
        email: token.email as string,
        name: token.name as string,
        role: (token.role as string) || 'USER',
      };
      return next(); // 身分驗證通過！
    }

    // 🟢 策略二：純 JWT Bearer Token (保留給不走 NextAuth 的純 API 呼叫)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearerStr = authHeader.split(' ')[1];
      try {
        const payload = AuthService.verifyToken(bearerStr);
        req.user = payload;
        return next();
      } catch (err) {
        console.warn('⚠️ [Auth Middleware] Bearer Token 驗證失敗');
      }
    }

    return res.status(401).json({
      success: false,
      error: {
        message: '未提供有效認證 Token 或登入已過期，請重新登入',
        code: 'UNAUTHORIZED',
      },
    });
  } catch (error) {
    console.error('🚨 [Auth Middleware] 嚴重錯誤:', error);
    next(error);
  }
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const secret = getCleanSecret();
    const token = await getToken({ req: req as any, secret });

    if (token && token.sub) {
      req.user = {
        id: token.sub,
        email: token.email as string,
        name: token.name as string,
        role: (token.role as string) || 'USER',
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearerStr = authHeader.split(' ')[1];
      const payload = AuthService.verifyToken(bearerStr);
      req.user = payload;
    }
  } catch {
    // 忽略錯誤，不阻擋
  }
  next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: '未認證，請先登入', code: 'UNAUTHORIZED' },
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: '權限不足',
          code: 'FORBIDDEN',
          detail: `需要角色：${allowedRoles.join(' 或 ')}，您的角色：${user.role}`,
        },
      });
    }

    next();
  };
}

export const jwtMiddleware = authenticateJWT;
export const requireAdmin = [authenticateJWT, requireRole('SUPER_ADMIN', 'ADMIN', 'EDITOR')];
export const requireSuperAdmin = [authenticateJWT, requireRole('SUPER_ADMIN')];