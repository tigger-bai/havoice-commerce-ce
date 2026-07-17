export interface Category {
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
  status: string;
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: Author;
  category: Category;
  recommendedProducts?: RecommendedProduct[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: string;
  compareAtPrice: string | null;
  sku: string;
  stock: number;
  coverImage: string;
  images: string | null;
  categoryId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  category: Category;
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

/** 行銷版位類型（與後台 / shared 對齐） */
export type LayoutSectionType =
  // 新世代大型電商類型
  | 'HERO_BANNER'
  | 'THEME_REC'
  | 'SALES_RANKING'
  | 'BRAND_CAROUSEL'
  | 'CATEGORY_FLOOR'
  // Page Builder 新增積木
  | 'ICON_NAVIGATION'
  | 'IMAGE_WITH_TEXT'
  | 'PROMO_BANNER'
  // legacy
  | 'CAROUSEL'
  | 'GRID'
  | 'BANNER';

export interface LayoutItem {
  id: string;
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
}

export interface LayoutSection {
  id: string;
  title: string;
  type: LayoutSectionType | string;
  pageRoute: string;
  sortOrder: number;
  items: LayoutItem[];
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

export interface CartItem {
  productId: string;
  name: string;
  slug: string;
  price: number;
  coverImage: string;
  quantity: number;
}
