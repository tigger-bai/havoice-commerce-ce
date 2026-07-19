'use client';

import { itemAlt } from './item-utils';

import type { LayoutItem } from '@/types';
import { MaybeLink, SafeImage } from './shared';

interface CategoryFloorProps {
  title: string;
  items: LayoutItem[];
}

/**
 * CATEGORY_FLOOR — 經典電商樓層（參考附圖：左側分類選單 + 右側橫幅 + 多格商品卡）
 *
 * 切版重點：
 * - 樓層頂部為樓層標題列（如「生活家電」）
 * - 左側為垂直分類選單（深色 active 項），選單文字取自前數個 item 的 title
 * - 右側上方為一張寬幅情境橫幅（取第一個 item），下方為商品卡網格
 * - 桌機左右並排、手機上下堆疊；SafeImage 破圖 fallback、MaybeLink 包裹 linkUrl
 */
export function CategoryFloor({ title, items }: CategoryFloorProps) {
  if (!items || items.length === 0) return null;

  const [banner, ...rest] = items;
  const products = rest.length > 0 ? rest : items;
  // 左側選單文字（取商品標題前幾項，去重；不足則補通用分類）
  const menu = Array.from(
    new Set(products.map((p) => p.title).filter(Boolean) as string[])
  ).slice(0, 8);

  return (
    <section className="py-8 sm:py-10">
      <div className="container-page">
        {/* 樓層標題 */}
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{title || '精選樓層'}</h2>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* 左側分類選單 */}
            <div className="border-b border-gray-100 lg:col-span-2 lg:border-b-0 lg:border-r">
              <ul className="flex gap-2 overflow-x-auto p-2 lg:flex-col lg:gap-0 lg:overflow-visible lg:p-0">
                {menu.length > 0 ? (
                  menu.map((label, idx) => (
                    <li key={label} className="shrink-0 lg:shrink">
                      <span
                        className={
                          idx === 0
                            ? 'block rounded-md bg-brand-50 px-3 py-2 text-center text-sm font-semibold text-brand-700 lg:rounded-none lg:border-l-2 lg:border-brand-500 lg:text-left'
                            : 'block rounded-md px-3 py-2 text-center text-sm text-gray-500 hover:text-brand-600 lg:rounded-none lg:text-left'
                        }
                      >
                        {label}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2 text-sm text-gray-400">分類</li>
                )}
              </ul>
            </div>

            {/* 右側內容：橫幅 + 商品卡網格 */}
            <div className="lg:col-span-10">
              <div className="grid grid-cols-2 gap-px bg-gray-100 sm:grid-cols-3 lg:grid-cols-4">
                {/* 寬幅情境橫幅（佔 2 格寬） */}
                <MaybeLink
                  href={banner.linkUrl}
                  className="group relative col-span-2 row-span-2 block min-h-[180px] overflow-hidden bg-gradient-to-br from-sky-500 to-brand-700"
                >
                  <SafeImage
                    src={banner.imageUrl}
                    alt={itemAlt(banner, title)}
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {banner.title && (
                    <>
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
                      <h3 className="absolute bottom-0 p-4 text-lg font-bold text-white drop-shadow sm:text-xl">
                        {banner.title}
                      </h3>
                    </>
                  )}
                </MaybeLink>

                {/* 商品卡 */}
                {products.slice(0, 8).map((item) => (
                  <MaybeLink
                    key={item.id}
                    href={item.linkUrl}
                    className="group flex flex-col bg-white p-3 transition-colors hover:bg-gray-50"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-50">
                      <SafeImage
                        src={item.imageUrl}
                        alt={itemAlt(item, title)}
                        className="object-contain p-1 transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    {item.title && (
                      <p className="mt-2 line-clamp-2 text-xs text-gray-700 sm:text-sm">
                        {item.title}
                      </p>
                    )}
                  </MaybeLink>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
