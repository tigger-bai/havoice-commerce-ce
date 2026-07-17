/**
 * 前端實體型別定義
 *
 * 這些型別對應後端 API 的回應結構
 * 與 packages/shared 的 DTO 不同，DTO 用於「請求驗證」，
 * 而這些型別用於「回應資料的型別安全消費」
 */

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface Author {
  id: string;
  name: string | null;
  email: string;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  summary: string | null;
  coverImage: string | null;
  authorId: string;
  categoryId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: Author;
  category: Category;
  tags: Tag[];
  recommendedProducts?: RecommendedProduct[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: string; // Decimal 在 JSON 中為字串
  compareAtPrice: string | null;
  sku: string;
  stock: number;
  coverImage: string;
  images: string | null;
  categoryId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  category: Category;
  tags: Tag[];
}

export interface RecommendedProduct {
  id: string;
  name: string;
  slug: string;
  price: string;
  compareAtPrice: string | null;
  coverImage: string;
  status: string;
  sortOrder: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  data: T[];
  meta: PaginationMeta;
}
