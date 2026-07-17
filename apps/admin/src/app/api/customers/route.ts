import { NextRequest } from 'next/server';

import { prisma, type Prisma } from '@havoice/database';

import { jsonError, jsonOk, toInt } from '@/lib/api-helpers';
import { requireAdminSession } from '@/lib/auth/api-guard';
import { CustomerCreateSchema } from '@/lib/schemas/customer.schema';

export async function GET(req: NextRequest) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    const { searchParams } = new URL(req.url);
    const keyword = (searchParams.get('keyword') || '').trim();
    const page = Math.max(1, toInt(searchParams.get('page')) || 1);
    const rawLimit = toInt(searchParams.get('limit')) || 20;
    const limit = Math.min(Math.max(1, rawLimit), 100);

    const where: Prisma.CustomerWhereInput = { deletedAt: null };

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { phone: { contains: keyword } },
        { email: { contains: keyword } },
        { facebookName: { contains: keyword } },
        { lineId: { contains: keyword } },
        { address: { contains: keyword } },
      ];
    }

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          lineId: true,
          facebookName: true,
          postalCode: true,
          city: true,
          district: true,
          address: true,
          remark: true,
          source: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: { where: { deletedAt: null } },
            },
          },
          orders: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
    ]);

    return jsonOk({
      items: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        lineId: customer.lineId,
        facebookName: customer.facebookName,
        postalCode: customer.postalCode,
        city: customer.city,
        district: customer.district,
        address: customer.address,
        remark: customer.remark,
        source: customer.source,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        orderCount: customer._count.orders,
        lastOrderAt: customer.orders[0]?.createdAt ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error('[GET /api/customers] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法查詢客戶資料，請稍後再試');
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const parsed = CustomerCreateSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', '客戶資料格式不正確', parsed.error.flatten());
    }

    const data = parsed.data;
    const customer = await prisma.customer.create({
      data: {
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        lineId: data.lineId ?? null,
        facebookName: data.facebookName ?? null,
        postalCode: data.postalCode ?? null,
        city: data.city ?? null,
        district: data.district ?? null,
        address: data.address ?? null,
        remark: data.remark ?? null,
        source: data.source ?? 'ADMIN_MANUAL',
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        lineId: true,
        facebookName: true,
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

    return jsonOk(customer, { status: 201 });
  } catch (err) {
    console.error('[POST /api/customers] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '建立客戶失敗，請稍後再試');
  }
}
