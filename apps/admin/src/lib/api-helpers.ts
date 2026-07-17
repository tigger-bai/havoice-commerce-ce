import { NextResponse } from 'next/server';

/**
 * API Route 共用工具
 *
 * 設計決策（防禦性程式設計）：
 * - toNumber：將 Prisma Decimal / string / unknown 安全轉為 number，失敗回傳 0
 * - jsonOk / jsonError：統一的成功/失敗回應格式
 * - 所有金額在序列化前一律經過 toNumber，避免前端收到 Decimal 物件而崩潰
 */

/** 安全數值轉換：等同需求中的 Number(value) || 0，但額外處理 Decimal 物件 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  // Prisma Decimal 具有 toString / toNumber
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const n = Number((value as { toString(): string }).toString());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 安全整數轉換 */
export function toInt(value: unknown): number {
  const n = toNumber(value);
  return Math.trunc(n);
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  return NextResponse.json(
    { success: false, error: { code, message, details } },
    { status }
  );
}
