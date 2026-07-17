import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import CredentialsProvider from 'next-auth/providers/credentials';

import { prisma } from '@havoice/database';

/**
 * 後台 NextAuth.js 設定
 *
 * 與前台共用相同的認證邏輯，但：
 * - pages.signIn 指向後台登入頁 (/auth/login)
 * - 登入時額外檢查角色是否為 ADMIN 或 EDITOR
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60,
  },

  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },

  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: '管理員登入',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: '密碼', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('請輸入電子郵件與密碼');
        }

        const user = await prisma.user.findFirst({
          where: {
            email: credentials.email.toLowerCase().trim(),
            deletedAt: null,
          },
        });

        if (!user || !user.passwordHash) {
          throw new Error('電子郵件或密碼錯誤');
        }

        if (user.status === 'SUSPENDED') {
          throw new Error('此帳號已被停權');
        }

        // 後台登入額外檢查：允許 SUPER_ADMIN / ADMIN / EDITOR / VENDOR（USER 不可進後台）
        const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VENDOR'];
        if (!allowedRoles.includes(user.role)) {
          throw new Error('此帳號沒有後台管理權限');
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          throw new Error('電子郵件或密碼錯誤');
        }

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
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.status = (user as any).status;
      }
      if (trigger === 'update' && session) {
        token.name = session.name;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.status = token.status as string;
      }
      return session;
    },
  },

  debug: process.env.NODE_ENV === 'development',
};
