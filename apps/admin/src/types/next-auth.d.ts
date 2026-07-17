import type { DefaultSession } from 'next-auth';

/**
 * NextAuth 型別擴充
 *
 * 將自訂的 id / role / status 欄位併入 Session.user、User 與 JWT，
 * 使後台 (auth-options / api-guard / AuthGuard) 能以型別安全方式存取。
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      status: string;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: string;
    status: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    status: string;
  }
}
