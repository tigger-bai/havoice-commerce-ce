import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

import { prisma, type Prisma } from '@havoice/database';

import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toInt } from '@/lib/api-helpers';
import { CreateUserSchema } from '@/lib/schemas/user.schema';

// bcrypt 需 Node.js Runtime
export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 10;

/**
 * GET /api/users
 *
 * 會員列表（分頁 + 關鍵字搜尋 name/email）
 * 安全：requireAdminSession（後台管理角色皆可檢視會員）
 * 防禦：
 *  - 分頁參數安全轉換（page/limit 上下限夾擠）
 *  - 僅回傳未軟刪除（deletedAt = null）的「一般會員」(role = USER)
 *  - 絕不回傳管理角色帳號（ADMIN/EDITOR/VENDOR/SUPER_ADMIN）
 *  - 絕不回傳 passwordHash
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, toInt(searchParams.get('page')) || 1);
    const rawLimit = toInt(searchParams.get('limit')) || 10;
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const keyword = (searchParams.get('keyword') || '').trim();

    // 僅撈一般會員（role = USER），管理角色一律由 /system-users 管理
    const where: Prisma.UserWhereInput = { deletedAt: null, role: 'USER' };

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
    console.error('[GET /api/users] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入會員列表，請稍後再試');
  }
}

/**
 * POST /api/users
 *
 * 新增會員（角色強制為 USER）
 * 安全：requireAdminSession
 * 防禦：
 *  - server-side 以 CreateUserSchema 進行 Zod 驗證（role 僅允許 USER）
 *  - 密碼以 bcryptjs hash 後存入 passwordHash
 *  - Email 已被註冊回 409
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdminSession();
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

    const parsed = CreateUserSchema.safeParse(raw ?? {});
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

    // Email 唯一性預檢
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
        role: 'USER', // 會員管理域固定建立一般會員
        status: data.status,
        image: data.image ? data.image : null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        remark: data.remark ?? null,
      },
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
      },
    });

    return jsonOk(created, { status: 201 });
  } catch (err) {
    // Prisma 唯一鍵衝突（競態保險）
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return jsonError(409, 'EMAIL_TAKEN', '此 Email 已被使用', { field: 'email' });
    }
    console.error('[POST /api/users] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '建立會員失敗，請稍後再試');
  }
}
