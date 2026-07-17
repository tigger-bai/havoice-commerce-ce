import { NextRequest } from 'next/server';

import { prisma } from '@havoice/database';
import { ReorderLayoutSectionsSchema } from '@havoice/shared';

import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError } from '@/lib/api-helpers';

/**
 * PATCH /api/layouts/reorder
 *
 * 批次更新行銷版位（LayoutSection）排序。
 *
 * 規格：
 *  - 接收 { orderedIds: string[] }
 *  - 使用 Prisma $transaction 遍歷陣列，將每個 ID 的 sortOrder 設為 index + 1
 *  - 套用 requireAdminSession 權限守衛（寫入操作）
 *
 * 設計決策（防禦性）：
 *  - server-side 以 ReorderLayoutSectionsSchema 驗證輸入（須為非空 UUID 陣列）
 *  - 去除重複 ID，避免同一筆被多次更新造成順序歧義
 *  - 以 $transaction 包覆所有 update，確保「全部成功或全部回滾」的原子性
 *  - 僅更新傳入且實際存在的版位；若有不存在的 ID，回傳 400 並指出差異，不做半套更新
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
  }

  const parsed = ReorderLayoutSectionsSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      400,
      'VALIDATION_ERROR',
      '排序資料驗證失敗，請檢查輸入內容',
      parsed.error.flatten().fieldErrors
    );
  }

  // 去重並維持原順序
  const orderedIds = Array.from(new Set(parsed.data.orderedIds));
  const { pageRoute } = parsed.data;

  try {
    // 先確認所有 ID 皆存在「且屬於指定 pageRoute」，避免跨頁面誤排序或對不存在的版位更新
    const existing = await prisma.layoutSection.findMany({
      where: { id: { in: orderedIds }, pageRoute },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));
    const invalid = orderedIds.filter((id) => !existingIds.has(id));
    if (invalid.length > 0) {
      return jsonError(
        400,
        'SECTION_NOT_FOUND',
        '部分版位不存在或不屬於此頁面，排序未更新',
        { invalid, pageRoute }
      );
    }

    // 以 $transaction 批次更新 sortOrder = index + 1（原子性，範圍限於該 pageRoute）
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.layoutSection.update({
          where: { id },
          data: { sortOrder: index + 1 },
        })
      )
    );

    return jsonOk({
      pageRoute,
      updated: orderedIds.length,
      order: orderedIds.map((id, index) => ({ id, sortOrder: index + 1 })),
    });
  } catch (err) {
    console.error('[PATCH /api/layouts/reorder] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '排序更新失敗，請稍後再試');
  }
}
