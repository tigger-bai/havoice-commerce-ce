import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@havoice/database';
import { z } from 'zod';

/**
 * 個人資料更新 API Route
 *
 * 設計決策：
 * - 使用 getServerSession 驗證身份（確保只能修改自己的資料）
 * - Zod 驗證輸入欄位
 * - 更新成功後回傳最新的 user 資料
 * - 前端收到後需呼叫 update() 更新 NextAuth Session
 */

const UpdateProfileSchema = z.object({
  name: z
    .string()
    .min(2, '姓名至少需要 2 個字元')
    .max(50, '姓名不得超過 50 個字元')
    .trim(),
  image: z
    .string()
    .url('請輸入有效的圖片網址')
    .optional()
    .or(z.literal('')),
});

// PATCH /api/user/profile - 更新個人資料
export async function PATCH(request: NextRequest) {
  try {
    // 驗證登入狀態
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: '請先登入' },
        { status: 401 }
      );
    }

    // 解析並驗證請求體
    const body = await request.json();
    const validation = UpdateProfileSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: '資料驗證失敗',
          errors: validation.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const { name, image } = validation.data;

    // 更新資料庫
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name,
        image: image || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: '個人資料已更新',
    });
  } catch (error) {
    console.error('[PATCH /api/user/profile] Error:', error);
    return NextResponse.json(
      { success: false, message: '更新失敗，請稍後再試' },
      { status: 500 }
    );
  }
}

// GET /api/user/profile - 取得個人資料
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: '請先登入' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        createdAt: true,
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: '使用者不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        orderCount: user._count.orders,
      },
    });
  } catch (error) {
    console.error('[GET /api/user/profile] Error:', error);
    return NextResponse.json(
      { success: false, message: '取得資料失敗' },
      { status: 500 }
    );
  }
}
