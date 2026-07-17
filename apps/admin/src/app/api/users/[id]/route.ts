import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

import { prisma } from '@havoice/database';

import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toNumber } from '@/lib/api-helpers';
import { UpdateUserSchema, InlineUserPatchSchema } from '@/lib/schemas/user.schema';

// bcrypt 需 Node.js Runtime
export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 10;

/**
 * GET /api/users/[id]
 *
 * 取得單一會員資料（供編輯頁預填），絕不回傳 passwordHash
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    const [user, orderSummary, recentOrders] = await Promise.all([
      prisma.user.findFirst({
        where: { id: params.id, deletedAt: null, role: 'USER' },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          status: true,
          phone: true,
          address: true,
          remark: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.order.aggregate({
        where: { userId: params.id, deletedAt: null },
        _count: { _all: true },
        _sum: { totalAmount: true },
        _max: { createdAt: true },
      }),
      prisma.order.findMany({
        where: { userId: params.id, deletedAt: null },
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

    if (!user) {
      return jsonError(404, 'USER_NOT_FOUND', '找不到此會員');
    }

    return jsonOk({
      ...user,
      name: user.name ?? '',
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
    console.error('[GET /api/users/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入會員資料，請稍後再試');
  }
}

/**
 * PUT /api/users/[id]
 *
 * 完整表單更新（與行內快速編輯 PATCH 分開處理）
 * 防禦：
 *  - server-side 以 UpdateUserSchema 驗證
 *  - 未傳入密碼（或空字串）則不更新密碼欄位；有傳入則重新 hash
 *  - Email 變更需檢查唯一性（排除自己），衝突回 409
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const existing = await prisma.user.findFirst({
      where: { id: params.id, deletedAt: null, role: 'USER' },
      select: { id: true },
    });
    if (!existing) {
      return jsonError(404, 'USER_NOT_FOUND', '找不到此會員');
    }

    const parsed = UpdateUserSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        '欄位驗證失敗，請檢查輸入內容',
        parsed.error.flatten().fieldErrors
      );
    }

    const data = parsed.data;
    const email = data.email.trim().toLowerCase();

    // Email 唯一性檢查（排除自己）
    const conflict = await prisma.user.findFirst({
      where: { email, id: { not: existing.id } },
      select: { id: true },
    });
    if (conflict) {
      return jsonError(409, 'EMAIL_TAKEN', '此 Email 已被使用', { field: 'email' });
    }

    const updateData: Record<string, unknown> = {
      name: data.name,
      email,
      role: 'USER', // 會員管理域不允許變更為管理角色
      status: data.status,
      phone: data.phone ?? null,
      address: data.address ?? null,
      remark: data.remark ?? null,
    };

    // image 有提供才更新（空字串視為清除頭像 -> null）
    if (data.image !== undefined) {
      updateData.image = data.image ? data.image : null;
    }

    // 僅在有提供非空密碼時更新
    if (data.password !== undefined && data.password !== '') {
      updateData.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: updateData as never,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        image: true,
        phone: true,
        address: true,
        remark: true,
        updatedAt: true,
      },
    });

    return jsonOk(updated);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return jsonError(409, 'EMAIL_TAKEN', '此 Email 已被使用', { field: 'email' });
    }
    console.error('[PUT /api/users/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新會員失敗，請稍後再試');
  }
}

/**
 * PATCH /api/users/[id]
 *
 * 行內快速編輯：支援部分更新 role 與 status
 * 防禦：
 *  - 僅允許白名單欄位（role / status），避免大量賦值漏洞
 *  - 以 InlineUserPatchSchema 驗證 enum 合法性
 *  - 確認會員存在且未軟刪除
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const body = (raw ?? {}) as Record<string, unknown>;
    // 會員行內快編僅允許 status（角色不可在此變更）
    const candidate: Record<string, unknown> = {};
    if (body.status !== undefined && body.status !== null && body.status !== '') candidate.status = body.status;

    const parsed = InlineUserPatchSchema.safeParse(candidate);
    if (!parsed.success) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        '欄位驗證失敗，請檢查輸入內容',
        parsed.error.flatten().fieldErrors
      );
    }

    const user = await prisma.user.findFirst({
      where: { id: params.id, deletedAt: null, role: 'USER' },
      select: { id: true },
    });
    if (!user) {
      return jsonError(404, 'USER_NOT_FOUND', '找不到此會員');
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: parsed.data as never,
      select: { id: true, name: true, email: true, role: true, status: true, updatedAt: true },
    });

    return jsonOk(updated);
  } catch (err) {
    console.error('[PATCH /api/users/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新會員失敗，請稍後再試');
  }
}

/**
 * DELETE /api/users/[id]
 *
 * 軟刪除（設定 deletedAt 並將 status 設為 DELETED），與全站軟刪除慣例一致
 * 防禦：禁止刪除自己，避免管理員把自己鎖在外
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    if (guard.user.id === params.id) {
      return jsonError(400, 'CANNOT_DELETE_SELF', '無法刪除目前登入中的帳號');
    }

    const user = await prisma.user.findFirst({
      where: { id: params.id, deletedAt: null, role: 'USER' },
      select: { id: true },
    });
    if (!user) {
      return jsonError(404, 'USER_NOT_FOUND', '找不到此會員，或已被刪除');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });

    return jsonOk({ id: user.id, deleted: true });
  } catch (err) {
    console.error('[DELETE /api/users/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '刪除會員失敗，請稍後再試');
  }
}
