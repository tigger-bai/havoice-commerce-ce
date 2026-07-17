import { NextRequest } from 'next/server';

import { prisma } from '@havoice/database';
import { UpdateLayoutSectionSchema, PatchLayoutSectionSchema } from '@havoice/shared';

import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toInt } from '@/lib/api-helpers';

type RouteContext = { params: { id: string } };

/**
 * GET /api/layouts/[id]
 *
 * 單筆版位（含 items，按 sortOrder 排序）供編輯頁預填
 * 安全：requireAdminSession
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const section = await prisma.layoutSection.findUnique({
      where: { id: params.id },
      include: {
        items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    if (!section) {
      return jsonError(404, 'NOT_FOUND', '找不到指定的版位');
    }

    return jsonOk({
      id: section.id,
      title: section.title,
      type: section.type,
      pageRoute: section.pageRoute,
      sortOrder: toInt(section.sortOrder),
      isActive: Boolean(section.isActive),
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
      items: section.items.map((it) => ({
        id: it.id,
        sectionId: it.sectionId,
        title: it.title,
        imageUrl: it.imageUrl,
        linkUrl: it.linkUrl,
        sortOrder: toInt(it.sortOrder),
        isActive: Boolean(it.isActive),
        createdAt: it.createdAt,
        updatedAt: it.updatedAt,
      })),
    });
  } catch (err) {
    console.error('[GET /api/layouts/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入版位資料，請稍後再試');
  }
}

/**
 * PUT /api/layouts/[id]
 *
 * 完整更新版位基本資料
 * 安全：requireAdminSession（寫入受保護）
 * 防禦：UpdateLayoutSectionSchema 驗證；sortOrder 正規化
 */
export async function PUT(req: NextRequest, { params }: RouteContext) {
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

    const body = (raw ?? {}) as Record<string, unknown>;
    const normalized: Record<string, unknown> = { ...body };
    if (body.sortOrder !== undefined && body.sortOrder !== null && body.sortOrder !== '') {
      normalized.sortOrder = Math.max(0, toInt(body.sortOrder));
    } else if (body.sortOrder === '' || body.sortOrder === null) {
      delete normalized.sortOrder;
    }

    const parsed = UpdateLayoutSectionSchema.safeParse(normalized);
    if (!parsed.success) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        '欄位驗證失敗，請檢查輸入內容',
        parsed.error.flatten().fieldErrors
      );
    }

    const existing = await prisma.layoutSection.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) {
      return jsonError(404, 'NOT_FOUND', '找不到指定的版位');
    }

    const updated = await prisma.layoutSection.update({
      where: { id: params.id },
      data: parsed.data,
      select: { id: true, title: true, type: true, pageRoute: true, sortOrder: true, isActive: true },
    });

    return jsonOk(updated);
  } catch (err) {
    console.error('[PUT /api/layouts/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新版位失敗，請稍後再試');
  }
}

/**
 * PATCH /api/layouts/[id]
 *
 * 行內快速切換 isActive / sortOrder（與完整更新 PUT 分開處理）
 * 安全：requireAdminSession
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
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

    const body = (raw ?? {}) as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    if (typeof body.isActive === 'boolean') normalized.isActive = body.isActive;
    if (body.sortOrder !== undefined && body.sortOrder !== null && body.sortOrder !== '') {
      normalized.sortOrder = Math.max(0, toInt(body.sortOrder));
    }

    const parsed = PatchLayoutSectionSchema.safeParse(normalized);
    if (!parsed.success) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        '欄位驗證失敗，請檢查輸入內容',
        parsed.error.flatten().fieldErrors
      );
    }

    const existing = await prisma.layoutSection.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) {
      return jsonError(404, 'NOT_FOUND', '找不到指定的版位');
    }

    const updated = await prisma.layoutSection.update({
      where: { id: params.id },
      data: parsed.data,
      select: { id: true, isActive: true, sortOrder: true },
    });

    return jsonOk(updated);
  } catch (err) {
    console.error('[PATCH /api/layouts/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新版位狀態失敗，請稍後再試');
  }
}

/**
 * DELETE /api/layouts/[id]
 *
 * 刪除版位（LayoutItem 因 onDelete: Cascade 會一併刪除）
 * 安全：requireAdminSession
 * 備註：LayoutSection 無 deletedAt 欄位，採硬刪除（內容版位無歷史保留需求）
 */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const existing = await prisma.layoutSection.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) {
      return jsonError(404, 'NOT_FOUND', '找不到指定的版位');
    }

    await prisma.layoutSection.delete({ where: { id: params.id } });
    return jsonOk({ id: params.id });
  } catch (err) {
    console.error('[DELETE /api/layouts/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '刪除版位失敗，請稍後再試');
  }
}
