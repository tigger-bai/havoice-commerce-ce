import { NextRequest } from 'next/server';

import { prisma, type Prisma } from '@havoice/database';
import { CreateLayoutSectionSchema, PAGE_ROUTES } from '@havoice/shared';

import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toInt } from '@/lib/api-helpers';

/**
 * GET /api/layouts
 *
 * 行銷版位（LayoutSection）列表
 * 安全：requireAdminSession（SUPER_ADMIN / ADMIN / EDITOR）
 * 規格：
 *  - 支援 ?pageRoute= 查詢參數，限定回傳特定頁面的版位（Page Builder 第二層編輯用）
 *  - include items（並按 items.sortOrder 排序）
 *  - sections 按 sortOrder 升冪、其次 createdAt 升冪
 * 防禦：
 *  - pageRoute 僅接受白名單（PAGE_ROUTES）；非法值忽略過濾，回傳全部
 *  - 所有數字欄位以 toInt 安全序列化
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const { searchParams } = new URL(req.url);
    const pageRouteParam = (searchParams.get('pageRoute') || '').trim();

    const where: Prisma.LayoutSectionWhereInput = {};
    if (pageRouteParam && (PAGE_ROUTES as readonly string[]).includes(pageRouteParam)) {
      where.pageRoute = pageRouteParam;
    }

    const sections = await prisma.layoutSection.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        items: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return jsonOk({
      items: sections.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        pageRoute: s.pageRoute,
        sortOrder: toInt(s.sortOrder),
        isActive: Boolean(s.isActive),
        itemCount: s.items.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        items: s.items.map((it) => ({
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
      })),
    });
  } catch (err) {
    console.error('[GET /api/layouts] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入版位列表，請稍後再試');
  }
}

/**
 * POST /api/layouts
 *
 * 新增行銷版位（LayoutSection）
 * 安全：requireAdminSession（寫入操作受保護）
 * 防禦：
 *  - server-side 以 CreateLayoutSectionSchema 驗證（含 pageRoute 白名單，預設 '/shop'）
 *  - sortOrder 正規化為非負整數
 *  - pageRoute 由前端編輯器帶入，落地儲存以區隔不同頁面
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

    const body = (raw ?? {}) as Record<string, unknown>;
    const normalized = {
      ...body,
      sortOrder:
        body.sortOrder === undefined || body.sortOrder === null || body.sortOrder === ''
          ? 0
          : Math.max(0, toInt(body.sortOrder)),
    };

    const parsed = CreateLayoutSectionSchema.safeParse(normalized);
    if (!parsed.success) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        '欄位驗證失敗，請檢查輸入內容',
        parsed.error.flatten().fieldErrors
      );
    }

    const data = parsed.data;
    const created = await prisma.layoutSection.create({
      data: {
        title: data.title,
        type: data.type,
        pageRoute: data.pageRoute,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
      select: { id: true, title: true, type: true, pageRoute: true, sortOrder: true, isActive: true },
    });

    return jsonOk(created, { status: 201 });
  } catch (err) {
    console.error('[POST /api/layouts] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '建立版位失敗，請稍後再試');
  }
}
