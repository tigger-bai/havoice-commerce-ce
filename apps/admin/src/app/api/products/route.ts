import { NextRequest } from 'next/server';

import { prisma, type Prisma } from '@havoice/database';
import { CreateProductSchema } from '@havoice/shared';

import { requireProductModuleSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toNumber, toInt } from '@/lib/api-helpers';

/** 將任意輸入正規化為小數兩位的金額，避免浮點精度造成 Zod multipleOf 誤判 */
function round2(value: unknown): number {
  const n = toNumber(value);
  return Math.round(n * 100) / 100;
}

/**
 * GET /api/products
 *
 * 商品列表（分頁 + 狀態篩選 + 關鍵字搜尋）
 * 安全：requireProductModuleSession（SUPER_ADMIN / ADMIN / VENDOR）
 * 多供應商租戶隔離：
 *  - VENDOR 強制 where.vendorId = 本人 id，僅能看見自己的商品
 *  - SUPER_ADMIN / ADMIN 可見全站商品，並回傳 vendor 來源資訊
 * 防禦：
 *  - 分頁參數安全轉換（page/limit 上下限夾擠）
 *  - 未知 status 一律忽略，避免 Prisma enum 錯誤
 *  - 僅回傳未軟刪除（deletedAt = null）的商品
 *  - 金額一律以 toNumber 序列化，避免前端收到 Decimal 物件
 */

const VALID_STATUS = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export async function GET(req: NextRequest) {
  const guard = await requireProductModuleSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, toInt(searchParams.get('page')) || 1);
    const rawLimit = toInt(searchParams.get('limit')) || 10;
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const status = searchParams.get('status') || '';
    const keyword = (searchParams.get('keyword') || '').trim();

    const where: Prisma.ProductWhereInput = { deletedAt: null };

    // 多供應商租戶隔離：VENDOR 僅能查詢自己的商品
    if (guard.user.role === 'VENDOR') {
      where.vendorId = guard.user.id;
    }

    if (status && VALID_STATUS.includes(status)) {
      where.status = status as Prisma.ProductWhereInput['status'];
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { sku: { contains: keyword } },
        { slug: { contains: keyword } },
      ];
    }

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          price: true,
          compareAtPrice: true,
          stock: true,
          status: true,
          coverImage: true,
          category: { select: { name: true } },
          vendorId: true,
          vendor: { select: { id: true, name: true, email: true } },
          updatedAt: true,
        },
      }),
    ]);

    return jsonOk({
      items: products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        price: toNumber(p.price),
        compareAtPrice: p.compareAtPrice === null ? null : toNumber(p.compareAtPrice),
        stock: toInt(p.stock),
        status: p.status,
        coverImage: p.coverImage,
        categoryName: p.category?.name ?? '未分類',
        vendorId: p.vendorId,
        vendorName: p.vendor?.name ?? p.vendor?.email ?? null,
        updatedAt: p.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error('[GET /api/products] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入商品列表，請稍後再試');
  }
}

/**
 * POST /api/products
 *
 * 新增（上架）商品
 * 安全：requireProductModuleSession（SUPER_ADMIN / ADMIN / VENDOR）
 * 多供應商租戶隔離：
 *  - VENDOR 新增時「忽略」傳入的 vendorId，強制設為本人 id，防止竄改參數建立他人商品
 *  - SUPER_ADMIN / ADMIN 可指派 vendorId，並校驗該帳號確實為 VENDOR 角色
 * 防禦：
 *  - server-side 以 shared 的 CreateProductSchema 進行 Zod 驗證
 *  - 金額/庫存於驗證前正規化為安全數字型態（round2 / toInt）
 *  - slug、sku 唯一衝突回 409；categoryId 不存在回 400
 */
export async function POST(req: NextRequest) {
  const guard = await requireProductModuleSession();
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

    // 數字欄位先正規化為安全型態，再交由 Zod 驗證
    const normalized = {
      ...body,
      price: body.price === undefined || body.price === null || body.price === '' ? undefined : round2(body.price),
      compareAtPrice:
        body.compareAtPrice === undefined || body.compareAtPrice === null || body.compareAtPrice === ''
          ? null
          : round2(body.compareAtPrice),
      stock: body.stock === undefined || body.stock === null || body.stock === '' ? 0 : Math.max(0, toInt(body.stock)),
    };

    const parsed = CreateProductSchema.safeParse(normalized);
    if (!parsed.success) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        '欄位驗證失敗，請檢查輸入內容',
        parsed.error.flatten().fieldErrors
      );
    }

    const data = parsed.data;

    // 驗證分類存在（categoryId 為必填外鍵，onDelete: Restrict）
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    });
    if (!category) {
      return jsonError(400, 'INVALID_CATEGORY', '指定的分類不存在');
    }

    // 多供應商：決定最終 vendorId
    let finalVendorId: string | null;
    if (guard.user.role === 'VENDOR') {
      // VENDOR：忽略傳入值，強制綁定本人
      finalVendorId = guard.user.id;
    } else {
      // SUPER_ADMIN / ADMIN：可指派，但須校驗目標帳號確為 VENDOR
      finalVendorId = data.vendorId ?? null;
      if (finalVendorId) {
        const vendor = await prisma.user.findFirst({
          where: { id: finalVendorId, role: 'VENDOR', deletedAt: null },
          select: { id: true },
        });
        if (!vendor) {
          return jsonError(400, 'INVALID_VENDOR', '指定的供應商不存在或角色不正確');
        }
      }
    }

    // 唯一性預檢（slug / sku），提供友善訊息
    const existing = await prisma.product.findFirst({
      where: { OR: [{ slug: data.slug }, { sku: data.sku }] },
      select: { slug: true, sku: true },
    });
    if (existing) {
      const field = existing.slug === data.slug ? 'slug' : 'sku';
      return jsonError(409, 'DUPLICATE_FIELD', `此 ${field} 已被使用，請改用其他值`, { field });
    }

    const created = await prisma.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        price: data.price,
        compareAtPrice: data.compareAtPrice ?? null,
        sku: data.sku,
        stock: data.stock,
        coverImage: data.coverImage,
        images: data.images ?? null,
        categoryId: data.categoryId,
        vendorId: finalVendorId,
        status: data.status,
      },
      select: { id: true, name: true, slug: true, sku: true, status: true, vendorId: true },
    });

    return jsonOk(created, { status: 201 });
  } catch (err) {
    // Prisma 唯一鍵衝突（保險：競態下仍可能觸發）
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return jsonError(409, 'DUPLICATE_FIELD', 'slug 或 sku 已被使用，請改用其他值');
    }
    console.error('[POST /api/products] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '建立商品失敗，請稍後再試');
  }
}
