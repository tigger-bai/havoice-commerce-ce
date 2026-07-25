"use client";

import { useRef, useState } from "react";
import {
  createLocalId,
  normalizeBlockOrder,
  uploadProductEditorImage,
  type ProductDetailBlockFormValue,
} from "./product-editor-types";

const TYPES: Array<{
  value: ProductDetailBlockFormValue["type"];
  label: string;
}> = [
  { value: "TEXT", label: "文字" },
  { value: "IMAGE", label: "圖片" },
  { value: "IMAGE_TEXT", label: "圖片搭配文字" },
  { value: "NOTICE", label: "注意事項" },
  { value: "DIVIDER", label: "分隔線" },
];

export function ProductDetailBlocksEditor({
  value,
  onChange,
  onUploadingChange,
  disabled,
  canUpload = true,
}: {
  value: ProductDetailBlockFormValue[];
  onChange: (next: ProductDetailBlockFormValue[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  canUpload?: boolean;
}) {
  const [newType, setNewType] =
    useState<ProductDetailBlockFormValue["type"]>("TEXT");
  const [error, setError] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const patch = (index: number, change: Partial<ProductDetailBlockFormValue>) =>
    onChange(
      value.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...change } : block,
      ),
    );

  const move = (index: number, offset: number) => {
    const destination = index + offset;
    if (destination < 0 || destination >= value.length) return;
    const next = [...value];
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(normalizeBlockOrder(next));
  };

  const upload = async (index: number, file?: File) => {
    if (!file) return;
    setError(null);
    onUploadingChange?.(true);
    try {
      const result = await uploadProductEditorImage(file);
      patch(index, { imageUrl: result.url, imagePublicId: result.publicId });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "圖片上傳失敗",
      );
    } finally {
      onUploadingChange?.(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select
          value={newType}
          onChange={(event) => setNewType(event.target.value as typeof newType)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...value,
              {
                id: createLocalId("block"),
                type: newType,
                title: "",
                body: "",
                imageUrl: null,
                imagePublicId: null,
                imageAlt: "",
                sortOrder: value.length,
                isEnabled: true,
              },
            ])
          }
          className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          新增內容區塊
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {value.map((block, index) => {
        const needsImage =
          block.type === "IMAGE" || block.type === "IMAGE_TEXT";
        const needsText =
          block.type === "TEXT" ||
          block.type === "IMAGE_TEXT" ||
          block.type === "NOTICE";
        const key = block.id ?? String(index);
        return (
          <div
            key={key}
            className="space-y-3 rounded-lg border border-gray-200 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">
                {index + 1}.{" "}
                {TYPES.find((type) => type.value === block.type)?.label}
              </strong>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                >
                  上移
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                >
                  下移
                </button>
                <button
                  type="button"
                  onClick={() => patch(index, { isEnabled: !block.isEnabled })}
                >
                  {block.isEnabled ? "停用" : "啟用"}
                </button>
                <button
                  type="button"
                  className="text-rose-600"
                  onClick={() =>
                    onChange(
                      normalizeBlockOrder(
                        value.filter((_, blockIndex) => blockIndex !== index),
                      ),
                    )
                  }
                >
                  刪除
                </button>
              </div>
            </div>
            {block.type !== "DIVIDER" && (
              <input
                value={block.title ?? ""}
                placeholder="標題（選填）"
                onChange={(event) =>
                  patch(index, { title: event.target.value })
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            )}
            {needsText && (
              <textarea
                value={block.body ?? ""}
                placeholder="內容"
                rows={4}
                onChange={(event) => patch(index, { body: event.target.value })}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            )}
            {needsImage && (
              <>
                <input
                  ref={(element) => {
                    fileRefs.current[key] = element;
                  }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={disabled || !canUpload}
                  onChange={(event) =>
                    void upload(index, event.target.files?.[0])
                  }
                />
                {canUpload ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => fileRefs.current[key]?.click()}
                    className="rounded border border-gray-300 px-3 py-2 text-xs"
                  >
                    上傳區塊圖片
                  </button>
                ) : (
                  <p className="text-sm text-amber-700">
                    圖片上傳需由管理員處理。
                  </p>
                )}
                {block.imageUrl && (
                  <img
                    src={block.imageUrl}
                    alt={block.imageAlt || ""}
                    className="max-h-48 rounded object-contain"
                  />
                )}
                <input
                  value={block.imageAlt ?? ""}
                  placeholder="圖片替代文字"
                  onChange={(event) =>
                    patch(index, { imageAlt: event.target.value })
                  }
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
