// apps/web/src/app/api/user/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@havoice/database';

/**
 * 會員訂單列表 API Route
 *
 * GET /api/user/orders?page=1&limit=10
 * - 僅回傳當前登入使用者的訂單
 * - 支援分頁
 * - 按建立時間降序排列
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: '請先登入' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')));
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          userId: session.user.id,
          deletedAt: null,
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          createdAt: true,
          // 🟢 改為讀取明細數量，以便後續加總
          items: {
            select: { quantity: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({
        where: {
          userId: session.user.id,
          deletedAt: null,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: orders.map((order) => {
        // 🟢 將 quantity 加總出真實件數
        const realItemCount = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: Number(order.totalAmount),
          itemCount: realItemCount, // 🟢 替換為真實件數
          createdAt: order.createdAt,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/user/orders] Error:', error);
    return NextResponse.json(
      { success: false, message: '取得訂單失敗' },
      { status: 500 }
    );
  }
}