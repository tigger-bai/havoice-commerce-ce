import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

import { prisma } from '@havoice/database';
import { RegisterSchema } from '@havoice/shared';

/**
 * POST /api/auth/register
 *
 * 使用者註冊 API Route Handler
 *
 * 設計決策：
 * - 註冊邏輯獨立於 NextAuth（NextAuth 的 Credentials Provider 僅處理登入）
 * - 使用 packages/shared 的 RegisterSchema 進行 Zod 驗證
 * - 密碼使用 bcryptjs 12 輪雜湊
 * - 註冊成功後回傳使用者基本資訊（不含 passwordHash）
 * - 前端收到成功回應後，自動呼叫 NextAuth signIn 進行登入
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Zod 驗證
    const validationResult = RegisterSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '輸入資料驗證失敗',
            details: validationResult.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const { email, password, name } = validationResult.data;

    // 檢查 Email 是否已被註冊
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: '此電子郵件已被註冊',
          },
        },
        { status: 409 }
      );
    }

    // 密碼雜湊 (12 輪 salt)
    const passwordHash = await bcrypt.hash(password, 12);

    // 建立使用者
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        name: name || null,
        role: 'USER',
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: user,
        message: '註冊成功',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Register API Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '伺服器內部錯誤，請稍後再試',
        },
      },
      { status: 500 }
    );
  }
}
