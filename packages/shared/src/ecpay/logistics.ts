// packages/shared/src/ecpay/logistics.ts
// 綠界物流 API CheckMacValue 工具。
// 注意：物流整合 API 使用 MD5，不能沿用金流 AIO 的 SHA256 簽章。

import crypto from "crypto";

type LogisticsCheckMacPayload = Record<string, string | number | boolean | null | undefined>;
type LogisticsV2DataPayload = Record<string, unknown>;

const OFFICIAL_LOGISTICS_CHECK_MAC_SAMPLE = {
  hashKey: "XBERn1YOvpM9nfZc",
  hashIV: "h1ONHk4P4yqbl5LK",
  expected: "692FD6E2CDB539CCDB7206C76DC239AD",
  params: {
    MerchantID: "2000933",
    MerchantTradeNo: "A20130312153023",
    MerchantTradeDate: "2013/03/12 15:30:23",
    LogisticsType: "CVS",
    LogisticsSubType: "FAMIC2C",
    GoodsAmount: "1000",
    IsCollection: "N",
    ServerReplyURL: "https://www.ecpay.com.tw/ServerReplyURL",
    SenderName: "寄件者姓名",
    ReceiverName: "收件者姓名",
    ReceiverStoreID: "001779",
  },
} as const;

export type LogisticsCheckMacSelfTestResult = {
  expected: string;
  actual: string;
  passed: boolean;
  encodedSource: string;
};

export type LogisticsV2EncryptPayload = LogisticsV2DataPayload;

function sortLogisticsKeys(a: string, b: string): number {
  const upperA = a.toUpperCase();
  const upperB = b.toUpperCase();

  if (upperA < upperB) return -1;
  if (upperA > upperB) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizePayload(payload: LogisticsCheckMacPayload): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (key.toLowerCase() === "checkmacvalue" || value === null || value === undefined) continue;
    normalized[key] = String(value);
  }

  return normalized;
}

function buildLogisticsCheckMacRawSource(
  normalized: Record<string, string>,
  hashKey: string,
  hashIV: string,
): string {
  const sorted = Object.keys(normalized)
    .sort(sortLogisticsKeys)
    .map((key) => `${key}=${normalized[key]}`)
    .join("&");

  return `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;
}

function ecpayLogisticsUrlEncode(value: string): string {
  const dotNetEncoded = encodeURIComponent(value)
    // JavaScript encodeURIComponent leaves these unescaped, while .NET UrlEncode
    // encodes them. Do not restore them below because ECPay's replacement table
    // does not list %7e or %27.
    .replace(/~/g, "%7E")
    .replace(/'/g, "%27")
    .replace(/%20/g, "+")
    .toLowerCase();

  return dotNetEncoded
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");
}

function ecpayV2DataUrlEncode(value: string): string {
  return encodeURIComponent(value);
}

function ecpayV2DataUrlDecode(value: string): string {
  return decodeURIComponent(value);
}

/**
 * 產生綠界物流 API 的 CheckMacValue。
 *
 * 規則：
 * 1. 排除 CheckMacValue 本身
 * 2. 參數依 key 字母 A-Z 排序（大小寫不敏感）
 * 3. 前方加 HashKey，後方加 HashIV
 * 4. URL encode，依綠界物流 .NET UrlEncode 規則還原部分字元
 * 5. 轉小寫
 * 6. MD5
 * 7. 轉大寫
 */
export function buildLogisticsCheckMacEncodedSource(
  params: LogisticsCheckMacPayload,
  hashKey: string,
  hashIV: string,
): string {
  const normalized = normalizePayload(params);
  return ecpayLogisticsUrlEncode(buildLogisticsCheckMacRawSource(normalized, hashKey, hashIV));
}

export function generateLogisticsCheckMacValue(
  params: LogisticsCheckMacPayload,
  hashKey: string,
  hashIV: string,
): string {
  const encoded = buildLogisticsCheckMacEncodedSource(params, hashKey, hashIV);

  return crypto.createHash("md5").update(encoded).digest("hex").toUpperCase();
}

export function verifyLogisticsCheckMacValue(
  params: LogisticsCheckMacPayload,
  hashKey: string,
  hashIV: string,
): boolean {
  const checkMacEntry = Object.entries(params).find(
    ([key]) => key.toLowerCase() === "checkmacvalue",
  );
  const received = String(checkMacEntry?.[1] ?? "").trim().toUpperCase();
  if (!received) return false;

  return generateLogisticsCheckMacValue(params, hashKey, hashIV) === received;
}

export function encryptLogisticsV2Data(
  data: LogisticsV2EncryptPayload,
  hashKey: string,
  hashIV: string,
): string {
  const encoded = ecpayV2DataUrlEncode(JSON.stringify(data));
  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    Buffer.from(hashKey, "utf8"),
    Buffer.from(hashIV, "utf8"),
  );

  return `${cipher.update(encoded, "utf8", "base64")}${cipher.final("base64")}`;
}

export function decryptLogisticsV2Data<T = LogisticsV2EncryptPayload>(
  encryptedData: string,
  hashKey: string,
  hashIV: string,
): T {
  const decipher = crypto.createDecipheriv(
    "aes-128-cbc",
    Buffer.from(hashKey, "utf8"),
    Buffer.from(hashIV, "utf8"),
  );
  const decoded = `${decipher.update(encryptedData, "base64", "utf8")}${decipher.final("utf8")}`;

  return JSON.parse(ecpayV2DataUrlDecode(decoded)) as T;
}

/**
 * Development/test only helper for validating this implementation against
 * ECPay's official logistics CheckMacValue sample. This function has no side
 * effects and is not called by runtime business flows.
 */
export function runLogisticsCheckMacOfficialSelfTest(): LogisticsCheckMacSelfTestResult {
  const actual = generateLogisticsCheckMacValue(
    OFFICIAL_LOGISTICS_CHECK_MAC_SAMPLE.params,
    OFFICIAL_LOGISTICS_CHECK_MAC_SAMPLE.hashKey,
    OFFICIAL_LOGISTICS_CHECK_MAC_SAMPLE.hashIV,
  );

  return {
    expected: OFFICIAL_LOGISTICS_CHECK_MAC_SAMPLE.expected,
    actual,
    passed: actual === OFFICIAL_LOGISTICS_CHECK_MAC_SAMPLE.expected,
    encodedSource: buildLogisticsCheckMacEncodedSource(
      OFFICIAL_LOGISTICS_CHECK_MAC_SAMPLE.params,
      OFFICIAL_LOGISTICS_CHECK_MAC_SAMPLE.hashKey,
      OFFICIAL_LOGISTICS_CHECK_MAC_SAMPLE.hashIV,
    ),
  };
}
