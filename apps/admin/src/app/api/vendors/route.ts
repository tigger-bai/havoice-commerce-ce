import { prisma } from '@havoice/database';

import { requireProductModuleSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError } from '@/lib/api-helpers';

/**
 * GET /api/vendors
 *
 * 撈取所有角色為 VENDOR 的使用者（供商品新增/編輯表單的「指派供應商」下拉選單）
 * 安全：requireProductModuleSession（SUPER_ADMIN / ADMIN / VENDOR）
 * 設計：
 *  - 僅回傳精簡欄位（id / name / email），不外洩敏感資訊
 *  - VENDOR 雖可呼叫（避免前端條件分歧），但前端會隱藏指派欄位；
 *    真正的指派授權仍由 products API 端強制（VENDOR 一律綁本人）。
 *  - 僅回傳未軟刪除且狀態為 ACTIVE 的廠商
 */
export async function GET() {
  const guard = await requireProductModuleSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const vendors = await prisma.user.findMany({
      where: { role: 'VENDOR', deletedAt: null, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true },
    });

    return jsonOk({
      items: vendors.map((v) => ({
        id: v.id,
        name: v.name ?? '',
        email: v.email,
      })),
    });
  } catch (err) {
    console.error('[GET /api/vendors] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入供應商清單，請稍後再試');
  }
}
