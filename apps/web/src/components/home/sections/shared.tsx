'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { LayoutItem } from '@/types';

/**
 * 區塊共用元件
 *
 * 設計決策：
 * - SafeImage：原生 <img> + onError fallback（隱藏破圖、保留漸層底色），避免遠端網域設定問題與跑版
 * - MaybeLink：item.linkUrl 存在才以 Link 包裹，否則回傳純容器
 * - SectionHeading：統一電商樓層標題視覺（左側色條 + 標題 + 選填副標）
 */

export function SafeImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn('h-full w-full object-cover', className)}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
      }}
    />
  );
}

export function MaybeLink({
  href,
  className,
  children,
}: {
  href?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return <div className={className}>{children}</div>;
}

export function SectionHeading({
  title,
  subtitle,
  accentClass = 'bg-brand-500',
}: {
  title: string;
  subtitle?: string;
  accentClass?: string;
}) {
  if (!title) return null;
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className={cn('h-6 w-1.5 rounded-full', accentClass)} />
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{title}</h2>
      </div>
      {subtitle && <p className="hidden text-sm text-gray-400 sm:block">{subtitle}</p>}
    </div>
  );
}

/** 取得項目顯示用的 alt 文字 */
export function itemAlt(item: LayoutItem, fallback: string): string {
  return item.title || fallback;
}
