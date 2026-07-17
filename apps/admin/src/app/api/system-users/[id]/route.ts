import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

import { prisma } from '@havoice/database';

import { requireSuperAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError } from '@/lib/api-helpers';
import {
  UpdateSystemUserSchema,
  InlineSystemUserPatchSchema,
  SYSTEM_ROLES,
} from '@/lib/schemas/user.schema';

// bcrypt 需 Node.js Runtime
export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 10;

// 僅可操作管理角色（不含 SUPER_ADMIN，保護最高權限帳號不被在此頁降級/刪除）
const MANAGEABLE_ROLES = [...SYSTEM_ROLES];

/**
 * GET /api/system-users/[id]
 *
 * 取得單一系統帳號（供編輯頁預填），僅限管理角色帳號，絕不回傳 passwordHash
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireSuperAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    const user = await prisma.user.findFirst({
      where: { id: params.id, deletedAt: null, role: { in: MANAGEABLE_ROLES } },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return jsonError(404, 'USER_NOT_FOUND', '找不到此系統帳號');
    }

    return jsonOk({ ...user, name: user.name ?? '' });
  } catch (err) {
    console.error('[GET /api/system-users/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入系統帳號資料，請稍後再試');
  }
}

/**
 * PUT /api/system-users/[id]
 *
 * 完整表單更新（角色僅可在管理角色間切換）
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireSuperAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const existing = await prisma.user.findFirst({
      where: { id: params.id, deletedAt: null, role: { in: MANAGEABLE_ROLES } },
      select: { id: true },
    });
    if (!existing) {
      return jsonError(404, 'USER_NOT_FOUND', '找不到此系統帳號');
    }

    const parsed = UpdateSystemUserSchema.safeParse(raw ?? {});
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
      role: data.role,
      status: data.status,
    };

    if (data.image !== undefined) {
      updateData.image = data.image ? data.image : null;
    }

    if (data.password !== undefined && data.password !== '') {
      updateData.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: updateData as never,
      select: { id: true, name: true, email: true, role: true, status: true, image: true, updatedAt: true },
    });

    return jsonOk(updated);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return jsonError(409, 'EMAIL_TAKEN', '此 Email 已被使用', { field: 'email' });
    }
    console.error('[PUT /api/system-users/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新系統帳號失敗，請稍後再試');
  }
}

/**
 * PATCH /api/system-users/[id]
 *
 * 行內快速編輯：role / status（白名單欄位，role 僅限管理角色）
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireSuperAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const body = (raw ?? {}) as Record<string, unknown>;
    const candidate: Record<string, unknown> = {};
    if (body.role !== undefined && body.role !== null && body.role !== '') candidate.role = body.role;
    if (body.status !== undefined && body.status !== null && body.status !== '') candidate.status = body.status;

    const parsed = InlineSystemUserPatchSchema.safeParse(candidate);
    if (!parsed.success) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        '欄位驗證失敗，請檢查輸入內容',
        parsed.error.flatten().fieldErrors
      );
    }

    // 禁止改動自己的角色/狀態，避免最高權限管理員自我降級或停權
    if (guard.user.id === params.id) {
      return jsonError(400, 'CANNOT_MODIFY_SELF', '無法在此變更目前登入中帳號的角色或狀態');
    }

    const user = await prisma.user.findFirst({
      where: { id: params.id, deletedAt: null, role: { in: MANAGEABLE_ROLES } },
      select: { id: true },
    });
    if (!user) {
      return jsonError(404, 'USER_NOT_FOUND', '找不到此系統帳號');
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: parsed.data as never,
      select: { id: true, name: true, email: true, role: true, status: true, updatedAt: true },
    });

    return jsonOk(updated);
  } catch (err) {
    console.error('[PATCH /api/system-users/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新系統帳號失敗，請稍後再試');
  }
}

/**
 * DELETE /api/system-users/[id]
 *
 * 軟刪除系統帳號（僅限管理角色），禁止刪除自己
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireSuperAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    if (guard.user.id === params.id) {
      return jsonError(400, 'CANNOT_DELETE_SELF', '無法刪除目前登入中的帳號');
    }

    const user = await prisma.user.findFirst({
      where: { id: params.id, deletedAt: null, role: { in: MANAGEABLE_ROLES } },
      select: { id: true },
    });
    if (!user) {
      return jsonError(404, 'USER_NOT_FOUND', '找不到此系統帳號，或已被刪除');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });

    return jsonOk({ id: user.id, deleted: true });
  } catch (err) {
    console.error('[DELETE /api/system-users/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '刪除系統帳號失敗，請稍後再試');
  }
}
