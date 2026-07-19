import type { LayoutItem } from '@/types';
import { SafeImage, MaybeLink } from './shared';

import { itemAlt } from './item-utils';
/**
 * IMAGE_WITH_TEXT — 圖文精選
 *
 * 設計決策：
 * - 左圖右文或右圖左文的圖文區塊，用於品牌故事、活動主打、商品特寫等敘事內容
 * - 以 items 的索引奇偶決定左右交錯（zebra）：偶數列圖在左、奇數列圖在右，形成節奏感
 * - 每筆 item：imageUrl 為主視覺、title 為標題文案、linkUrl 提供「了解更多」CTA
 * - 單筆 item 亦能成立（最常見用法為單一圖文）
 */
export function ImageWithText({ title, items }: { title: string; items: LayoutItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="bg-white py-10 sm:py-12">
      <div className="container-page space-y-10 sm:space-y-14">
        {items.map((item, index) => {
          const imageRight = index % 2 === 1;
          return (
            <div
              key={item.id}
              className="grid grid-cols-1 items-center gap-6 md:grid-cols-2 md:gap-10"
            >
              {/* 圖片 */}
              <div
                className={[
                  'relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gray-100',
                  imageRight ? 'md:order-2' : 'md:order-1',
                ].join(' ')}
              >
                {item.imageUrl ? (
                  <SafeImage src={item.imageUrl} alt={itemAlt(item, '圖文精選')} className="transition-transform duration-500 hover:scale-105" />
                ) : null}
              </div>

              {/* 文字 */}
              <div className={imageRight ? 'md:order-1' : 'md:order-2'}>
                {title && index === 0 && (
                  <span className="mb-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600">
                    {title}
                  </span>
                )}
                <h3 className="text-2xl font-bold leading-snug text-gray-900 sm:text-3xl">
                  {item.title || '精選內容'}
                </h3>
                {item.linkUrl && (
                  <MaybeLink
                    href={item.linkUrl}
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
                  >
                    了解更多
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </MaybeLink>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
