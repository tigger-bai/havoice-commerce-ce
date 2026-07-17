import NextAuth from 'next-auth';

import { authOptions } from '@/lib/auth/auth-options';

/**
 * NextAuth.js API Route Handler (App Router)
 *
 * 這個 Route Handler 會自動處理以下端點：
 * - GET  /api/auth/signin     → 登入頁面
 * - POST /api/auth/signin     → 執行登入
 * - GET  /api/auth/signout    → 登出頁面
 * - POST /api/auth/signout    → 執行登出
 * - GET  /api/auth/session    → 取得 Session
 * - GET  /api/auth/csrf       → 取得 CSRF Token
 * - GET  /api/auth/providers  → 取得可用 Providers
 * - POST /api/auth/callback/* → OAuth 回呼
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
