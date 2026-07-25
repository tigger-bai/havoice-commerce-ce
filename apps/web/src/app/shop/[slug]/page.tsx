import { notFound } from "next/navigation";
import { api } from "@/lib/api-client";
import { AddToCartButton } from "@/components/shop/AddToCartButton";
import { ProductImageGallery } from "@/components/shop/ProductImageGallery";
import { formatPrice } from "@/lib/utils";
import type { Product, ProductDetailBlock, ProductImage } from "@/types";
import type { Metadata } from "next";

interface ProductPageProps {
  params: { slug: string };
}

function getValidImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  try {
    const product = await api.get<Product>(
      `/api/products/slug/${params.slug}`,
      {
        revalidate: 60,
      },
    );
    const imageUrl =
      product.productImages
        ?.slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((image) => ({
          url: getValidImageUrl(image.imageUrl),
          isCover: image.isCover,
        }))
        .sort((left, right) => Number(right.isCover) - Number(left.isCover))
        .find((image) => image.url)?.url ??
      getValidImageUrl(product.coverImage);
    return {
      title: `${product.name} — 快樂之音商城`,
      description: product.description.slice(0, 160),
      openGraph: {
        title: product.name,
        description: product.description.slice(0, 160),
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
    };
  } catch {
    return { title: "商品不存在 — 快樂之音" };
  }
}

/**
 * 商品詳情頁面 - Server Component
 *
 * 設計決策：
 * - 左右分欄佈局：左側大圖、右側商品資訊
 * - 顯示原價劃線、折扣百分比與庫存狀態
 * - 「加入購物車」按鈕為 Client Component（需要存取 Zustand Store）
 */
export default async function ProductDetailPage({ params }: ProductPageProps) {
  let product: Product;

  try {
    product = await api.get<Product>(`/api/products/slug/${params.slug}`, {
      revalidate: 60,
    });
  } catch {
    notFound();
  }

  const price = parseFloat(product.price);
  const compareAtPrice = product.compareAtPrice
    ? parseFloat(product.compareAtPrice)
    : null;
  const discountPercent =
    compareAtPrice && compareAtPrice > price
      ? Math.round((1 - price / compareAtPrice) * 100)
      : null;
  const productImages: ProductImage[] = product.productImages?.length
    ? product.productImages
    : product.coverImage
      ? [
          {
            id: "legacy-cover",
            imageUrl: product.coverImage,
            altText: product.name,
            sortOrder: 0,
            isCover: true,
          },
        ]
      : [];
  const detailBlocks = (product.detailBlocks ?? [])
    .filter((block) => block.isEnabled)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    <div className="container-page py-10">
      <div className="grid gap-10 lg:grid-cols-2">
        {/* 左側：商品圖片 */}
        <ProductImageGallery
          images={productImages}
          productName={product.name}
        />

        {/* 右側：商品資訊 */}
        <div className="flex flex-col justify-center">
          {/* 分類 */}
          <span className="inline-block w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            {product.category.name}
          </span>

          {/* 名稱 */}
          <h1 className="mt-4 text-2xl font-bold text-gray-900 sm:text-3xl">
            {product.name}
          </h1>

          {/* 價格區 */}
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-brand-600">
              {formatPrice(price)}
            </span>
            {compareAtPrice && (
              <>
                <span className="text-lg text-gray-400 line-through">
                  {formatPrice(compareAtPrice)}
                </span>
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                  省 {discountPercent}%
                </span>
              </>
            )}
          </div>

          {/* 庫存狀態 */}
          <div className="mt-4">
            {product.stock > 10 ? (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                有貨
              </span>
            ) : product.stock > 0 ? (
              <span className="flex items-center gap-1.5 text-sm text-yellow-600">
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                僅剩 {product.stock} 件
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-red-600">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                已售罄
              </span>
            )}
          </div>

          {/* 商品描述 */}
          <div className="mt-6 border-t border-gray-100 pt-6">
            <h3 className="text-sm font-semibold text-gray-900">商品描述</h3>
            <div className="mt-3 text-sm leading-relaxed text-gray-600">
              {product.description.split("\n").map((paragraph, index) => (
                <p key={index} className="mb-2">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          {/* SKU */}
          <p className="mt-4 text-xs text-gray-400">
            商品編號：{product.sku}
            {product.brand ? ` · 品牌：${product.brand}` : ""}
          </p>

          {/* 加入購物車按鈕 */}
          <div className="mt-8">
            <AddToCartButton
              product={{
                productId: product.id,
                name: product.name,
                slug: product.slug,
                price,
                coverImage: product.coverImage,
              }}
              disabled={product.stock === 0}
            />
          </div>
        </div>
      </div>

      {(detailBlocks.length > 0 || product.description.trim()) && (
        <section
          className="mx-auto mt-14 max-w-4xl space-y-8"
          aria-label="商品詳細內容"
        >
          {detailBlocks.length > 0
            ? detailBlocks.map((block) => (
                <ProductContentBlock key={block.id} block={block} />
              ))
            : product.description.split("\n").map((paragraph, index) => (
                <p key={index} className="text-sm leading-7 text-gray-700">
                  {paragraph || "\u00a0"}
                </p>
              ))}
        </section>
      )}
    </div>
  );
}

function ProductContentBlock({ block }: { block: ProductDetailBlock }) {
  if (block.type === "DIVIDER") return <hr className="border-gray-200" />;
  const notice = block.type === "NOTICE";
  return (
    <article
      className={
        notice
          ? "rounded-xl border border-amber-200 bg-amber-50 p-5"
          : "space-y-4"
      }
    >
      {block.title && (
        <h2 className="text-xl font-bold text-gray-900">{block.title}</h2>
      )}
      {(block.type === "IMAGE" || block.type === "IMAGE_TEXT") &&
        block.imageUrl && (
          <img
            src={block.imageUrl}
            alt={block.imageAlt || block.title || ""}
            className="mx-auto max-h-[720px] w-full rounded-xl object-contain"
          />
        )}
      {block.body && (
        <div className="space-y-2 text-sm leading-7 text-gray-700">
          {block.body.split("\n").map((line, index) => (
            <p key={index}>{line || "\u00a0"}</p>
          ))}
        </div>
      )}
    </article>
  );
}
