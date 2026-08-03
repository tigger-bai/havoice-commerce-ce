// apps/api/src/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import type { AuthTokenPayload } from '@havoice/shared';
// ✨ 改用官方推薦的 getToken，取代底層的 decode
import { getToken } from 'next-auth/jwt';
import { getRequiredEnv } from '../config/env';

declare global {
  namespace Express {
    interface Request {
      // Canonical principal field for both NextAuth sessions and Bearer JWTs.
      user?: AuthTokenPayload;
    }
  }
}

const nextAuthSecret = getRequiredEnv('NEXTAUTH_SECRET');

function normalizeUserId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const userId = value.trim();
  return userId || undefined;
}

function normalizeBearerPrincipal(
  payload: AuthTokenPayload,
): AuthTokenPayload | undefined {
  const userId = normalizeUserId(payload.userId);

  if (!userId) {
    return undefined;
  }

  return {
    ...payload,
    userId,
  };
}

export async function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  try {
    // ✨ 策略一：使用官方 getToken，它會自動掃描 req.cookies 與 req.headers
    // 將 Express req 強制轉型為 any 傳入即可，因為它內部只需要 req.cookies 與 req.headers
    const token = await getToken({ 
      req: req as any, 
      secret: nextAuthSecret
    });

    const nextAuthUserId = normalizeUserId(token?.sub);

    if (token && nextAuthUserId) {
      req.user = {
        userId: nextAuthUserId,
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
        const principal = normalizeBearerPrincipal(payload);

        if (principal) {
          req.user = principal;
          return next();
        }
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
  const authHeader = req.headers.authorization;
  const cookieHeader = req.headers.cookie;
  const hasSessionCookie =
    typeof cookieHeader === 'string' &&
    /(?:^|;\s*)(?:(?:__Secure-)?next-auth|authjs)\.session-token=/.test(cookieHeader);
  const hasAuthCredentials = Boolean(authHeader || hasSessionCookie);

  try {
    const token = await getToken({ req: req as any, secret: nextAuthSecret });

    const nextAuthUserId = normalizeUserId(token?.sub);

    if (token && nextAuthUserId) {
      req.user = {
        userId: nextAuthUserId,
        email: token.email as string,
        name: token.name as string,
        role: (token.role as string) || 'USER',
      };
      return next();
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearerStr = authHeader.split(' ')[1];
      const payload = AuthService.verifyToken(bearerStr);
      const principal = normalizeBearerPrincipal(payload);

      if (principal) {
        req.user = principal;
        return next();
      }
    }

    if (hasAuthCredentials) {
      return res.status(401).json({
        success: false,
        error: {
          message: '未提供有效認證 Token 或登入已過期，請重新登入',
          code: 'UNAUTHORIZED',
        },
      });
    }
  } catch {
    if (hasAuthCredentials) {
      return res.status(401).json({
        success: false,
        error: {
          message: '未提供有效認證 Token 或登入已過期，請重新登入',
          code: 'UNAUTHORIZED',
        },
      });
    }
  }

  return next();
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
