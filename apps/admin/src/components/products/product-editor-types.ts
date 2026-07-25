export type ProductImageFormValue = {
  id?: string | null;
  imageUrl: string;
  publicId?: string | null;
  altText?: string | null;
  sortOrder: number;
  isCover: boolean;
};

export type ProductDetailBlockFormValue = {
  id?: string | null;
  type: "TEXT" | "IMAGE" | "IMAGE_TEXT" | "DIVIDER" | "NOTICE";
  title?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  imagePublicId?: string | null;
  imageAlt?: string | null;
  sortOrder: number;
  isEnabled: boolean;
};

export function createLocalId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function uploadProductEditorImage(file: File) {
  const accepted = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!accepted.includes(file.type))
    throw new Error("圖片格式僅支援 JPG、PNG、WebP 或 GIF");
  if (file.size > 5 * 1024 * 1024) throw new Error("圖片大小不可超過 5MB");

  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
  const json = await response.json();
  if (!response.ok || !json.success)
    throw new Error(json?.error?.message || "圖片上傳失敗");
  return {
    url: json.data.url as string,
    publicId: (json.data.publicId as string | null) ?? null,
  };
}

export function normalizeImageOrder(
  images: ProductImageFormValue[],
): ProductImageFormValue[] {
  const requestedCover = images.findIndex((image) => image.isCover);
  const coverIndex = requestedCover >= 0 ? requestedCover : 0;
  return images.map((image, index) => ({
    ...image,
    sortOrder: index,
    isCover: index === coverIndex,
  }));
}

export function normalizeBlockOrder(
  blocks: ProductDetailBlockFormValue[],
): ProductDetailBlockFormValue[] {
  return blocks.map((block, index) => ({ ...block, sortOrder: index }));
}
