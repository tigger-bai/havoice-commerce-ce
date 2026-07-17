import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@havoice/database';
import type { RegisterDTO, LoginDTO, AuthTokenPayload, AuthResponse } from '@havoice/shared';
import { AppError } from '../utils/app-error';
import { env } from '../config/env';

/**
 * AuthService - 認證服務層
 *
 * 設計決策：
 * - 密碼使用 bcryptjs 進行 12 輪雜湊（平衡安全性與效能）
 * - JWT Token 包含最小必要資訊（userId, email, role）
 * - 登入失敗時不透露是帳號不存在還是密碼錯誤（防止帳號枚舉攻擊）
 * - 註冊時檢查 email 唯一性，並回傳友善的錯誤訊息
 */

const SALT_ROUNDS = 12;
const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN;

export class AuthService {
  /**
   * 使用者註冊
   */
  static async register(dto: Omit<RegisterDTO, 'confirmPassword'>): Promise<AuthResponse> {
    // 檢查 email 是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new AppError(409, '此電子郵件已被註冊', 'EMAIL_ALREADY_EXISTS');
    }

    // 密碼雜湊
    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    // 建立使用者
    const user = await prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hashedPassword,
        name: dto.name || null,
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    // 簽發 JWT
    const token = AuthService.signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
      expiresIn: JWT_EXPIRES_IN,
    };
  }

  /**
   * 使用者登入
   */
  static async login(dto: LoginDTO): Promise<AuthResponse> {
    // 查找使用者（包含密碼欄位）
    const user = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    // 統一的錯誤訊息，防止帳號枚舉攻擊
    if (!user) {
      throw new AppError(401, '電子郵件或密碼錯誤', 'INVALID_CREDENTIALS');
    }

    // 檢查帳號狀態
    if (user.status === 'SUSPENDED') {
      throw new AppError(403, '此帳號已被停權，請聯繫客服', 'ACCOUNT_SUSPENDED');
    }

    if (user.deletedAt) {
      throw new AppError(401, '電子郵件或密碼錯誤', 'INVALID_CREDENTIALS');
    }

    // 驗證密碼（passwordHash 可能為 null，例如 OAuth 註冊的帳號）
    if (!user.passwordHash) {
      throw new AppError(401, '電子郵件或密碼錯誤', 'INVALID_CREDENTIALS');
    }
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, '電子郵件或密碼錯誤', 'INVALID_CREDENTIALS');
    }

    // 簽發 JWT
    const token = AuthService.signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
      expiresIn: JWT_EXPIRES_IN,
    };
  }

  /**
   * 透過 Token 取得當前使用者資訊
   */
  static async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user || user.status === 'SUSPENDED') {
      throw new AppError(401, '使用者不存在或已被停權', 'USER_NOT_FOUND');
    }

    return user;
  }

  /**
   * 簽發 JWT Token
   */
  private static signToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  /**
   * 驗證 JWT Token（供中間件使用）
   */
  static verifyToken(token: string): AuthTokenPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(401, 'Token 已過期，請重新登入', 'TOKEN_EXPIRED');
      }
      throw new AppError(401, '無效的認證 Token', 'INVALID_TOKEN');
    }
  }
}
