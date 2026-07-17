import type { LayoutSection } from '@/types';

import { HeroBannerSection } from './sections/HeroBannerSection';
import { ThemeRecommendation } from './sections/ThemeRecommendation';
import { SalesRanking } from './sections/SalesRanking';
import { BrandCarousel } from './sections/BrandCarousel';
import { CategoryFloor } from './sections/CategoryFloor';
import { IconNavigation } from './sections/IconNavigation';
import { ImageWithText } from './sections/ImageWithText';
import { PromoBanner } from './sections/PromoBanner';

// legacy 渲染元件（相容舊資料）
import { LayoutHeroCarousel } from './LayoutHeroCarousel';
import { LayoutGridSection } from './LayoutGridSection';

interface SectionRendererProps {
  section: LayoutSection;
}

/**
 * SectionRenderer — 首頁區塊渲染工廠（Factory Pattern）
 *
 * 設計決策：
 * - 接收單一 LayoutSection，依 section.type 以 switch 回傳對應區塊元件
 * - 新世代電商類型（5 種）為主要實作；legacy 類型（CAROUSEL/GRID/BANNER）保留相容渲染
 * - items 為空者一律略過（回傳 null），確保前台穩定不跑版
 * - 未知 type 回傳 null，避免渲染錯誤元件
 */
export function SectionRenderer({ section }: SectionRendererProps) {
  const items = Array.isArray(section.items) ? section.items : [];
  if (items.length === 0) return null;

  switch (section.type) {
    // ── 新世代大型電商類型 ──
    case 'HERO_BANNER':
      return <HeroBannerSection items={items} />;
    case 'THEME_REC':
      return <ThemeRecommendation title={section.title} items={items} />;
    case 'SALES_RANKING':
      return <SalesRanking title={section.title} items={items} />;
    case 'BRAND_CAROUSEL':
      return <BrandCarousel title={section.title} items={items} />;
    case 'CATEGORY_FLOOR':
      return <CategoryFloor title={section.title} items={items} />;

    // ── Page Builder 新增積木 ──
    case 'ICON_NAVIGATION':
      return <IconNavigation title={section.title} items={items} />;
    case 'IMAGE_WITH_TEXT':
      return <ImageWithText title={section.title} items={items} />;
    case 'PROMO_BANNER':
      return <PromoBanner items={items} />;

    // ── legacy 類型（向後相容） ──
    case 'CAROUSEL':
      return <LayoutHeroCarousel items={items} />;
    case 'GRID':
      return <LayoutGridSection title={section.title} items={items} variant="GRID" />;
    case 'BANNER':
      return <LayoutGridSection title={section.title} items={items} variant="BANNER" />;

    default:
      return null;
  }
}
