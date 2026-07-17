import { NextRequest } from 'next/server';

import { prisma } from '@havoice/database';
import { CreateLayoutItemSchema } from '@havoice/shared';

import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toInt } from '@/lib/api-helpers';

type RouteContext = { params: { id: string } };

/**
 * GET /api/layouts/[id]/items
 *
 * 取得指定版位的所有內容項目（按 sortOrder 排序）
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
      select: { id: true },
    });
    if (!section) {
      return jsonError(404, 'NOT_FOUND', '找不到指定的版位');
    }

    const items = await prisma.layoutItem.findMany({
      where: { sectionId: params.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return jsonOk({
      items: items.map((it) => ({
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
    console.error('[GET /api/layouts/[id]/items] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入內容項目，請稍後再試');
  }
}

/**
 * POST /api/layouts/[id]/items
 *
 * 於指定版位新增一筆內容項目（imageUrl 必填，由 ImageUpload 上傳後取得）
 * 安全：requireAdminSession（寫入受保護）
 * 防禦：sectionId 以路由參數為準（覆寫 body 中的值）；CreateLayoutItemSchema 驗證
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const section = await prisma.layoutSection.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!section) {
      return jsonError(404, 'NOT_FOUND', '找不到指定的版位');
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const body = (raw ?? {}) as Record<string, unknown>;
    const normalized = {
      ...body,
      // sectionId 一律以路由為準，避免跨版位竄改
      sectionId: params.id,
      sortOrder:
        body.sortOrder === undefined || body.sortOrder === null || body.sortOrder === ''
          ? 0
          : Math.max(0, toInt(body.sortOrder)),
    };

    const parsed = CreateLayoutItemSchema.safeParse(normalized);
    if (!parsed.success) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        '欄位驗證失敗，請檢查輸入內容',
        parsed.error.flatten().fieldErrors
      );
    }

    const data = parsed.data;
    const created = await prisma.layoutItem.create({
      data: {
        sectionId: params.id,
        title: data.title ? data.title : null,
        imageUrl: data.imageUrl,
        linkUrl: data.linkUrl ? data.linkUrl : null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });

    return jsonOk(
      {
        id: created.id,
        sectionId: created.sectionId,
        title: created.title,
        imageUrl: created.imageUrl,
        linkUrl: created.linkUrl,
        sortOrder: toInt(created.sortOrder),
        isActive: Boolean(created.isActive),
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/layouts/[id]/items] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '建立內容項目失敗，請稍後再試');
  }
}
