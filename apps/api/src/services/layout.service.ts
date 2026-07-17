import { prisma, type Prisma } from '@havoice/database';

/**
 * Layout Service（行銷版位 — 公開讀取）
 *
 * 職責：提供前台各頁面所需的「啟用中」行銷版位資料
 * 設計原則：
 * - 僅回傳 isActive: true 的 LayoutSection，並依 sortOrder 升序、其次 createdAt 升序
 * - include items，且 items 同樣僅取 isActive: true，依 sortOrder 升序排序
 * - 支援 pageRoute 過濾：前台首頁('/')、商城頁('/shop') 各自取得獨立佈景
 * - 此為公開端點，不需驗證；僅輸出前台渲染所需欄位，避免洩漏多餘資訊
 */

// 與 packages/shared 的 PAGE_ROUTES 對齊（避免 api 反向相依 admin 邏輯，於此維持單一白名單來源）
const PAGE_ROUTE_WHITELIST = ['/', '/shop'] as const;

export class LayoutService {
  /**
   * 取得啟用中的行銷版位（含啟用中的內容項目）
   *
   * @param pageRoute 選填。傳入白名單內路由時，僅回傳該頁面的版位；
   *                  未傳或非法值則回傳全部（向後相容）。
   */
  async findActiveSections(pageRoute?: string) {
    const where: Prisma.LayoutSectionWhereInput = { isActive: true };

    if (pageRoute && (PAGE_ROUTE_WHITELIST as readonly string[]).includes(pageRoute)) {
      where.pageRoute = pageRoute;
    }

    const sections = await prisma.layoutSection.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    // 映射為前台友善格式（僅輸出必要欄位）
    return sections.map((section) => ({
      id: section.id,
      title: section.title,
      type: section.type,
      pageRoute: section.pageRoute,
      sortOrder: section.sortOrder,
      items: section.items.map((item) => ({
        id: item.id,
        title: item.title,
        imageUrl: item.imageUrl,
        linkUrl: item.linkUrl,
        sortOrder: item.sortOrder,
      })),
    }));
  }
}

export const layoutService = new LayoutService();
