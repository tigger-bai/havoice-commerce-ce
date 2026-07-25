"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductImage } from "@/types";

export function ProductImageGallery({
  images,
  productName,
}: {
  images: ProductImage[];
  productName: string;
}) {
  const sortedImages = useMemo(
    () =>
      images
        .filter((image) => image.imageUrl.trim().length > 0)
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [images],
  );
  const coverIndex = Math.max(
    0,
    sortedImages.findIndex((image) => image.isCover),
  );
  const [activeIndex, setActiveIndex] = useState(coverIndex);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setActiveIndex(coverIndex);
  }, [coverIndex, sortedImages.length]);

  const active = sortedImages[activeIndex] ?? sortedImages[0];
  if (!active) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-500">
        暫無商品圖片
      </div>
    );
  }

  const markFailed = (imageId: string) => {
    setFailedImageIds((current) => {
      const next = new Set(current);
      next.add(imageId);
      return next;
    });
  };
  const activeFailed = failedImageIds.has(active.id);

  return (
    <div className="space-y-3">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
        {activeFailed ? (
          <span className="text-sm text-gray-500">暫無商品圖片</span>
        ) : (
          <img
            src={active.imageUrl}
            alt={active.altText || productName}
            className="h-full w-full object-cover"
            onError={() => markFailed(active.id)}
          />
        )}
      </div>
      {sortedImages.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          aria-label="商品圖片縮圖"
        >
          {sortedImages.map((image, index) => (
            <button
              key={image.id || `${image.imageUrl}-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`顯示第 ${index + 1} 張商品圖片`}
              aria-current={index === activeIndex}
              className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${
                index === activeIndex
                  ? "border-brand-600"
                  : "border-transparent"
              }`}
            >
              {failedImageIds.has(image.id) ? (
                <span className="flex h-full w-full items-center justify-center bg-gray-100 px-1 text-[10px] text-gray-500">
                  暫無圖片
                </span>
              ) : (
                <img
                  src={image.imageUrl}
                  alt={image.altText || `${productName} ${index + 1}`}
                  className="h-full w-full object-cover"
                  onError={() => markFailed(image.id)}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
