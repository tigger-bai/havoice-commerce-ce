import { api } from '@/lib/api-client';
import { ProductCard } from '@/components/shop/ProductCard';
import { getActiveLayoutSections } from '@/services/layout.service';
import { SectionRenderer } from '@/components/home/SectionRenderer';
import type { Product, PaginatedData } from '@/types';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '商城 — 快樂之音',
  description: '探索快樂之音精選的優質商品，為你的生活增添美好。',
};

interface ShopPageProps {
  searchParams: { page?: string; category?: string };
}

/**
 * 商城列表頁面 - Server Component（動態 CMS 樓層 + 商品網格）
 *
 * 設計決策：
 * - 動態行銷版位（CMS 樓層）主戰場移至此頁：呼叫公開端點 GET /api/layouts
 *   （API 已依 sortOrder 排序），以 map 逐個交給 SectionRenderer 工廠，
 *   依 section.type 派送至對應樓層（HERO_BANNER / THEME_REC / SALES_RANKING /
 *   BRAND_CAROUSEL / CATEGORY_FLOOR，並相容 legacy CAROUSEL/GRID/BANNER）
 * - CMS 樓層放置於頁面最上方；其下為既有的精選商品網格與分頁
 * - 商品分頁仍以 searchParams 實現 Server-Side 分頁
 * - 所有資料各自 catch fallback，任一來源失敗不影響整頁（CMS 失敗回傳空陣列）
 * - 採 ISR，小編於後台更新後短時間內前台即可反映
 */
export default async function ShopPage({ searchParams }: ShopPageProps) {
  const page = parseInt(searchParams.page || '1', 10);

  const [layoutSections, productsData] = await Promise.all([
    getActiveLayoutSections('/shop'),
    api
      .get<PaginatedData<Product>>('/api/products', {
        params: {
          page,
          limit: 12,
          status: 'PUBLISHED',
          categoryId: searchParams.category,
        },
        revalidate: 30,
      })
      .catch(() => ({
        data: [] as Product[],
        meta: { total: 0, page: 1, limit: 12, totalPages: 0 },
      })),
  ]);

  return (
    <>
      {/* ═══ 動態行銷版位（由後台 Layout CMS 控制，依 sortOrder 排序） ═══ */}
      {layoutSections.length > 0 && (
        <div className="space-y-2 bg-gray-50 pb-2">
          {layoutSections.map((section) => (
            <SectionRenderer key={section.id} section={section} />
          ))}
        </div>
      )}

      {/* ═══ 精選商品網格 ═══ */}
      <div className="container-page py-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">精選商城</h1>
          <p className="mt-2 text-gray-500">為你精心挑選的品質好物，讓生活更有質感</p>
        </div>

        {productsData.data.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-gray-500">目前尚無上架商品，敬請期待！</p>
          </div>
        ) : (
          <>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {productsData.data.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {/* 分頁導航 */}
            {productsData.meta.totalPages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                {page > 1 && (
                  <a
                    href={`/shop?page=${page - 1}`}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    上一頁
                  </a>
                )}
                <span className="px-4 py-2 text-sm text-gray-500">
                  第 {page} / {productsData.meta.totalPages} 頁
                </span>
                {page < productsData.meta.totalPages && (
                  <a
                    href={`/shop?page=${page + 1}`}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    下一頁
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
