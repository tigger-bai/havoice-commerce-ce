import { NextRequest } from 'next/server';

import { prisma } from '@havoice/database';
import { UpdateLayoutItemSchema } from '@havoice/shared';

import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toInt } from '@/lib/api-helpers';

type RouteContext = { params: { id: string; itemId: string } };

/**
 * 確認 item 確實存在且隸屬於該版位，避免跨版位操作
 */
async function findScopedItem(sectionId: string, itemId: string) {
  return prisma.layoutItem.findFirst({
    where: { id: itemId, sectionId },
    select: { id: true },
  });
}

/**
 * PUT /api/layouts/[id]/items/[itemId]
 *
 * 完整更新內容項目
 * 安全：requireAdminSession（寫入受保護）
 * 防禦：UpdateLayoutItemSchema 驗證；sortOrder 正規化；空字串 linkUrl/title 轉 null
 */
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const item = await findScopedItem(params.id, params.itemId);
    if (!item) {
      return jsonError(404, 'NOT_FOUND', '找不到指定的內容項目');
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const body = (raw ?? {}) as Record<string, unknown>;
    const normalized: Record<string, unknown> = { ...body };
    delete normalized.sectionId; // 不允許變更所屬版位
    if (body.sortOrder !== undefined && body.sortOrder !== null && body.sortOrder !== '') {
      normalized.sortOrder = Math.max(0, toInt(body.sortOrder));
    } else if (body.sortOrder === '' || body.sortOrder === null) {
      delete normalized.sortOrder;
    }

    const parsed = UpdateLayoutItemSchema.safeParse(normalized);
    if (!parsed.success) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        '欄位驗證失敗，請檢查輸入內容',
        parsed.error.flatten().fieldErrors
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title ? data.title : null;
    if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
    if (data.linkUrl !== undefined) updateData.linkUrl = data.linkUrl ? data.linkUrl : null;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.layoutItem.update({
      where: { id: params.itemId },
      data: updateData,
    });

    return jsonOk({
      id: updated.id,
      sectionId: updated.sectionId,
      title: updated.title,
      imageUrl: updated.imageUrl,
      linkUrl: updated.linkUrl,
      sortOrder: toInt(updated.sortOrder),
      isActive: Boolean(updated.isActive),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error('[PUT /api/layouts/[id]/items/[itemId]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新內容項目失敗，請稍後再試');
  }
}

/**
 * PATCH /api/layouts/[id]/items/[itemId]
 *
 * 行內快速切換 isActive / sortOrder
 * 安全：requireAdminSession
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const item = await findScopedItem(params.id, params.itemId);
    if (!item) {
      return jsonError(404, 'NOT_FOUND', '找不到指定的內容項目');
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const body = (raw ?? {}) as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};
    if (typeof body.isActive === 'boolean') updateData.isActive = body.isActive;
    if (body.sortOrder !== undefined && body.sortOrder !== null && body.sortOrder !== '') {
      updateData.sortOrder = Math.max(0, toInt(body.sortOrder));
    }

    if (Object.keys(updateData).length === 0) {
      return jsonError(400, 'VALIDATION_ERROR', '請提供 isActive 或 sortOrder 至少一個欄位');
    }

    const updated = await prisma.layoutItem.update({
      where: { id: params.itemId },
      data: updateData,
      select: { id: true, isActive: true, sortOrder: true },
    });

    return jsonOk({
      id: updated.id,
      isActive: Boolean(updated.isActive),
      sortOrder: toInt(updated.sortOrder),
    });
  } catch (err) {
    console.error('[PATCH /api/layouts/[id]/items/[itemId]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新內容項目狀態失敗，請稍後再試');
  }
}

/**
 * DELETE /api/layouts/[id]/items/[itemId]
 *
 * 刪除單筆內容項目（硬刪除）
 * 安全：requireAdminSession
 */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const item = await findScopedItem(params.id, params.itemId);
    if (!item) {
      return jsonError(404, 'NOT_FOUND', '找不到指定的內容項目');
    }

    await prisma.layoutItem.delete({ where: { id: params.itemId } });
    return jsonOk({ id: params.itemId });
  } catch (err) {
    console.error('[DELETE /api/layouts/[id]/items/[itemId]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '刪除內容項目失敗，請稍後再試');
  }
}
