import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

import { prisma, type Prisma } from '@havoice/database';

import { requireSuperAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toInt } from '@/lib/api-helpers';
import { CreateSystemUserSchema, SYSTEM_ROLES } from '@/lib/schemas/user.schema';

// bcrypt 需 Node.js Runtime
export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 10;

/**
 * GET /api/system-users
 *
 * 系統帳號列表（分頁 + 關鍵字搜尋 name/email + role 篩選）
 * 安全：requireSuperAdminSession（僅 SUPER_ADMIN）
 * 防禦：
 *  - 僅回傳管理角色帳號（ADMIN / EDITOR / VENDOR），不含一般會員與 SUPER_ADMIN
 *  - 分頁參數安全轉換、僅未軟刪除、絕不回傳 passwordHash
 */
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, toInt(searchParams.get('page')) || 1);
    const rawLimit = toInt(searchParams.get('limit')) || 10;
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const keyword = (searchParams.get('keyword') || '').trim();
    const roleFilter = (searchParams.get('role') || '').trim();

    // 僅撈管理角色（不含 SUPER_ADMIN，避免在此頁誤改最高權限帳號）
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      role: { in: [...SYSTEM_ROLES] },
    };

    if (roleFilter && (SYSTEM_ROLES as readonly string[]).includes(roleFilter)) {
      where.role = roleFilter as Prisma.UserWhereInput['role'];
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { email: { contains: keyword } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    return jsonOk({
      items: users.map((u) => ({
        id: u.id,
        name: u.name ?? '',
        email: u.email,
        image: u.image,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error('[GET /api/system-users] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入系統帳號列表，請稍後再試');
  }
}

/**
 * POST /api/system-users
 *
 * 新增系統帳號（ADMIN / EDITOR / VENDOR）
 * 安全：requireSuperAdminSession（僅 SUPER_ADMIN）
 * 防禦：
 *  - server-side 以 CreateSystemUserSchema 驗證（role 僅允許管理角色，杜絕建立 SUPER_ADMIN）
 *  - 密碼以 bcryptjs hash；Email 唯一性檢查
 */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const parsed = CreateSystemUserSchema.safeParse(raw ?? {});
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

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return jsonError(409, 'EMAIL_TAKEN', '此 Email 已被使用', { field: 'email' });
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const created = await prisma.user.create({
      data: {
        name: data.name,
        email,
        passwordHash,
        role: data.role,
        status: data.status,
        image: data.image ? data.image : null,
      },
      select: { id: true, name: true, email: true, role: true, status: true, image: true },
    });

    return jsonOk(created, { status: 201 });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return jsonError(409, 'EMAIL_TAKEN', '此 Email 已被使用', { field: 'email' });
    }
    console.error('[POST /api/system-users] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '建立系統帳號失敗，請稍後再試');
  }
}
