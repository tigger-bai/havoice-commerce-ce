import { prisma } from '@havoice/database';
import type {
  CreateArticleDTO,
  UpdateArticleDTO,
  ArticleQueryDTO,
  PaginatedResponse,
} from '@havoice/shared';
import { NotFoundError, ConflictError } from '../utils/app-error';

/**
 * Article Service
 *
 * 職責：封裝所有文章相關的資料庫操作邏輯
 * 設計原則：
 * - Service 層不處理 HTTP 相關邏輯（req/res）
 * - 所有查詢自動排除軟刪除資料 (deletedAt IS NULL)
 * - 回傳純資料物件，由 Controller 決定回應格式
 */
export class ArticleService {
  /**
   * 取得文章列表（含分頁與篩選）
   */
  async findAll(query: ArticleQueryDTO): Promise<PaginatedResponse<unknown>> {
    const { page, limit, categoryId, status } = query;
    const skip = (page - 1) * limit;

    // 建構動態 where 條件
    const where = {
      deletedAt: null, // 排除軟刪除
      ...(categoryId && { categoryId }),
      ...(status && { status }),
    };

    // 使用 Prisma 的 $transaction 確保 count 與 findMany 的一致性
    const [total, articles] = await prisma.$transaction([
      prisma.article.count({ where }),
      prisma.article.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: { id: true, name: true, email: true },
          },
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

    // 扁平化 tags 結構，移除中間表的冗餘層級
    const formattedArticles = articles.map((article) => ({
      ...article,
      tags: article.tags.map((t) => t.tag),
    }));

    return {
      data: formattedArticles,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 取得單一文章（含推薦商品，依 sortOrder 升序排列）
   */
  async findById(id: string) {
    const article = await prisma.article.findFirst({
      where: { id, deletedAt: null },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
        category: {
          select: { id: true, name: true, slug: true },
        },
        tags: {
          include: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
        recommendedProducts: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                price: true,
                compareAtPrice: true,
                coverImage: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!article) {
      throw new NotFoundError('文章', id);
    }

    // 扁平化回應結構
    return {
      ...article,
      tags: article.tags.map((t) => t.tag),
      recommendedProducts: article.recommendedProducts.map((rec) => ({
        ...rec.product,
        sortOrder: rec.sortOrder,
      })),
    };
  }

  /**
   * 透過 slug 取得文章（前台用）
   */
  async findBySlug(slug: string) {
    const article = await prisma.article.findFirst({
      where: { slug, deletedAt: null, status: 'PUBLISHED' },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
        category: {
          select: { id: true, name: true, slug: true },
        },
        tags: {
          include: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
        recommendedProducts: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                price: true,
                compareAtPrice: true,
                coverImage: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!article) {
      throw new NotFoundError('文章', slug);
    }

    // 增加瀏覽次數（非同步，不阻塞回應）
    prisma.article
      .update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch(console.error);

    return {
      ...article,
      tags: article.tags.map((t) => t.tag),
      recommendedProducts: article.recommendedProducts.map((rec) => ({
        ...rec.product,
        sortOrder: rec.sortOrder,
      })),
    };
  }

  /**
   * 建立文章
   */
  async create(data: CreateArticleDTO) {
    const { tagIds, ...articleData } = data;

    // 檢查 slug 唯一性
    const existing = await prisma.article.findUnique({
      where: { slug: articleData.slug },
    });
    if (existing) {
      throw new ConflictError(`Slug "${articleData.slug}" 已被使用`);
    }

    const article = await prisma.article.create({
      data: {
        ...articleData,
        tags: {
          create: tagIds.map((tagId) => ({ tagId })),
        },
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true, slug: true } },
        tags: {
          include: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return {
      ...article,
      tags: article.tags.map((t) => t.tag),
    };
  }

  /**
   * 更新文章
   */
  async update(id: string, data: UpdateArticleDTO) {
    // 確認文章存在且未被軟刪除
    const existing = await prisma.article.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('文章', id);
    }

    // 若更新 slug，檢查唯一性
    if (data.slug && data.slug !== existing.slug) {
      const slugConflict = await prisma.article.findUnique({
        where: { slug: data.slug },
      });
      if (slugConflict) {
        throw new ConflictError(`Slug "${data.slug}" 已被使用`);
      }
    }

    const { tagIds, ...articleData } = data;

    const article = await prisma.article.update({
      where: { id },
      data: {
        ...articleData,
        // 若有提供 tagIds，則全量替換標籤關聯
        ...(tagIds !== undefined && {
          tags: {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tagId })),
          },
        }),
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true, slug: true } },
        tags: {
          include: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return {
      ...article,
      tags: article.tags.map((t) => t.tag),
    };
  }

  /**
   * 軟刪除文章
   */
  async softDelete(id: string) {
    const existing = await prisma.article.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('文章', id);
    }

    await prisma.article.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

export const articleService = new ArticleService();
