export type ProductStockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export function getEffectiveReorderPoint(input: {
  safetyStock?: number | null;
  reorderPoint?: number | null;
}) {
  return input.reorderPoint ?? input.safetyStock ?? 0;
}

export function getProductStockStatus(input: {
  stock: number;
  safetyStock?: number | null;
  reorderPoint?: number | null;
}): ProductStockStatus {
  const stock = Number.isFinite(input.stock) ? Math.trunc(input.stock) : 0;
  if (stock <= 0) return "OUT_OF_STOCK";
  const threshold = getEffectiveReorderPoint(input);
  return threshold > 0 && stock <= threshold ? "LOW_STOCK" : "IN_STOCK";
}

export const PRODUCT_STOCK_STATUS_LABELS: Record<ProductStockStatus, string> = {
  IN_STOCK: "正常",
  LOW_STOCK: "低庫存",
  OUT_OF_STOCK: "缺貨",
};

export const PRODUCT_STOCK_STATUS_STYLES: Record<ProductStockStatus, string> = {
  IN_STOCK: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  LOW_STOCK: "bg-amber-50 text-amber-700 ring-amber-100",
  OUT_OF_STOCK: "bg-rose-50 text-rose-700 ring-rose-100",
};
