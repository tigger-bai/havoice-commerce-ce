// apps/admin/src/app/api/orders/route.ts
import { NextRequest } from 'next/server';

import { prisma, type Prisma } from '@havoice/database';

import { requireProductModuleSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toNumber, toInt } from '@/lib/api-helpers';

/**
 * GET /api/orders
 *
 * 訂單列表：
 * - 分頁
 * - 訂單狀態篩選
 * - 付款狀態篩選
 * - 配送方式篩選
 * - 關鍵字搜尋
 *
 * 權限：
 * - SUPER_ADMIN / ADMIN 可看全站訂單
 * - VENDOR 只能看包含自己商品明細的訂單
 */

const VALID_ORDER_STATUS = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const VALID_PAYMENT_STATUS = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
const VALID_SHIPPING_METHOD = ['STANDARD', 'EXPRESS', 'STORE'];

export async function GET(req: NextRequest) {
  const guard = await requireProductModuleSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, toInt(searchParams.get('page')) || 1);
    const rawLimit = toInt(searchParams.get('limit')) || 10;
    const limit = Math.min(Math.max(1, rawLimit), 100);

    const status = (searchParams.get('status') || '').trim();
    const paymentStatus = (searchParams.get('paymentStatus') || '').trim();
    const shippingMethod = (searchParams.get('shippingMethod') || '').trim();
    const keyword = (searchParams.get('keyword') || '').trim();

    const isVendor = guard.user.role === 'VENDOR';

    const where: Prisma.OrderWhereInput = { deletedAt: null };

    if (isVendor) {
      where.items = { some: { vendorId: guard.user.id } };
    }

    if (status && VALID_ORDER_STATUS.includes(status)) {
      where.status = status as Prisma.OrderWhereInput['status'];
    }

    if (paymentStatus && VALID_PAYMENT_STATUS.includes(paymentStatus)) {
      where.paymentStatus = paymentStatus as Prisma.OrderWhereInput['paymentStatus'];
    }

    if (shippingMethod && VALID_SHIPPING_METHOD.includes(shippingMethod)) {
      where.shippingMethod = shippingMethod as Prisma.OrderWhereInput['shippingMethod'];
    }

    if (keyword) {
      where.OR = [
        { orderNumber: { contains: keyword } },
        { user: { name: { contains: keyword } } },
        { user: { email: { contains: keyword } } },
        { customer: { name: { contains: keyword } } },
        { customer: { phone: { contains: keyword } } },
        { customer: { email: { contains: keyword } } },
        { recipient: { name: { contains: keyword } } },
        { recipient: { phone: { contains: keyword } } },
        { recipient: { email: { contains: keyword } } },
        { notes: { contains: keyword } },
      ];
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          shippingMethod: true,
          createdAt: true,
          notes: true,
          user: { select: { name: true, email: true } },
          customer: { select: { name: true, phone: true, email: true } },
          recipient: { select: { name: true, phone: true, email: true } },
          items: isVendor
            ? {
                where: { vendorId: guard.user.id },
                select: { productPrice: true, quantity: true },
              }
            : {
                select: { productPrice: true, quantity: true },
              },
        },
      }),
    ]);

    return jsonOk({
      items: orders.map((o) => {
        let realName =
          o.recipient?.name ||
          o.customer?.name ||
          o.customer?.phone ||
          o.customer?.email ||
          o.user?.name ||
          o.user?.email ||
          '未命名客戶';

        try {
          if (o.notes) {
            const parsed = JSON.parse(o.notes) as Record<string, unknown>;
            if (!o.recipient?.name && typeof parsed.recipientName === 'string' && parsed.recipientName.trim()) {
              realName = parsed.recipientName.trim();
            }
          }
        } catch {
          // notes 不是 JSON 時忽略，維持會員名稱
        }

        if (isVendor) {
          const vendorItems = o.items ?? [];
          const vendorAmount = vendorItems.reduce(
            (sum, it) => sum + toNumber(it.productPrice) * toInt(it.quantity),
            0
          );
          const vendorQuantity = vendorItems.reduce((sum, it) => sum + toInt(it.quantity), 0);

          return {
            id: o.id,
            orderNumber: o.orderNumber,
            totalAmount: Math.round(vendorAmount * 100) / 100,
            status: o.status,
            paymentStatus: o.paymentStatus,
            paymentMethod: o.paymentMethod,
            shippingMethod: o.shippingMethod,
            createdAt: o.createdAt,
            customerName: realName,
            itemCount: vendorQuantity,
          };
        }

        const totalQuantity = (o.items ?? []).reduce((sum, it) => sum + toInt(it.quantity), 0);

        return {
          id: o.id,
          orderNumber: o.orderNumber,
          totalAmount: toNumber(o.totalAmount),
          status: o.status,
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod,
          shippingMethod: o.shippingMethod,
          createdAt: o.createdAt,
          customerName: realName,
          itemCount: totalQuantity,
        };
      }),
      filters: {
        status,
        paymentStatus,
        shippingMethod,
        keyword,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error('[GET /api/orders] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入訂單列表，請稍後再試');
  }
}
