import type {
  ProductDetailBlockInputDTO,
  ProductImageInputDTO,
} from "@havoice/shared";

const UNSAFE_HTML_PATTERN = /<\s*(script|iframe)\b/i;

export function normalizeProductImages(
  images: ProductImageInputDTO[] | undefined,
  fallbackCoverImage: string,
) {
  const normalized = (images ?? [])
    .filter((image) => image.imageUrl)
    .map((image, index) => ({
      imageUrl: image.imageUrl,
      publicId: image.publicId?.trim() || null,
      altText: image.altText?.trim() || null,
      sortOrder: index,
      isCover: Boolean(image.isCover),
    }));
  if (normalized.length === 0 && fallbackCoverImage) {
    return [
      {
        imageUrl: fallbackCoverImage,
        publicId: null,
        altText: null,
        sortOrder: 0,
        isCover: true,
      },
    ];
  }
  const requestedCover = normalized.findIndex((image) => image.isCover);
  const coverIndex = requestedCover >= 0 ? requestedCover : 0;
  return normalized.map((image, index) => ({
    ...image,
    sortOrder: index,
    isCover: index === coverIndex,
  }));
}

export function getCoverImageUrl(
  images: Array<{ imageUrl: string; isCover: boolean }>,
  fallback: string,
) {
  return (
    images.find((image) => image.isCover)?.imageUrl ??
    images[0]?.imageUrl ??
    fallback
  );
}

export function normalizeProductDetailBlocks(
  blocks: ProductDetailBlockInputDTO[] | undefined,
) {
  return (blocks ?? []).map((block, index) => {
    const title = block.title?.trim() || null;
    const body = block.body?.trim() || null;
    const imageUrl = block.imageUrl?.trim() || null;
    const imageAlt = block.imageAlt?.trim() || null;
    if (
      [title, body, imageAlt].some(
        (value) => value && UNSAFE_HTML_PATTERN.test(value),
      )
    ) {
      throw new Error("商品內容不可包含 script 或 iframe");
    }
    if ((block.type === "IMAGE" || block.type === "IMAGE_TEXT") && !imageUrl) {
      throw new Error("圖片內容區塊必須上傳圖片");
    }
    if ((block.type === "TEXT" || block.type === "NOTICE") && !title && !body) {
      throw new Error("文字內容區塊需填寫標題或內文");
    }
    return {
      type: block.type,
      title,
      body,
      imageUrl,
      imagePublicId: block.imagePublicId?.trim() || null,
      imageAlt,
      sortOrder: index,
      isEnabled: block.isEnabled ?? true,
    };
  });
}
