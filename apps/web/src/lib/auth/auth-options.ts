import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import CredentialsProvider from 'next-auth/providers/credentials';

import { prisma } from '@havoice/database';

function maskEmail(email: string | null | undefined): string {
  const normalizedEmail = email?.trim() || '';
  const separatorIndex = normalizedEmail.indexOf('@');

  if (separatorIndex <= 0 || separatorIndex === normalizedEmail.length - 1) {
    return '[redacted]';
  }

  return `${normalizedEmail.slice(0, 1)}***${normalizedEmail.slice(separatorIndex)}`;
}

/**
 * NextAuth.js 核心設定
 *
 * 設計決策：
 * 1. 使用 JWT 策略 (非 Database Session)：
 *    - 無需每次請求都查詢資料庫
 *    - 適合 Edge Runtime (Middleware) 使用
 *    - 搭配 PrismaAdapter 仍可支援 OAuth 帳號綁定
 *
 * 2. Credentials Provider：
 *    - 支援 Email + Password 登入
 *    - 密碼使用 bcryptjs 驗證
 *    - 帳號狀態檢查 (SUSPENDED / DELETED 拒絕登入)
 *
 * 3. 自定義 JWT/Session 回呼：
 *    - 將 user.id, role, status 注入 JWT Token
 *    - Session 中暴露 user.id 與 user.role 供前端使用
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 天
  },

  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },

  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: '帳號密碼登入',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: '密碼', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('請輸入電子郵件與密碼');
        }

        // 查詢使用者（排除軟刪除）
        const user = await prisma.user.findFirst({
          where: {
            email: credentials.email.toLowerCase().trim(),
            deletedAt: null,
          },
        });

        if (!user || !user.passwordHash) {
          throw new Error('電子郵件或密碼錯誤');
        }

        // 帳號狀態檢查
        if (user.status === 'SUSPENDED') {
          throw new Error('此帳號已被停權，請聯繫客服');
        }

        // 密碼比對
        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          throw new Error('電子郵件或密碼錯誤');
        }

        // 回傳使用者物件（NextAuth 會將其寫入 JWT）
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          status: user.status,
        };
      },
    }),

    // 未來可擴充 OAuth Providers:
    // GoogleProvider({ clientId: ..., clientSecret: ... }),
    // LineProvider({ clientId: ..., clientSecret: ... }),
  ],

  callbacks: {
    /**
     * JWT 回呼：在 Token 中注入自定義欄位
     * - 首次登入 (user 存在)：從 user 物件寫入 id, role, status
     * - 後續請求 (user 不存在)：直接回傳既有 token
     */
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.status = (user as any).status;
      }

      // 支援 useSession().update() 觸發的 session 更新
      if (trigger === 'update' && session) {
        token.name = session.name;
        token.image = session.image;
      }

      return token;
    },

    /**
     * Session 回呼：將 JWT 中的自定義欄位暴露給前端
     * - session.user.id：使用者 UUID
     * - session.user.role：角色 (USER | EDITOR | ADMIN)
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.status = token.status as string;
      }
      return session;
    },
  },

  events: {
    // 可在此處接入日誌系統記錄登入事件
    async signIn({ user }) {
      console.log(`[Auth] User signed in: ${maskEmail(user.email)}`);
    },
  },

  debug: process.env.NODE_ENV === 'development',
};
