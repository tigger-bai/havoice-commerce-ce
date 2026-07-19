import type { LayoutItem } from '@/types';
import { SafeImage, MaybeLink } from './shared';

import { itemAlt } from './item-utils';
/**
 * PROMO_BANNER — 單張活動橫幅
 *
 * 設計決策：
 * - 單張寬版活動宣傳橫幅，適合檔期主視覺、優惠公告等強曝光內容
 * - 取 items 第一筆作為橫幅（多筆時其餘忽略，符合「單張」語意）
 * - imageUrl 為橫幅圖，linkUrl 存在時整張可點擊；無圖時不渲染避免空白
 * - 寬高比採 21:9（桌機）／16:9（手機）兼顧視覺張力與行動裝置可讀性
 */
export function PromoBanner({ items }: { items: LayoutItem[] }) {
  const banner = items[0];
  if (!banner || !banner.imageUrl) return null;

  return (
    <section className="bg-white py-6 sm:py-8">
      <div className="container-page">
        <MaybeLink
          href={banner.linkUrl}
          className="group relative block aspect-[16/9] w-full overflow-hidden rounded-2xl bg-gray-100 sm:aspect-[21/9]"
        >
          <SafeImage
            src={banner.imageUrl}
            alt={itemAlt(banner, '活動橫幅')}
            className="transition-transform duration-500 group-hover:scale-105"
          />
          {banner.title && (
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent p-6 sm:p-8">
              <h3 className="text-xl font-bold text-white drop-shadow sm:text-2xl">
                {banner.title}
              </h3>
            </div>
          )}
        </MaybeLink>
      </div>
    </section>
  );
}
