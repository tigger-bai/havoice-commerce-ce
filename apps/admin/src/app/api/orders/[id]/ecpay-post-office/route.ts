import { NextRequest } from 'next/server';

import { prisma, type Prisma } from '@havoice/database';
import {
  buildLogisticsCheckMacEncodedSource,
  generateLogisticsCheckMacValue,
  parseTaiwanAddress,
  resolveTaiwanPostalCode,
  resolveTaiwanPostalCodeFromAddress,
} from '@havoice/shared';

import { createAdminAuditLog } from '@/lib/admin-audit-log';
import { jsonError, jsonOk, toNumber } from '@/lib/api-helpers';
import { requireAdminSession } from '@/lib/auth/api-guard';
import { buildEcpayReceiverAddress, validateEcpayPostOfficeFields } from '@/lib/ecpay-post-office-validation';
import { createShipmentEvent, upsertShipmentRecord } from '@/lib/shipment-records';

export const runtime = 'nodejs';

const PROVIDER = 'EC_PAY_POST_OFFICE';
const isProduction = process.env.NODE_ENV === 'production';

const REQUIRED_REAL_MODE_ENV = [
  'ECPAY_MERCHANT_ID',
  'ECPAY_HASH_KEY',
  'ECPAY_HASH_IV',
  'ECPAY_LOGISTICS_API_URL',
  'ECPAY_LOGISTICS_SERVER_REPLY_URL',
  'ECPAY_LOGISTICS_SENDER_NAME',
  'ECPAY_LOGISTICS_SENDER_PHONE',
  'ECPAY_LOGISTICS_SENDER_ZIP_CODE',
  'ECPAY_LOGISTICS_SENDER_ADDRESS',
  'ECPAY_POST_OFFICE_DEFAULT_GOODS_WEIGHT',
] as const;

type ParsedLogisticsResponse = {
  ok: boolean;
  message: string;
  data: Record<string, string>;
};

type EcpayPostOfficeMode = 'mock' | 'real';

const SENSITIVE_RESPONSE_KEYS = new Set([
  'checkmacvalue',
  'hashkey',
  'hashiv',
  'token',
  'secret',
  'apikey',
  'api_key',
  'password',
]);

function readEnv(name: string): string {
  return (process.env[name] || '').replace(/["']/g, '').trim();
}

function resolvePostOfficeMode(): EcpayPostOfficeMode | null {
  const rawMode = readEnv('ECPAY_POST_OFFICE_MODE').toLowerCase();

  if (!rawMode) {
    return isProduction ? 'real' : 'mock';
  }

  if (rawMode === 'mock' || rawMode === 'real') {
    return rawMode;
  }

  return null;
}

function missingRealModeEnv(): string[] {
  return REQUIRED_REAL_MODE_ENV.filter((name) => !readEnv(name));
}

function formatEcpayDate(date = new Date()): string {
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value));

  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildMerchantTradeNo(): string {
  const timestamp = Date.now().toString().slice(-12);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EP${timestamp}${random}`.slice(0, 20);
}

function sanitizeName(value: string): string {
  return value.replace(/[^\u4e00-\u9fa5A-Za-z]/g, '').slice(0, 10);
}

function sanitizeGoodsName(value: string): string {
  return value
    .replace(/[\^'`!@#%&*+\\"<>|_[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

function sanitizeAddress(value: string): string {
  return value.trim().slice(0, 60);
}

function sanitizeZipCode(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function resolveZipCode(params: {
  postalCode: string | null | undefined;
  city: string | null | undefined;
  district: string | null | undefined;
  address: string;
  allowDefaultFallback: boolean;
}): string {
  const { postalCode, city, district, address, allowDefaultFallback } = params;
  const explicitZip = sanitizeZipCode(postalCode);
  if (explicitZip) return explicitZip;

  const lookupZip = resolveTaiwanPostalCode(city, district);
  if (lookupZip) return lookupZip;

  const addressLookupZip = resolveTaiwanPostalCodeFromAddress(address);
  if (addressLookupZip) return addressLookupZip;

  const addressZip = address.match(/(?:^|\D)(\d{3,6})(?:\D|$)/)?.[1];
  if (addressZip) return addressZip.slice(0, 6);

  return allowDefaultFallback
    ? sanitizeZipCode(readEnv('ECPAY_POST_OFFICE_DEFAULT_RECEIVER_ZIP_CODE'))
    : '';
}

function normalizePhone(value: string | null | undefined): string {
  return String(value || '').replace(/[^\d()#-]/g, '').trim().slice(0, 20);
}

function parseLogisticsResponse(text: string): ParsedLogisticsResponse {
  const raw = (text || '').trim();
  const sepIdx = raw.indexOf('|');
  const code = sepIdx >= 0 ? raw.slice(0, sepIdx) : raw;
  const rest = sepIdx >= 0 ? raw.slice(sepIdx + 1) : '';

  if (code !== '1') {
    return { ok: false, message: rest || '綠界物流建立失敗', data: {} };
  }

  const data: Record<string, string> = {};
  for (const pair of rest.split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      data[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }

  return { ok: true, message: 'OK', data };
}

function sanitizeRawResponse(data: Record<string, string>): Prisma.InputJsonObject {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = key.toLowerCase();
    if (
      SENSITIVE_RESPONSE_KEYS.has(normalizedKey) ||
      normalizedKey.includes('secret') ||
      normalizedKey.includes('token')
    ) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function sortPayloadKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const upperA = a.toUpperCase();
    const upperB = b.toUpperCase();

    if (upperA < upperB) return -1;
    if (upperA > upperB) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function maskCheckMacValue(value: string): string {
  if (!value) return '';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function maskIdentifier(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '[none]';
  if (text.length <= 6) return `${text.slice(0, 1)}***`;
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function summarizeObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return sortPayloadKeys(Object.keys(value as Record<string, unknown>));
}

function maskSecretPreview(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (text.length <= 6) return `${text.slice(0, 1)}***${text.slice(-1)}`;
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function getEcpayHashEnvDebug(): Record<string, { exists: boolean; preview: string | null }> {
  const envNames = [
    'ECPAY_LOGISTICS_HASH_KEY',
    'ECPAY_LOGISTICS_HASH_IV',
    'ECPAY_HASH_KEY',
    'ECPAY_HASH_IV',
  ];

  return Object.fromEntries(
    envNames.map((name) => {
      const value = readEnv(name);
      return [
        name,
        {
          exists: Boolean(value),
          preview: maskSecretPreview(value),
        },
      ];
    }),
  );
}

function logEcpayPostOfficeDebug(params: {
  mode: EcpayPostOfficeMode;
  logisticsApiUrl: string;
  merchantId: string;
  payload: Record<string, string>;
  recipientDebug?: {
    rawPostalCode: string | null;
    rawCity: string | null;
    rawDistrict: string | null;
    rawAddress: string | null;
    finalReceiverAddress: string;
  };
  checkMacValue?: string;
  encodedCheckMacSourcePreview?: string;
  rawResponse?: unknown;
}): void {
  if (isProduction) return;

  console.info('[EC_PAY_POST_OFFICE DEBUG]', {
    mode: params.mode,
    logisticsApiUrl: params.logisticsApiUrl,
    merchantId: maskIdentifier(params.merchantId),
    hashEnv: getEcpayHashEnvDebug(),
    payloadKeys: sortPayloadKeys(Object.keys(params.payload)),
    recipient: params.recipientDebug
      ? {
          postalCodePresent: Boolean(params.recipientDebug.rawPostalCode),
          cityPresent: Boolean(params.recipientDebug.rawCity),
          districtPresent: Boolean(params.recipientDebug.rawDistrict),
          addressPresent: Boolean(params.recipientDebug.rawAddress),
          addressParsed: Boolean(params.recipientDebug.finalReceiverAddress),
        }
      : null,
    checkMacValuePreview: params.checkMacValue
      ? maskCheckMacValue(params.checkMacValue)
      : '(mock mode: not generated)',
    encodedCheckMacSourcePresent: Boolean(params.encodedCheckMacSourcePreview),
    responseKeys: summarizeObjectKeys(params.rawResponse),
  });
}

function buildMockResponse(merchantTradeNo: string): ParsedLogisticsResponse {
  const suffix = merchantTradeNo.slice(-10);

  return {
    ok: true,
    message: 'OK',
    data: {
      MerchantTradeNo: merchantTradeNo,
      RtnCode: '300',
      RtnMsg: 'MOCK_POST_OFFICE_CREATED',
      AllPayLogisticsID: `ECMOCK${suffix}`,
      LogisticsType: 'HOME',
      LogisticsSubType: 'POST',
      BookingNote: `POSTMOCK${suffix}`,
    },
  };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    const mode = resolvePostOfficeMode();
    if (!mode) {
      return jsonError(
        500,
        'ECPAY_POST_OFFICE_MODE_INVALID',
        '伺服器設定錯誤：ECPAY_POST_OFFICE_MODE 僅支援 mock 或 real',
      );
    }

    const isRealMode = mode === 'real';
    if (isProduction && mode === 'mock') {
      return jsonError(
        500,
        'ECPAY_POST_OFFICE_MOCK_NOT_ALLOWED_IN_PRODUCTION',
        '正式環境不可使用綠界郵局一般宅配 mock 模式，請設定 ECPAY_POST_OFFICE_MODE=real',
      );
    }

    const order = await prisma.order.findFirst({
      where: { id: params.id, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        shippingMethod: true,
        shippingAddress: true,
        totalAmount: true,
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
        recipient: {
          select: {
            name: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            district: true,
            postalCode: true,
          },
        },
        items: {
          select: {
            productName: true,
            quantity: true,
          },
        },
        shipments: {
          where: { provider: PROVIDER },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!order) {
      return jsonError(404, 'ORDER_NOT_FOUND', '找不到此訂單');
    }

    if (order.shipments.length > 0) {
      return jsonError(409, 'ECPAY_POST_OFFICE_SHIPMENT_EXISTS', '已建立綠界郵局一般宅配物流單');
    }

    const missingEnv = isRealMode ? missingRealModeEnv() : [];
    if (missingEnv.length > 0) {
      return jsonError(
        500,
        'ENV_MISSING',
        `伺服器設定錯誤：缺少綠界郵局一般宅配環境變數 ${missingEnv.join(', ')}`,
      );
    }

    const merchantId = readEnv('ECPAY_MERCHANT_ID') || '2000132';
    const hashKey = readEnv('ECPAY_HASH_KEY') || '5294y06JbISpM5x9';
    const hashIV = readEnv('ECPAY_HASH_IV') || 'v77hoKGq4kWxNNIS';
    const logisticsApiUrl = readEnv('ECPAY_LOGISTICS_API_URL') || 'https://logistics-stage.ecpay.com.tw/Express/Create';
    const configuredServerReplyUrl = readEnv('ECPAY_LOGISTICS_SERVER_REPLY_URL');
    const apiBaseUrl = readEnv('API_BASE_URL').replace(/\/$/, '');
    const serverReplyUrl = configuredServerReplyUrl || (apiBaseUrl ? `${apiBaseUrl}/api/orders/logistics-webhook` : '');

    if (isRealMode && !serverReplyUrl) {
      return jsonError(500, 'ENV_MISSING', '伺服器設定錯誤：缺少綠界物流通知網址');
    }

    const rawRecipientName = order.recipient?.name || order.user?.name || '';
    const recipientPhone = normalizePhone(order.recipient?.phone || order.user?.phone || '');
    const rawRecipientPostalCode = order.recipient?.postalCode || '';
    const rawRecipientCity = order.recipient?.city || '';
    const rawRecipientDistrict = order.recipient?.district || '';
    const rawRecipientAddress = order.recipient?.address || order.shippingAddress || '';
    const recipientAddress = sanitizeAddress(rawRecipientAddress);
    const recipientEmail = order.recipient?.email || order.user?.email || null;
    const parsedRecipientAddress = recipientAddress ? parseTaiwanAddress(recipientAddress) : null;
    const receiverCity = rawRecipientCity || parsedRecipientAddress?.city || '';
    const receiverDistrict = rawRecipientDistrict || parsedRecipientAddress?.district || '';
    const receiverZipCode = resolveZipCode({
      postalCode: rawRecipientPostalCode,
      city: receiverCity,
      district: receiverDistrict,
      address: recipientAddress,
      allowDefaultFallback: !isRealMode,
    });
    const receiverAddress = sanitizeAddress(
      buildEcpayReceiverAddress({
        city: receiverCity,
        district: receiverDistrict,
        postalCode: receiverZipCode,
        address: recipientAddress,
      }),
    );
    const amount = Math.round(toNumber(order.totalAmount));

    const fieldValidation = validateEcpayPostOfficeFields({
      receiverName: rawRecipientName,
      receiverPhone: recipientPhone,
      postalCode: receiverZipCode,
      city: receiverCity,
      district: receiverDistrict,
      address: receiverAddress,
      goodsAmount: amount,
    });
    if (!fieldValidation.valid || !fieldValidation.normalizedName) {
      return jsonError(
        400,
        'ECPAY_POST_OFFICE_FIELD_INVALID',
        fieldValidation.message || '綠界郵局一般宅配物流單欄位驗證失敗',
      );
    }
    const recipientName = fieldValidation.normalizedName;

    const senderName = sanitizeName(readEnv('ECPAY_LOGISTICS_SENDER_NAME') || readEnv('SENDER_NAME'));
    const senderCellPhone = normalizePhone(readEnv('ECPAY_LOGISTICS_SENDER_PHONE') || readEnv('SENDER_PHONE'));
    const senderZipCode = sanitizeZipCode(readEnv('ECPAY_LOGISTICS_SENDER_ZIP_CODE'));
    const senderAddress = sanitizeAddress(readEnv('ECPAY_LOGISTICS_SENDER_ADDRESS'));

    if (!senderName || !senderCellPhone || !senderZipCode || !senderAddress) {
      return jsonError(500, 'ENV_MISSING', '伺服器設定錯誤：缺少綠界物流寄件人資料');
    }

    const weight = Number(readEnv('ECPAY_POST_OFFICE_DEFAULT_GOODS_WEIGHT') || '1');
    if (!Number.isFinite(weight) || weight <= 0 || weight > 20) {
      return jsonError(
        500,
        'GOODS_WEIGHT_CONFIG_INVALID',
        '伺服器設定錯誤：綠界郵局一般宅配商品重量設定不合法',
      );
    }

    const merchantTradeNo = buildMerchantTradeNo();
    const goodsName = sanitizeGoodsName(
      order.items.map((item) => `${item.productName}x${item.quantity}`).join(',') || '商品一批',
    ) || '商品一批';

    const ecpayParams: Record<string, string> = {
      MerchantID: merchantId,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: formatEcpayDate(),
      LogisticsType: 'HOME',
      LogisticsSubType: 'POST',
      GoodsAmount: String(amount),
      GoodsName: goodsName,
      GoodsWeight: weight.toFixed(3).replace(/\.?0+$/, ''),
      SenderName: senderName,
      SenderPhone: senderCellPhone,
      SenderZipCode: senderZipCode,
      SenderAddress: senderAddress,
      ReceiverName: recipientName,
      ReceiverPhone: recipientPhone,
      ReceiverZipCode: receiverZipCode,
      ReceiverAddress: receiverAddress,
      ReceiverEmail: recipientEmail || '',
      Temperature: '0001',
      ServerReplyURL: serverReplyUrl,
    };
    const recipientDebug = {
      rawPostalCode: rawRecipientPostalCode || null,
      rawCity: rawRecipientCity || null,
      rawDistrict: rawRecipientDistrict || null,
      rawAddress: rawRecipientAddress || null,
      finalReceiverAddress: receiverAddress,
    };

    let parsed: ParsedLogisticsResponse;

    if (!isRealMode) {
      parsed = buildMockResponse(merchantTradeNo);
      logEcpayPostOfficeDebug({
        mode,
        logisticsApiUrl,
        merchantId,
        payload: ecpayParams,
        recipientDebug,
        encodedCheckMacSourcePreview: buildLogisticsCheckMacEncodedSource(ecpayParams, '***', '***'),
        rawResponse: parsed.data,
      });
    } else {
      let checkMacValue = '';

      try {
        checkMacValue = generateLogisticsCheckMacValue(ecpayParams, hashKey, hashIV);
      } catch (err) {
        console.error(
          '[POST /api/orders/[id]/ecpay-post-office] 綠界物流 CheckMacValue 生成失敗:',
          err instanceof Error ? err.message : err,
        );
        return jsonError(
          500,
          'ECPAY_LOGISTICS_CHECKMAC_ERROR',
          '綠界物流 CheckMacValue 生成失敗，請聯絡系統管理員',
        );
      }

      logEcpayPostOfficeDebug({
        mode,
        logisticsApiUrl,
        merchantId,
        payload: ecpayParams,
        recipientDebug,
        checkMacValue,
        encodedCheckMacSourcePreview: buildLogisticsCheckMacEncodedSource(ecpayParams, '***', '***'),
      });

      const postParams = {
        ...ecpayParams,
        CheckMacValue: checkMacValue,
      };

      let responseText = '';
      try {
        const res = await fetch(logisticsApiUrl, {
          method: 'POST',
          headers: {
            Accept: 'text/html',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(postParams).toString(),
        });

        responseText = await res.text();
        logEcpayPostOfficeDebug({
          mode,
          logisticsApiUrl,
          merchantId,
          payload: ecpayParams,
          recipientDebug,
          checkMacValue,
          encodedCheckMacSourcePreview: buildLogisticsCheckMacEncodedSource(ecpayParams, '***', '***'),
          rawResponse: responseText,
        });
      } catch (err) {
        console.error(
          '[POST /api/orders/[id]/ecpay-post-office] 呼叫綠界物流 API 失敗:',
          err instanceof Error ? err.message : err,
        );
        return jsonError(502, 'ECPAY_LOGISTICS_GATEWAY_ERROR', '無法連線綠界物流系統，請稍後再試');
      }

      parsed = parseLogisticsResponse(responseText);
    }

    if (!parsed.ok) {
      return jsonError(400, 'ECPAY_POST_OFFICE_CREATE_FAILED', `綠界郵局一般宅配物流單建立失敗：${parsed.message}`);
    }

    const providerShipmentNo = parsed.data.AllPayLogisticsID || null;
    const trackingNumber = parsed.data.BookingNote || parsed.data.AllPayLogisticsID || null;

    if (!providerShipmentNo) {
      return jsonError(
        502,
        'ECPAY_POST_OFFICE_RESPONSE_INVALID',
        '綠界郵局一般宅配物流單建立成功但回應缺少 AllPayLogisticsID，請聯絡系統管理員',
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const shipment = await upsertShipmentRecord({
        client: tx,
        orderId: order.id,
        provider: PROVIDER,
        shippingMethod: PROVIDER,
        status: 'CREATED',
        trackingNumber,
        providerShipmentNo,
        recipientName,
        recipientPhone,
        recipientEmail,
        recipientAddress: receiverAddress,
        rawResponse: sanitizeRawResponse({
          MerchantTradeNo: merchantTradeNo,
          ...parsed.data,
        }),
      });

      await createShipmentEvent({
        client: tx,
        shipmentId: shipment.id,
        orderId: order.id,
        eventType: 'ECPAY_POST_OFFICE_CREATED',
        status: 'CREATED',
        message: '綠界中華郵政一般宅配物流單已建立',
        metadata: {
          provider: PROVIDER,
          trackingNumber,
          providerShipmentNo,
        } satisfies Prisma.InputJsonObject,
      });

      await createAdminAuditLog({
        client: tx,
        req,
        actor: guard.user,
        action: 'ORDER_ECPAY_POST_OFFICE_LOGISTICS_CREATE',
        resourceType: 'ORDER',
        resourceId: order.id,
        description: `建立訂單 ${order.orderNumber} 綠界中華郵政一般宅配物流單`,
        metadata: {
          shipmentId: shipment.id,
          provider: PROVIDER,
          trackingNumber,
          providerShipmentNo,
        } satisfies Prisma.InputJsonObject,
      });

      return {
        shipmentId: shipment.id,
        provider: PROVIDER,
        status: 'CREATED',
        trackingNumber,
        providerShipmentNo,
        mock: !isRealMode,
      };
    });

    return jsonOk(result);
  } catch (err) {
    console.error(
      '[POST /api/orders/[id]/ecpay-post-office] error:',
      err instanceof Error ? err.message : err,
    );
    return jsonError(500, 'INTERNAL_ERROR', '建立綠界郵局一般宅配物流單失敗，請稍後再試');
  }
}
