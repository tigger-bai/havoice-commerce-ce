'use client';

import { cn } from '@/lib/utils';
import type { LayoutItem } from '@/types';
import { MaybeLink, SafeImage, itemAlt } from './shared';

interface SalesRankingProps {
  title: string;
  items: LayoutItem[];
}

/** 分類膠囊（純視覺示意，符合附圖頂部的分類列） */
const CATEGORY_TABS = [
  '綜合', '3C', '周邊', '筆電', '通訊', '數位', '家電',
  '日用', '母嬰', '食品', '生活', '居家', '休閒', '保健', '美妝', '時尚', '書店',
];

/** 名次大數字配色（前三名鮮明、其餘淺藍） */
function rankNumberClass(rank: number): string {
  switch (rank) {
    case 1:
      return 'text-sky-400';
    case 2:
      return 'text-sky-300';
    case 3:
      return 'text-sky-300';
    default:
      return 'text-sky-200';
  }
}

/**
 * SALES_RANKING — 暢銷排行
 *
 * 切版重點（參考附圖）：
 * - 標題列右側帶可橫向捲動的分類膠囊（綜合/3C/...），第一顆為 active 樣式
 * - 每個商品卡「背後」有放大的半透明名次大數字（1,2,3...），為此區塊的招牌設計
 * - 商品卡為白底、上方方形商品圖、下方標題；橫向捲動（snap）
 * - SafeImage 破圖 fallback、MaybeLink 包裹 linkUrl
 */
export function SalesRanking({ title, items }: SalesRankingProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className="py-8 sm:py-10">
      <div className="container-page">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-6">
          {/* 標題 + 分類膠囊列 */}
          <div className="flex items-center gap-4 overflow-hidden">
            <div className="flex shrink-0 items-center gap-2">
              <span className="h-6 w-1.5 rounded-full bg-sky-500" />
              <h2 className="whitespace-nowrap text-lg font-bold text-gray-900 sm:text-xl">
                {title || '暢銷排行'}
              </h2>
            </div>
            <div className="flex flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CATEGORY_TABS.map((tab, idx) => (
                <span
                  key={tab}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1 text-sm transition-colors',
                    idx === 0
                      ? 'border-sky-500 font-semibold text-sky-600'
                      : 'border-gray-200 text-gray-500'
                  )}
                >
                  {tab}
                </span>
              ))}
            </div>
          </div>

          {/* 排行卡片橫向捲動 */}
          <div className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 sm:gap-5 [scrollbar-width:thin]">
            {items.map((item, idx) => {
              const rank = idx + 1;
              return (
                <MaybeLink
                  key={item.id}
                  href={item.linkUrl}
                  className="group relative w-36 shrink-0 snap-start pt-6 sm:w-44"
                >
                  {/* 背景放大名次大數字 */}
                  <span
                    className={cn(
                      'pointer-events-none absolute -top-1 left-0 select-none text-7xl font-black italic leading-none sm:text-8xl',
                      rankNumberClass(rank)
                    )}
                  >
                    {rank}
                  </span>

                  {/* 商品圖卡 */}
                  <div className="relative ml-6 aspect-square overflow-hidden rounded-xl bg-gray-50 ring-1 ring-gray-100 sm:ml-8">
                    <SafeImage
                      src={item.imageUrl}
                      alt={itemAlt(item, `第 ${rank} 名`)}
                      className="object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>

                  {item.title && (
                    <p className="ml-6 mt-2 line-clamp-2 text-sm font-medium text-gray-800 sm:ml-8">
                      {item.title}
                    </p>
                  )}
                </MaybeLink>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
