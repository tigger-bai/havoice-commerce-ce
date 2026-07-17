import { prisma } from '@havoice/database';
import type {
  CreateProductDTO,
  UpdateProductDTO,
  ProductQueryDTO,
  PaginatedResponse,
} from '@havoice/shared';
import { NotFoundError, ConflictError } from '../utils/app-error';

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
    const { page, limit, categoryId, status } = query;
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      ...(categoryId && { categoryId }),
      ...(status && { status }),
    };

    const [total, products] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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

    const formattedProducts = products.map((product) => ({
      ...product,
      tags: product.tags.map((t) => t.tag),
    }));

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
      where: { id, deletedAt: null },
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
    });

    if (!product) {
      throw new NotFoundError('商品', id);
    }

    return {
      ...product,
      tags: product.tags.map((t) => t.tag),
    };
  }

  /**
   * 透過 slug 取得商品（前台用）
   */
  async findBySlug(slug: string) {
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null, status: 'PUBLISHED' },
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
    });

    if (!product) {
      throw new NotFoundError('商品', slug);
    }

    return {
      ...product,
      tags: product.tags.map((t) => t.tag),
    };
  }

  /**
   * 建立商品
   */
  async create(data: CreateProductDTO) {
    const { tagIds, ...productData } = data;

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

    const product = await prisma.product.create({
      data: {
        ...productData,
        tags: {
          create: tagIds.map((tagId) => ({ tagId })),
        },
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

    return {
      ...product,
      tags: product.tags.map((t) => t.tag),
    };
  }

  /**
   * 更新商品
   */
  async update(id: string, data: UpdateProductDTO) {
    const existing = await prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('商品', id);
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

    const { tagIds, ...productData } = data;

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...productData,
        ...(tagIds !== undefined && {
          tags: {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tagId })),
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

    return {
      ...product,
      tags: product.tags.map((t) => t.tag),
    };
  }

  /**
   * 軟刪除商品
   */
  async softDelete(id: string) {
    const existing = await prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('商品', id);
    }

    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

export const productService = new ProductService();
