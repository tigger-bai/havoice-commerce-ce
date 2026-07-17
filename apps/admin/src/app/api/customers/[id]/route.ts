import { NextRequest } from 'next/server';

import { prisma } from '@havoice/database';

import { jsonError, jsonOk, toNumber } from '@/lib/api-helpers';
import { requireAdminSession } from '@/lib/auth/api-guard';
import { CustomerUpdateSchema } from '@/lib/schemas/customer.schema';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    const [customer, orderSummary, recentOrders] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: params.id, deletedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          facebookName: true,
          lineId: true,
          postalCode: true,
          city: true,
          district: true,
          address: true,
          remark: true,
          source: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.order.aggregate({
        where: { customerId: params.id, deletedAt: null },
        _count: { _all: true },
        _sum: { totalAmount: true },
        _max: { createdAt: true },
      }),
      prisma.order.findMany({
        where: { customerId: params.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          shippingMethod: true,
          totalAmount: true,
        },
      }),
    ]);

    if (!customer) {
      return jsonError(404, 'CUSTOMER_NOT_FOUND', '找不到此客戶');
    }

    return jsonOk({
      ...customer,
      ordersSummary: {
        totalOrders: orderSummary._count._all,
        totalAmount: toNumber(orderSummary._sum.totalAmount),
        lastOrderAt: orderSummary._max.createdAt,
      },
      recentOrders: recentOrders.map((order) => ({
        ...order,
        totalAmount: toNumber(order.totalAmount),
      })),
    });
  } catch (err) {
    console.error('[GET /api/customers/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入客戶資料，請稍後再試');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const parsed = CustomerUpdateSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', '客戶資料格式不正確', parsed.error.flatten());
    }

    const customer = await prisma.customer.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { id: true },
    });
    if (!customer) {
      return jsonError(404, 'CUSTOMER_NOT_FOUND', '找不到此客戶');
    }

    const data = parsed.data;
    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.facebookName !== undefined ? { facebookName: data.facebookName } : {}),
        ...(data.lineId !== undefined ? { lineId: data.lineId } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.district !== undefined ? { district: data.district } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.remark !== undefined ? { remark: data.remark } : {}),
        ...(data.source !== undefined ? { source: data.source } : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        facebookName: true,
        lineId: true,
        postalCode: true,
        city: true,
        district: true,
        address: true,
        remark: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return jsonOk(updated);
  } catch (err) {
    console.error('[PATCH /api/customers/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新客戶資料失敗，請稍後再試');
  }
}
