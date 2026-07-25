"use client";

import { useRef, useState } from "react";
import {
  createLocalId,
  normalizeImageOrder,
  uploadProductEditorImage,
  type ProductImageFormValue,
} from "./product-editor-types";

export function ProductImagesEditor({
  value,
  onChange,
  onUploadingChange,
  disabled,
  canUpload = true,
}: {
  value: ProductImageFormValue[];
  onChange: (next: ProductImageFormValue[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  canUpload?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const move = (index: number, offset: number) => {
    const destination = index + offset;
    if (destination < 0 || destination >= value.length) return;
    const next = [...value];
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(normalizeImageOrder(next));
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const uploaded: ProductImageFormValue[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadProductEditorImage(file);
        uploaded.push({
          id: createLocalId("image"),
          imageUrl: result.url,
          publicId: result.publicId,
          altText: "",
          sortOrder: value.length + uploaded.length,
          isCover: value.length === 0 && uploaded.length === 0,
        });
      }
      onChange(normalizeImageOrder([...value, ...uploaded]));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "圖片上傳失敗",
      );
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        disabled={disabled || uploading || !canUpload}
        onChange={(event) => void upload(event.target.files)}
      />
      {canUpload ? (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {uploading ? "上傳中…" : "上傳商品圖片"}
        </button>
      ) : (
        <p className="text-sm text-amber-700">圖片上傳需由管理員處理。</p>
      )}
      <p className="text-xs text-gray-500">
        支援 JPG、PNG、WebP、GIF，單張上限 5MB。
      </p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {value.map((image, index) => (
        <div
          key={image.id ?? image.imageUrl}
          className="flex gap-3 rounded-lg border border-gray-200 p-3"
        >
          <img
            src={image.imageUrl}
            alt={image.altText || "商品圖片"}
            className="h-24 w-24 rounded object-cover"
          />
          <div className="flex-1 space-y-2">
            <input
              value={image.altText ?? ""}
              placeholder="圖片替代文字"
              onChange={(event) =>
                onChange(
                  value.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, altText: event.target.value }
                      : item,
                  ),
                )
              }
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                disabled={disabled || image.isCover}
                onClick={() =>
                  onChange(
                    value.map((item, itemIndex) => ({
                      ...item,
                      isCover: itemIndex === index,
                    })),
                  )
                }
              >
                {image.isCover ? "目前主圖" : "設為主圖"}
              </button>
              <button
                type="button"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                上移
              </button>
              <button
                type="button"
                disabled={disabled || index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                下移
              </button>
              <button
                type="button"
                disabled={disabled}
                className="text-rose-600"
                onClick={() =>
                  onChange(
                    normalizeImageOrder(
                      value.filter((_, itemIndex) => itemIndex !== index),
                    ),
                  )
                }
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
