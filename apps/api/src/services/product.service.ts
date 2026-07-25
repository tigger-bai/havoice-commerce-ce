import { prisma } from "@havoice/database";
import type {
  CreateProductDTO,
  UpdateProductDTO,
  ProductQueryDTO,
  PaginatedResponse,
} from "@havoice/shared";
import { NotFoundError, ConflictError } from "../utils/app-error";

function toPublicProduct<T extends Record<string, unknown>>(product: T) {
  const {
    cost: _cost,
    safetyStock: _safetyStock,
    reorderPoint: _reorderPoint,
    barcode: _barcode,
    ...publicProduct
  } = product;
  return publicProduct;
}

function normalizeImages<
  T extends { imageUrl: string; isCover?: boolean; sortOrder?: number },
>(images: T[]) {
  const requestedCover = images.findIndex((image) => image.isCover);
  const coverIndex = requestedCover >= 0 ? requestedCover : 0;
  return images.map((image, index) => ({
    ...image,
    sortOrder: index,
    isCover: index === coverIndex,
  }));
}

/**
 * Product Service
 *
 * 職責：封裝所有商品相關的資料庫操作邏輯
 * 設計原則：
 * - 金額欄位由 Prisma 自動處理 Decimal 精度
 * - 所有查詢自動排除軟刪除資料
 * - SKU 與 slug 的唯一性由 Service 層主動檢查，提供友善錯誤訊息
 */
export class ProductService {
  /**
   * 取得商品列表（含分頁與篩選）
   */
  async findAll(query: ProductQueryDTO): Promise<PaginatedResponse<unknown>> {
    const { page, limit, categoryId } = query;
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      status: "PUBLISHED" as const,
      ...(categoryId && { categoryId }),
    };

    const [total, products] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          tags: {
            include: {
              tag: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      }),
    ]);

    const formattedProducts = products.map((product) =>
      toPublicProduct({
        ...product,
        tags: product.tags.map((t) => t.tag),
      }),
    );

    return {
      data: formattedProducts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 取得單一商品
   */
  async findById(id: string) {
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null, status: "PUBLISHED" },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        tags: {
          include: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
        productImages: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            imageUrl: true,
            altText: true,
            sortOrder: true,
            isCover: true,
          },
        },
        detailBlocks: {
          where: { isEnabled: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            imageUrl: true,
            imageAlt: true,
            sortOrder: true,
            isEnabled: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundError("商品", id);
    }

    return toPublicProduct({
      ...product,
      productImages: product.productImages.length
        ? product.productImages
        : product.coverImage
          ? [
              {
                id: "legacy-cover",
                imageUrl: product.coverImage,
                altText: product.name,
                sortOrder: 0,
                isCover: true,
              },
            ]
          : [],
      tags: product.tags.map((t) => t.tag),
    });
  }

  /**
   * 透過 slug 取得商品（前台用）
   */
  async findBySlug(slug: string) {
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null, status: "PUBLISHED" },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        tags: {
          include: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
        productImages: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            imageUrl: true,
            altText: true,
            sortOrder: true,
            isCover: true,
          },
        },
        detailBlocks: {
          where: { isEnabled: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            imageUrl: true,
            imageAlt: true,
            sortOrder: true,
            isEnabled: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundError("商品", slug);
    }

    return toPublicProduct({
      ...product,
      productImages: product.productImages.length
        ? product.productImages
        : product.coverImage
          ? [
              {
                id: "legacy-cover",
                imageUrl: product.coverImage,
                altText: product.name,
                sortOrder: 0,
                isCover: true,
              },
            ]
          : [],
      tags: product.tags.map((t) => t.tag),
    });
  }

  /**
   * 建立商品
   */
  async create(data: CreateProductDTO) {
    const { tagIds, productImages, detailBlocks, ...productData } = data;
    const normalizedImages = normalizeImages(productImages ?? []);
    const coverImage =
      normalizedImages.find((image) => image.isCover)?.imageUrl ??
      productData.coverImage;

    // 檢查 slug 唯一性
    const slugExists = await prisma.product.findUnique({
      where: { slug: productData.slug },
    });
    if (slugExists) {
      throw new ConflictError(`Slug "${productData.slug}" 已被使用`);
    }

    // 檢查 SKU 唯一性
    const skuExists = await prisma.product.findUnique({
      where: { sku: productData.sku },
    });
    if (skuExists) {
      throw new ConflictError(`SKU "${productData.sku}" 已被使用`);
    }
    if (productData.barcode) {
      const barcodeExists = await prisma.product.findUnique({
        where: { barcode: productData.barcode },
      });
      if (barcodeExists)
        throw new ConflictError(`商品條碼 "${productData.barcode}" 已被使用`);
    }

    const product = await prisma.product.create({
      data: {
        ...productData,
        coverImage,
        tags: {
          create: tagIds.map((tagId) => ({ tagId })),
        },
        ...(normalizedImages.length && {
          productImages: {
            create: normalizedImages,
          },
        }),
        ...(detailBlocks?.length && {
          detailBlocks: {
            create: detailBlocks.map((block, index) => ({
              ...block,
              sortOrder: index,
            })),
          },
        }),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        tags: {
          include: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return toPublicProduct({
      ...product,
      tags: product.tags.map((t) => t.tag),
    });
  }

  /**
   * 更新商品
   */
  async update(id: string, data: UpdateProductDTO) {
    const existing = await prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError("商品", id);
    }

    // 若更新 slug，檢查唯一性
    if (data.slug && data.slug !== existing.slug) {
      const slugConflict = await prisma.product.findUnique({
        where: { slug: data.slug },
      });
      if (slugConflict) {
        throw new ConflictError(`Slug "${data.slug}" 已被使用`);
      }
    }

    // 若更新 SKU，檢查唯一性
    if (data.sku && data.sku !== existing.sku) {
      const skuConflict = await prisma.product.findUnique({
        where: { sku: data.sku },
      });
      if (skuConflict) {
        throw new ConflictError(`SKU "${data.sku}" 已被使用`);
      }
    }
    if (data.barcode && data.barcode !== existing.barcode) {
      const barcodeConflict = await prisma.product.findUnique({
        where: { barcode: data.barcode },
      });
      if (barcodeConflict)
        throw new ConflictError(`商品條碼 "${data.barcode}" 已被使用`);
    }

    const { tagIds, productImages, detailBlocks, ...productData } = data;
    const normalizedImages =
      productImages === undefined ? undefined : normalizeImages(productImages);
    const coverImage = normalizedImages?.find(
      (image) => image.isCover,
    )?.imageUrl;

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...productData,
        ...(coverImage && { coverImage }),
        ...(tagIds !== undefined && {
          tags: {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tagId })),
          },
        }),
        ...(normalizedImages !== undefined && {
          productImages: {
            deleteMany: {},
            create: normalizedImages,
          },
        }),
        ...(detailBlocks !== undefined && {
          detailBlocks: {
            deleteMany: {},
            create: detailBlocks.map((block, index) => ({
              ...block,
              sortOrder: index,
            })),
          },
        }),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        tags: {
          include: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return toPublicProduct({
      ...product,
      tags: product.tags.map((t) => t.tag),
    });
  }

  /**
   * 軟刪除商品
   */
  async softDelete(id: string) {
    const existing = await prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError("商品", id);
    }

    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

export const productService = new ProductService();
