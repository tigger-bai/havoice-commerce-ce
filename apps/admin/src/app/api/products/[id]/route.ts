import { NextRequest } from 'next/server';

import { prisma } from '@havoice/database';
import { UpdateProductSchema } from '@havoice/shared';

import { requireProductModuleSession, type AdminSessionUser } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toNumber, toInt } from '@/lib/api-helpers';

/** 將任意輸入正規化為小數兩位的金額 */
function round2(value: unknown): number {
  const n = toNumber(value);
  return Math.round(n * 100) / 100;
}

/**
 * 多供應商所有權校驗
 * - 先確認商品存在且未軟刪除（回傳 id 與 vendorId）
 * - 若操作者為 VENDOR，校驗商品 vendorId 必須等於本人；否則回 403
 * - SUPER_ADMIN / ADMIN 不受限
 * 回傳判別聯集，呼叫端可依 ok 決定是否提前回傳。
 */
async function loadOwnedProduct(
  id: string,
  user: AdminSessionUser
): Promise<
  | { ok: true; product: { id: string; vendorId: string | null } }
  | { ok: false; status: 403 | 404; code: string; message: string }
> {
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, vendorId: true },
  });
  if (!product) {
    return { ok: false, status: 404, code: 'PRODUCT_NOT_FOUND', message: '找不到此商品' };
  }
  if (user.role === 'VENDOR' && product.vendorId !== user.id) {
    return { ok: false, status: 403, code: 'FORBIDDEN', message: '您沒有權限操作此商品' };
  }
  return { ok: true, product };
}

/**
 * GET /api/products/[id]
 *
 * 取得單一商品完整資料（供編輯頁預填）
 * 多供應商：VENDOR 僅能讀取自己的商品
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireProductModuleSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    const owned = await loadOwnedProduct(params.id, guard.user);
    if (!owned.ok) return jsonError(owned.status, owned.code, owned.message);

    const product = await prisma.product.findFirst({
      where: { id: params.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        compareAtPrice: true,
        sku: true,
        stock: true,
        coverImage: true,
        images: true,
        categoryId: true,
        vendorId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!product) {
      return jsonError(404, 'PRODUCT_NOT_FOUND', '找不到此商品');
    }

    return jsonOk({
      ...product,
      price: toNumber(product.price),
      compareAtPrice: product.compareAtPrice === null ? null : toNumber(product.compareAtPrice),
      stock: toInt(product.stock),
    });
  } catch (err) {
    console.error('[GET /api/products/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入商品資料，請稍後再試');
  }
}

/**
 * PUT /api/products/[id]
 *
 * 完整表單更新（與行內快速編輯 PATCH 分開處理）
 * 多供應商：
 *  - VENDOR 僅能更新自己的商品，且「忽略」傳入的 vendorId（不可轉移商品給他人）
 *  - SUPER_ADMIN / ADMIN 可變更 vendorId，並校驗目標帳號確為 VENDOR
 * 防禦：server-side 以 UpdateProductSchema 驗證；金額/庫存正規化；
 *       slug/sku 唯一衝突（排除自己）回 409；categoryId 不存在回 400
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireProductModuleSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const owned = await loadOwnedProduct(params.id, guard.user);
    if (!owned.ok) return jsonError(owned.status, owned.code, owned.message);
    const existingProduct = owned.product;

    const body = (raw ?? {}) as Record<string, unknown>;
    const normalized: Record<string, unknown> = { ...body };
    if (body.price !== undefined && body.price !== null && body.price !== '') {
      normalized.price = round2(body.price);
    }
    if (body.compareAtPrice === null || body.compareAtPrice === '' || body.compareAtPrice === undefined) {
      normalized.compareAtPrice = body.compareAtPrice === undefined ? undefined : null;
    } else {
      normalized.compareAtPrice = round2(body.compareAtPrice);
    }
    if (body.stock !== undefined && body.stock !== null && body.stock !== '') {
      normalized.stock = Math.max(0, toInt(body.stock));
    }

    const parsed = UpdateProductSchema.safeParse(normalized);
    if (!parsed.success) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        '欄位驗證失敗，請檢查輸入內容',
        parsed.error.flatten().fieldErrors
      );
    }

    const data = parsed.data;

    if (data.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId },
        select: { id: true },
      });
      if (!category) {
        return jsonError(400, 'INVALID_CATEGORY', '指定的分類不存在');
      }
    }

    // 唯一性預檢（排除自己）
    if (data.slug || data.sku) {
      const orConds: { slug?: string; sku?: string }[] = [];
      if (data.slug) orConds.push({ slug: data.slug });
      if (data.sku) orConds.push({ sku: data.sku });
      const conflict = await prisma.product.findFirst({
        where: { AND: [{ id: { not: params.id } }, { OR: orConds }] },
        select: { slug: true, sku: true },
      });
      if (conflict) {
        const field = data.slug && conflict.slug === data.slug ? 'slug' : 'sku';
        return jsonError(409, 'DUPLICATE_FIELD', `此 ${field} 已被使用，請改用其他值`, { field });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.compareAtPrice !== undefined) updateData.compareAtPrice = data.compareAtPrice;
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.stock !== undefined) updateData.stock = data.stock;
    if (data.coverImage !== undefined) updateData.coverImage = data.coverImage;
    if (data.images !== undefined) updateData.images = data.images;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.status !== undefined) updateData.status = data.status;

    // 多供應商：vendorId 變更權限控制
    if (guard.user.role !== 'VENDOR' && data.vendorId !== undefined) {
      // 管理員可指派/清空 vendorId；指派時需校驗角色
      if (data.vendorId === null) {
        updateData.vendorId = null;
      } else {
        const vendor = await prisma.user.findFirst({
          where: { id: data.vendorId, role: 'VENDOR', deletedAt: null },
          select: { id: true },
        });
        if (!vendor) {
          return jsonError(400, 'INVALID_VENDOR', '指定的供應商不存在或角色不正確');
        }
        updateData.vendorId = data.vendorId;
      }
    }
    // VENDOR：即使傳入 vendorId 也一律忽略（不寫入 updateData）

    if (Object.keys(updateData).length === 0) {
      return jsonError(400, 'NO_UPDATABLE_FIELD', '沒有需要更新的欄位');
    }

    const updated = await prisma.product.update({
      where: { id: existingProduct.id },
      data: updateData as never,
      select: { id: true, name: true, slug: true, sku: true, status: true, updatedAt: true },
    });

    return jsonOk(updated);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return jsonError(409, 'DUPLICATE_FIELD', 'slug 或 sku 已被使用，請改用其他值');
    }
    console.error('[PUT /api/products/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新商品失敗，請稍後再試');
  }
}

/**
 * DELETE /api/products/[id]
 *
 * 軟刪除（設定 deletedAt），與全站軟刪除慣例一致，保留歷史訂單關聯
 * 多供應商：VENDOR 僅能刪除自己的商品
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireProductModuleSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    const owned = await loadOwnedProduct(params.id, guard.user);
    if (!owned.ok) return jsonError(owned.status, owned.code, owned.message);

    await prisma.product.update({
      where: { id: owned.product.id },
      data: { deletedAt: new Date() },
    });

    return jsonOk({ id: owned.product.id, deleted: true });
  } catch (err) {
    console.error('[DELETE /api/products/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '刪除商品失敗，請稍後再試');
  }
}

/**
 * PATCH /api/products/[id]
 *
 * 行內快速編輯：支援部分更新 stock（庫存數量）與 status（上下架狀態）
 * 安全：requireProductModuleSession（SUPER_ADMIN / ADMIN / VENDOR）
 * 多供應商：VENDOR 僅能快速編輯自己的商品
 * 防禦：
 *  - 僅允許白名單欄位（stock / status），避免大量賦值漏洞 (mass assignment)
 *  - stock 以 toInt 安全轉換，並夾擠為非負整數
 *  - status 僅接受合法 enum，否則回 400
 *  - 確認商品存在且未軟刪除
 *  - 至少需提供一個可更新欄位
 */

const VALID_STATUS = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireProductModuleSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const payload = (body ?? {}) as { stock?: unknown; status?: unknown };
    const data: { stock?: number; status?: string } = {};

    // 庫存：僅在有提供時更新，夾擠為非負整數
    if (payload.stock !== undefined && payload.stock !== null && payload.stock !== '') {
      const nextStock = Math.max(0, toInt(payload.stock));
      data.stock = nextStock;
    }

    // 狀態：僅在有提供時更新，必須為合法 enum
    if (payload.status !== undefined && payload.status !== null && payload.status !== '') {
      const nextStatus = String(payload.status);
      if (!VALID_STATUS.includes(nextStatus)) {
        return jsonError(400, 'INVALID_STATUS', `不支援的商品狀態：${nextStatus}`);
      }
      data.status = nextStatus;
    }

    if (Object.keys(data).length === 0) {
      return jsonError(400, 'NO_UPDATABLE_FIELD', '請提供 stock 或 status 至少一個欄位');
    }

    const owned = await loadOwnedProduct(params.id, guard.user);
    if (!owned.ok) return jsonError(owned.status, owned.code, owned.message);

    const updated = await prisma.product.update({
      where: { id: owned.product.id },
      data: data as never,
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        status: true,
        updatedAt: true,
      },
    });

    return jsonOk({
      id: updated.id,
      name: updated.name,
      price: toNumber(updated.price),
      stock: toInt(updated.stock),
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error('[PATCH /api/products/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新商品失敗，請稍後再試');
  }
}
