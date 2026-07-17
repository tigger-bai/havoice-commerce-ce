import { NextResponse } from 'next/server';

import { prisma } from '@havoice/database';

import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toNumber } from '@/lib/api-helpers';

/**
 * GET /api/dashboard
 *
 * 營運總覽統計資料：
 * - 核心指標：總營收（已付款訂單）、總訂單數、會員總數、庫存警報數（stock < 10）
 * - 最新 5 筆待處理 (PENDING) 訂單
 *
 * 安全：requireAdminSession 驗證身分與角色
 * 防禦：所有金額以 toNumber 轉換；查詢以 Promise.all 並行並各自容錯
 */

const LOW_STOCK_THRESHOLD = 10;

export async function GET() {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const [
      paidAggregate,
      totalOrders,
      pendingCount,
      totalMembers,
      lowStockCount,
      pendingOrders,
    ] = await Promise.all([
      // 總營收：僅計入已付款（PAID）且未軟刪除的訂單
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { paymentStatus: 'PAID', deletedAt: null },
      }),
      // 總訂單數（未軟刪除）
      prisma.order.count({ where: { deletedAt: null } }),
      // 待處理訂單數
      prisma.order.count({ where: { status: 'PENDING', deletedAt: null } }),
      // 註冊會員總數（未軟刪除）
      prisma.user.count({ where: { deletedAt: null } }),
      // 庫存警報：stock < 10 且未軟刪除
      prisma.product.count({
        where: { stock: { lt: LOW_STOCK_THRESHOLD }, deletedAt: null },
      }),
      // 最新 5 筆待處理訂單
      prisma.order.findMany({
        where: { status: 'PENDING', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return jsonOk({
      metrics: {
        totalRevenue: toNumber(paidAggregate._sum.totalAmount),
        totalOrders,
        pendingOrders: pendingCount,
        totalMembers,
        lowStockCount,
      },
      recentPendingOrders: pendingOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        totalAmount: toNumber(o.totalAmount),
        status: o.status,
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt,
        customerName: o.user?.name || o.user?.email || '未知會員',
        itemCount: o._count?.items ?? 0,
      })),
    });
  } catch (err) {
    console.error('[GET /api/dashboard] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入儀表板資料，請稍後再試');
  }
}
