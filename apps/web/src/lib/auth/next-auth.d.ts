import type { DefaultSession, DefaultUser } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';

/**
 * NextAuth.js 型別擴展
 *
 * 透過 Module Augmentation 將自定義欄位 (id, role, status)
 * 注入 NextAuth 的 Session、User 與 JWT 型別中，
 * 確保整個應用程式的型別安全。
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      status: string;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    role: string;
    status: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    role: string;
    status: string;
  }
}
