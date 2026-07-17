import { prisma } from '@havoice/database';

import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError } from '@/lib/api-helpers';

/**
 * GET /api/categories
 *
 * 回傳所有分類（供商品表單的分類下拉選單使用）
 * 安全：requireAdminSession 驗證身分與角色
 * 防禦：僅回傳必要欄位，依名稱排序
 */
export async function GET() {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });

    return jsonOk({
      items: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
      })),
    });
  } catch (err) {
    console.error('[GET /api/categories] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入分類清單，請稍後再試');
  }
}
