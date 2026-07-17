// packages/shared/src/ecpay/checkout.ts
// 綠界 ECPay 結帳 payload 組裝與 CheckMacValue 簽章（純函式，無框架/DB 依賴）。
// 設計目的：讓 apps/api（Express 建單/重新產單）與 apps/web（BFF 繼續付款）共用同一份簽章邏輯，
// 確保 CheckMacValue 計算單一來源，不會因兩端實作不同而驗證失敗。

import crypto from "crypto";

/** 綠界結帳單一品項 */
export interface EcpayItem {
  productName: string;
  quantity: number;
}

/** 組裝 ECPay payload 所需參數 */
export interface BuildEcpayPayloadParams {
  /** 綠界送出用的交易編號，必須唯一、限英數字、最多 20 碼 */
  merchantTradeNo: string;

  /** 原始訂單編號，用於導回頁與 CustomField1 */
  orderNumber: string;

  /** 訂單金額，將四捨五入為整數字串 */
  totalAmount: number;

  /** 付款方式：CREDIT_CARD → Credit，其餘 → ATM */
  paymentMethod: string | null;

  /** 品項清單，用於組 ItemName */
  items: EcpayItem[];

  /** 綠界商店與金鑰設定 */
  merchantId: string;
  hashKey: string;
  hashIV: string;

  /** 後端 webhook 與前台導回網域 */
  apiBaseUrl: string;
  webBaseUrl: string;

  /** 交易時間，預設為現在 */
  tradeDate?: Date;
}

/**
 * 綠界 CheckMacValue 核心加密演算法（SHA256）。
 *
 * AIO 金流 EncryptType=1 使用 SHA256。
 * 流程：
 * 1. 參數依 A-Z 排序
 * 2. 前方加 HashKey，後方加 HashIV
 * 3. URL Encode
 * 4. 特殊字元依綠界規則還原
 * 5. 轉小寫
 * 6. SHA256
 * 7. 轉大寫
 */
export function generateCheckMacValue(
  payload: Record<string, string>,
  hashKey: string,
  hashIV: string,
): string {
  const sorted = Object.keys(payload)
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join("&");

  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;

  const encoded = encodeURIComponent(raw)
    .replace(/%20/g, "+")
    .replace(/%2d/gi, "-")
    .replace(/%5f/gi, "_")
    .replace(/%2e/gi, ".")
    .replace(/%21/gi, "!")
    .replace(/%2a/gi, "*")
    .replace(/%28/gi, "(")
    .replace(/%29/gi, ")")
    .toLowerCase();

  return crypto
    .createHash("sha256")
    .update(encoded)
    .digest("hex")
    .toUpperCase();
}

/**
 * 依訂單資訊組裝完整的綠界 AIO 結帳 payload，含 CheckMacValue。
 *
 * 回傳的物件可直接於前端產生 HTML form，並自動 submit 導向綠界。
 */
export function buildEcpayPayload(
  params: BuildEcpayPayloadParams,
): Record<string, string> {
  const {
    merchantTradeNo,
    orderNumber,
    totalAmount,
    paymentMethod,
    items,
    merchantId,
    hashKey,
    hashIV,
    apiBaseUrl,
    webBaseUrl,
    tradeDate = new Date(),
  } = params;

  const pad = (n: number) => (n < 10 ? `0${n}` : n.toString());

  const tradeDateStr = `${tradeDate.getFullYear()}/${pad(tradeDate.getMonth() + 1)}/${pad(
    tradeDate.getDate(),
  )} ${pad(tradeDate.getHours())}:${pad(tradeDate.getMinutes())}:${pad(tradeDate.getSeconds())}`;

  const itemNames = items
    .map((item) => {
      const safeName = item.productName
        .replace(/[^\u4e00-\u9fa5A-Za-z0-9 ]/g, "")
        .trim();

      return `${safeName || "商品"}x${item.quantity}`;
    })
    .join("#");

  const safeItemName =
    itemNames.length > 200 ? `${itemNames.slice(0, 197)}...` : itemNames;

  const baseParams: Record<string, string> = {
    MerchantID: merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: tradeDateStr,
    PaymentType: "aio",
    TotalAmount: Math.round(totalAmount).toString(),
    TradeDesc: "快樂TV線上商城訂單",
    ItemName: safeItemName || "商品一批",
    ReturnURL: `${apiBaseUrl}/api/orders/ecpay-webhook`,
    OrderResultURL: `${webBaseUrl}/checkout/success?orderNo=${encodeURIComponent(orderNumber)}`,
    ClientBackURL: `${webBaseUrl}/member/orders`,
    ChoosePayment: paymentMethod === "CREDIT_CARD" ? "Credit" : "ATM",
    EncryptType: "1",

    /**
     * 重要：
     * 重新付款時 MerchantTradeNo 會為了符合綠界規則而加上英數字後綴，
     * 因此用 CustomField1 保留原始 orderNumber。
     * webhook 應優先使用 CustomField1 找回原訂單。
     */
    CustomField1: orderNumber,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("========== ECPAY PAYLOAD DEBUG ==========");
    console.log("MerchantTradeNo =", baseParams.MerchantTradeNo);
    console.log("ChoosePayment =", baseParams.ChoosePayment);
    console.log("TotalAmount =", baseParams.TotalAmount);
    console.log("ReturnURL =", baseParams.ReturnURL);
    console.log("OrderResultURL =", baseParams.OrderResultURL);
    console.log("ClientBackURL =", baseParams.ClientBackURL);
    console.log("=========================================");
  }

  return {
    ...baseParams,
    CheckMacValue: generateCheckMacValue(baseParams, hashKey, hashIV),
  };
}

/**
 * 產生符合綠界 AIO 規則的重新付款 MerchantTradeNo。
 *
 * 綠界限制：
 * - 必須唯一
 * - 最多 20 碼
 * - 只能是英文字母與數字
 *
 * 舊版用 `${orderNumber}_${timestamp}`，但 `_` 會造成：
 * MerchantTradeNo Must be Number or English Letter.
 */
export function buildRepayMerchantTradeNo(
  orderNumber: string,
  now: number = Date.now(),
): string {
  const safeOrderNumber = orderNumber.replace(/[^A-Za-z0-9]/g, "");

  /**
   * 取 6 碼時間尾碼，增加重新付款的唯一性。
   * 20 碼上限下，原訂單號最多保留 14 碼。
   */
  const suffix = now.toString().slice(-6);
  const maxOrderNumberLength = 20 - suffix.length;
  const base = safeOrderNumber.slice(0, maxOrderNumberLength);

  return `${base}${suffix}`;
}

/**
 * 從綠界回拋資料還原原始 orderNumber。
 *
 * 建議 webhook 優先傳入 CustomField1，因為重新付款 MerchantTradeNo 會被壓縮成 20 碼英數字，
 * 不適合再反推完整原始訂單號。
 */
export function parseOriginalOrderNumber(
  merchantTradeNo: string,
  customField1?: string | null,
): string {
  if (customField1 && customField1.trim()) {
    return customField1.trim();
  }

  /**
   * 舊資料相容：
   * 舊版 MerchantTradeNo 曾經使用 `${orderNumber}_${timestamp}`，
   * 若 webhook 收到舊格式，仍可用 split('_') 還原。
   */
  if (merchantTradeNo.includes("_")) {
    return merchantTradeNo.split("_")[0];
  }

  /**
   * 最後備援：
   * 新格式無法可靠反推完整 orderNumber。
   * 若 webhook 沒有 CustomField1，這裡只能回傳原 MerchantTradeNo。
   */
  return merchantTradeNo;
}
