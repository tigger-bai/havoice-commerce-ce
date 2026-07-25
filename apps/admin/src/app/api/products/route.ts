import { NextRequest } from "next/server";

import { prisma, type Prisma } from "@havoice/database";
import { CreateProductSchema } from "@havoice/shared";

import { requireProductModuleSession } from "@/lib/auth/api-guard";
import { jsonOk, jsonError, toNumber, toInt } from "@/lib/api-helpers";
import { getProductStockStatus } from "@/lib/product-inventory-planning";
import {
  getCoverImageUrl,
  normalizeProductDetailBlocks,
  normalizeProductImages,
} from "@/lib/product-content";
import { createAdminAuditLog } from "@/lib/admin-audit-log";

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

const VALID_STATUS = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const VALID_STOCK_STATUS = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"];

function canManagePlanning(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

function buildStockStatusWhere(
  stockStatus: string,
): Prisma.ProductWhereInput | null {
  if (stockStatus === "OUT_OF_STOCK") return { stock: { lte: 0 } };
  if (stockStatus === "LOW_STOCK") {
    return {
      AND: [
        { stock: { gt: 0 } },
        {
          OR: [
            {
              reorderPoint: { not: null },
              stock: { lte: prisma.product.fields.reorderPoint },
            },
            {
              reorderPoint: null,
              safetyStock: { gt: 0 },
              stock: { lte: prisma.product.fields.safetyStock },
            },
          ],
        },
      ],
    };
  }
  if (stockStatus === "IN_STOCK") {
    return {
      AND: [
        { stock: { gt: 0 } },
        {
          OR: [
            {
              reorderPoint: { not: null },
              stock: { gt: prisma.product.fields.reorderPoint },
            },
            {
              reorderPoint: null,
              OR: [
                { safetyStock: { lte: 0 } },
                { stock: { gt: prisma.product.fields.safetyStock } },
              ],
            },
          ],
        },
      ],
    };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const guard = await requireProductModuleSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, toInt(searchParams.get("page")) || 1);
    const rawLimit = toInt(searchParams.get("limit")) || 10;
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const status = searchParams.get("status") || "";
    const stockStatus = searchParams.get("stockStatus") || "";
    const keyword = (searchParams.get("keyword") || "").trim();
    const missingCost = searchParams.get("missingCost") === "true";

    const where: Prisma.ProductWhereInput = { deletedAt: null };
    const filters: Prisma.ProductWhereInput[] = [];

    // 多供應商租戶隔離：VENDOR 僅能查詢自己的商品
    if (guard.user.role === "VENDOR") {
      where.vendorId = guard.user.id;
    }

    if (status && VALID_STATUS.includes(status)) {
      where.status = status as Prisma.ProductWhereInput["status"];
    }
    if (stockStatus && VALID_STOCK_STATUS.includes(stockStatus)) {
      const stockFilter = buildStockStatusWhere(stockStatus);
      if (stockFilter) filters.push(stockFilter);
    }
    if (canManagePlanning(guard.user.role) && missingCost)
      filters.push({ cost: null });

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { sku: { contains: keyword } },
        { barcode: { contains: keyword } },
        { slug: { contains: keyword } },
      ];
    }
    if (filters.length) where.AND = filters;

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          barcode: true,
          price: true,
          compareAtPrice: true,
          cost: true,
          stock: true,
          safetyStock: true,
          reorderPoint: true,
          brand: true,
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
        barcode: p.barcode,
        price: toNumber(p.price),
        compareAtPrice:
          p.compareAtPrice === null ? null : toNumber(p.compareAtPrice),
        stock: toInt(p.stock),
        stockStatus: getProductStockStatus({
          stock: toInt(p.stock),
          safetyStock: p.safetyStock,
          reorderPoint: p.reorderPoint,
        }),
        brand: p.brand,
        ...(canManagePlanning(guard.user.role)
          ? {
              cost: p.cost === null ? null : toNumber(p.cost),
              safetyStock: toInt(p.safetyStock),
              reorderPoint:
                p.reorderPoint === null ? null : toInt(p.reorderPoint),
            }
          : {}),
        status: p.status,
        coverImage: p.coverImage,
        categoryName: p.category?.name ?? "未分類",
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
    console.error("[GET /api/products] error:", err);
    return jsonError(500, "INTERNAL_ERROR", "無法載入商品列表，請稍後再試");
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
      return jsonError(400, "INVALID_JSON", "請求格式錯誤");
    }

    const body = (raw ?? {}) as Record<string, unknown>;

    // 數字欄位先正規化為安全型態，再交由 Zod 驗證
    const planningAllowed = canManagePlanning(guard.user.role);
    const normalized: Record<string, unknown> = {
      ...body,
      price:
        body.price === undefined || body.price === null || body.price === ""
          ? undefined
          : round2(body.price),
      compareAtPrice:
        body.compareAtPrice === undefined ||
        body.compareAtPrice === null ||
        body.compareAtPrice === ""
          ? null
          : round2(body.compareAtPrice),
      stock:
        body.stock === undefined || body.stock === null || body.stock === ""
          ? 0
          : Math.max(0, toInt(body.stock)),
      cost:
        body.cost === undefined || body.cost === null || body.cost === ""
          ? null
          : round2(body.cost),
      safetyStock:
        body.safetyStock === undefined ||
        body.safetyStock === null ||
        body.safetyStock === ""
          ? 0
          : Math.max(0, toInt(body.safetyStock)),
      reorderPoint:
        body.reorderPoint === undefined ||
        body.reorderPoint === null ||
        body.reorderPoint === ""
          ? null
          : Math.max(0, toInt(body.reorderPoint)),
    };
    if (!planningAllowed) {
      delete normalized.cost;
      delete normalized.safetyStock;
      delete normalized.reorderPoint;
      delete normalized.brand;
    }

    const parsed = CreateProductSchema.safeParse(normalized);
    if (!parsed.success) {
      return jsonError(
        400,
        "VALIDATION_ERROR",
        "欄位驗證失敗，請檢查輸入內容",
        parsed.error.flatten().fieldErrors,
      );
    }

    const data = parsed.data;

    // 驗證分類存在（categoryId 為必填外鍵，onDelete: Restrict）
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    });
    if (!category) {
      return jsonError(400, "INVALID_CATEGORY", "指定的分類不存在");
    }

    // 多供應商：決定最終 vendorId
    let finalVendorId: string | null;
    if (guard.user.role === "VENDOR") {
      // VENDOR：忽略傳入值，強制綁定本人
      finalVendorId = guard.user.id;
    } else {
      // SUPER_ADMIN / ADMIN：可指派，但須校驗目標帳號確為 VENDOR
      finalVendorId = data.vendorId ?? null;
      if (finalVendorId) {
        const vendor = await prisma.user.findFirst({
          where: { id: finalVendorId, role: "VENDOR", deletedAt: null },
          select: { id: true },
        });
        if (!vendor) {
          return jsonError(
            400,
            "INVALID_VENDOR",
            "指定的供應商不存在或角色不正確",
          );
        }
      }
    }

    // 唯一性預檢（slug / sku / barcode），提供友善訊息
    const uniqueConditions: Prisma.ProductWhereInput[] = [
      { slug: data.slug },
      { sku: data.sku },
    ];
    if (data.barcode) uniqueConditions.push({ barcode: data.barcode });
    const existing = await prisma.product.findFirst({
      where: { OR: uniqueConditions },
      select: { name: true, slug: true, sku: true, barcode: true },
    });
    if (existing) {
      if (data.barcode && existing.barcode === data.barcode) {
        return jsonError(
          409,
          "DUPLICATE_FIELD",
          "此商品條碼已被使用，請改用其他條碼",
          { field: "barcode" },
        );
      }
      const field = existing.slug === data.slug ? "slug" : "sku";
      return jsonError(
        409,
        "DUPLICATE_FIELD",
        `此 ${field} 已被使用，請改用其他值`,
        { field },
      );
    }

    const productImages = normalizeProductImages(
      data.productImages,
      data.coverImage,
    );
    const detailBlocks = normalizeProductDetailBlocks(data.detailBlocks);
    const coverImage = getCoverImageUrl(productImages, data.coverImage);

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          price: data.price,
          compareAtPrice: data.compareAtPrice ?? null,
          cost: planningAllowed ? (data.cost ?? null) : null,
          sku: data.sku,
          barcode: data.barcode ?? null,
          stock: data.stock,
          safetyStock: planningAllowed ? data.safetyStock : 0,
          reorderPoint: planningAllowed ? (data.reorderPoint ?? null) : null,
          brand: planningAllowed ? (data.brand ?? null) : null,
          coverImage,
          images: data.images ?? null,
          categoryId: data.categoryId,
          vendorId: finalVendorId,
          status: data.status,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          barcode: true,
          status: true,
          vendorId: true,
        },
      });
      if (productImages.length) {
        await tx.productImage.createMany({
          data: productImages.map((image) => ({
            ...image,
            productId: product.id,
          })),
        });
      }
      if (detailBlocks.length) {
        await tx.productDetailBlock.createMany({
          data: detailBlocks.map((block) => ({
            ...block,
            productId: product.id,
          })),
        });
      }
      await createAdminAuditLog({
        client: tx,
        req,
        actor: guard.user,
        action: "PRODUCT_CREATE",
        resourceType: "PRODUCT",
        resourceId: product.id,
        description: `建立商品：${product.name}`,
        metadata: { sku: product.sku, barcode: product.barcode },
      });
      return product;
    });

    return jsonOk(created, { status: 201 });
  } catch (err) {
    // Prisma 唯一鍵衝突（保險：競態下仍可能觸發）
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return jsonError(
        409,
        "DUPLICATE_FIELD",
        "slug、sku 或商品條碼已被使用，請改用其他值",
      );
    }
    if (
      err instanceof Error &&
      (err.message.includes("商品內容") || err.message.includes("區塊"))
    ) {
      return jsonError(400, "INVALID_PRODUCT_CONTENT", err.message);
    }
    console.error("[POST /api/products] error:", err);
    return jsonError(500, "INTERNAL_ERROR", "建立商品失敗，請稍後再試");
  }
}
