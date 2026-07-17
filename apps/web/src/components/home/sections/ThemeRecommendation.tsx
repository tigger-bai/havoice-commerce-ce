'use client';

import type { LayoutItem } from '@/types';
import { MaybeLink, SafeImage, itemAlt } from './shared';

interface ThemeRecommendationProps {
  title: string;
  items: LayoutItem[];
}

/**
 * THEME_REC — 主題推薦（參考附圖：左大主視覺卡 + 右側商品網格）
 *
 * 切版重點：
 * - 左側為一張高大的主視覺卡（深色底），左上角「主題推薦」標籤、標題，
 *   底部排列數個 #hashtag 膠囊（取自其餘 item 的 title 作為標籤文字）
 * - 右側為商品圖網格（手機 2 欄、桌機 3 欄），每格白底、商品圖 + 標題
 * - 整體為白底圓角卡片，左右在桌機並排、手機上下堆疊
 * - SafeImage 破圖 fallback、MaybeLink 包裹 linkUrl
 */
export function ThemeRecommendation({ title, items }: ThemeRecommendationProps) {
  if (!items || items.length === 0) return null;

  const [feature, ...rest] = items;
  const gridItems = rest.length > 0 ? rest : items;
  // 取部分 item 標題作為主視覺卡的 hashtag 膠囊
  const tags = rest.slice(0, 4).map((it) => it.title).filter(Boolean) as string[];

  return (
    <section className="py-8 sm:py-10">
      <div className="container-page">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* 左側主視覺卡 */}
            <MaybeLink
              href={feature.linkUrl}
              className="group relative flex min-h-[260px] flex-col overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white lg:col-span-5 lg:min-h-[420px]"
            >
              {/* 背景主圖 */}
              <SafeImage
                src={feature.imageUrl}
                alt={itemAlt(feature, title)}
                className="absolute inset-0 opacity-80 transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />

              {/* 前景內容 */}
              <div className="relative">
                <span className="inline-block rounded bg-sky-500 px-2 py-0.5 text-xs font-semibold">
                  主題推薦
                </span>
                <h3 className="mt-3 text-2xl font-bold drop-shadow sm:text-3xl">{title}</h3>
              </div>

              {tags.length > 0 && (
                <div className="relative mt-auto flex flex-wrap gap-2 pt-6">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </MaybeLink>

            {/* 右側商品網格 */}
            <div className="grid grid-cols-2 gap-px bg-gray-100 p-px sm:grid-cols-3 lg:col-span-7">
              {gridItems.slice(0, 6).map((item) => (
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
                    <p className="mt-2 line-clamp-2 text-sm text-gray-700">{item.title}</p>
                  )}
                </MaybeLink>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
