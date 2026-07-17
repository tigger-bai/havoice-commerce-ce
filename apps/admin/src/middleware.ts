import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware - 後台路由守衛
 *
 * 在 Edge Runtime 層級攔截所有 /admin 請求，確保：
 * 1. 使用者已登入（JWT Token 存在且有效）
 * 2. 使用者角色為 ADMIN 或 EDITOR
 *
 * 設計決策：
 * - 使用 next-auth/jwt 的 getToken() 在 Edge Runtime 解析 JWT
 * - 無需查詢資料庫，效能極佳
 * - 未認證 → 重導向至登入頁
 * - 角色不符 → 重導向至 403 禁止存取頁面
 * - 排除 /auth/* 路由（登入頁本身不需要認證）
 * - 排除 /api/auth/* 路由（NextAuth API 端點）
 * - 排除靜態資源 (_next/static, favicon 等)
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 排除不需要認證的路徑
  const publicPaths = ['/auth', '/api/auth', '/_next', '/favicon.ico'];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 從 JWT Token 取得使用者資訊
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // 未登入：重導向至登入頁
  if (!token) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 角色驗證：允許 SUPER_ADMIN / ADMIN / EDITOR / VENDOR 存取後台（VENDOR 僅能使用商品/訂單模組，詳細權限由各 API 守衛與頁面 AuthGuard 控制）
  const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VENDOR'];
  if (!allowedRoles.includes(token.role as string)) {
    const forbiddenUrl = new URL('/auth/forbidden', request.url);
    return NextResponse.redirect(forbiddenUrl);
  }

  // 帳號狀態驗證：停權帳號強制登出
  if (token.status === 'SUSPENDED') {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('error', 'AccountSuspended');
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

/**
 * Middleware 匹配規則
 *
 * 保護所有後台路由，但排除：
 * - /auth/* (認證相關頁面)
 * - /api/auth/* (NextAuth API)
 * - /_next/* (靜態資源)
 */
export const config = {
  matcher: [
    /*
     * 匹配所有路徑，排除：
     * - api/auth (NextAuth API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth (login/register pages)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|auth).*)',
  ],
};
