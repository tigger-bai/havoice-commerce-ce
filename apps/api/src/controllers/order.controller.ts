// apps/api/src/controllers/order.controller.ts
import { type Request, type Response, type NextFunction } from 'express';
import { prisma, type Prisma } from '@havoice/database';
import {
  CreateOrderSchema,
  generateCheckMacValue,
  generateLogisticsCheckMacValue,
  type OrderEmailData,
} from '@havoice/shared';
import { OrderService } from '../services/order.service';
import { LogisticsService } from '../services/logistics.service';
import { sendPaymentConfirmedEmail } from '../utils/mailer';
import crypto from 'crypto';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'EDITOR']);

function getAuthenticatedUserId(req: Request): string | undefined {
  const user = (req as any).user;
  return user?.id || user?.userId;
}

function isAdminUser(req: Request): boolean {
  const role = (req as any).user?.role;
  return typeof role === 'string' && ADMIN_ROLES.has(role);
}

function resolveOrderEmailContact(
  recipient: { name: string | null; email: string | null } | null,
  notes: string | null,
  user: { name: string | null; email: string | null } | null,
): { customerName: string; recipientEmail: string } {
  let customerName = recipient?.name?.trim() || '';
  let recipientEmail = recipient?.email?.trim() || '';

  if (notes && (!customerName || !recipientEmail)) {
    try {
      const parsed = JSON.parse(notes) as Record<string, unknown>;
      const noteRecipientName =
        typeof parsed.recipientName === 'string' ? parsed.recipientName.trim() : '';
      const noteRecipientEmail =
        typeof parsed.recipientEmail === 'string' ? parsed.recipientEmail.trim() : '';

      if (!customerName && noteRecipientName) customerName = noteRecipientName;
      if (!recipientEmail && noteRecipientEmail) recipientEmail = noteRecipientEmail;
    } catch {
      // notes 可能是舊資料純文字，解析失敗時改用會員帳號資料。
    }
  }

  if (!customerName) customerName = user?.name?.trim() || '';
  if (!recipientEmail) recipientEmail = user?.email?.trim() || '';

  return { customerName, recipientEmail };
}

/**
 * 非同步寄送「付款成功確認信」。
 *
 * 重新撈取訂單明細與會員 email，組裝後寄出。
 * 本函式永不往外拋錯，避免影響 ECPay webhook 必須回傳 1|OK 的主流程。
 */
async function notifyPaymentConfirmed(orderNumber: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        recipient: {
          select: {
            name: true,
            email: true,
            address: true,
          },
        },
        items: true,
      },
    });

    if (!order) {
      console.error(
        `[notifyPaymentConfirmed] 找不到訂單，orderNumber=${maskIdentifier(orderNumber)}`,
      );
      return;
    }

    const { customerName, recipientEmail } = resolveOrderEmailContact(
      order.recipient,
      order.notes,
      order.user,
    );

    if (!recipientEmail) {
      console.error(
        `[notifyPaymentConfirmed] 找不到收件信箱，orderNumber=${maskIdentifier(orderNumber)}`,
      );
      return;
    }

    const data: OrderEmailData = {
      orderNumber: order.orderNumber,
      customerName,
      totalAmount: Number(order.totalAmount),
      shippingAddress: order.recipient?.address || order.shippingAddress,
      items: order.items.map((item) => ({
        productName: item.productName,
        productPrice: Number(item.productPrice),
        quantity: item.quantity,
      })),
    };

    await sendPaymentConfirmedEmail(recipientEmail, data);
  } catch (err) {
    console.error('[notifyPaymentConfirmed] 寄信流程發生錯誤:', err);
  }
}

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

const isProduction = process.env.NODE_ENV === 'production';

function getEnvWithDevFallback(name: string, devFallback: string): string {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (!isProduction) {
    return devFallback;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

function getUrlOrigin(value: string): string {
  return new URL(value).origin;
}

function addUrlOrigin(origins: Set<string>, rawUrl: string | undefined): void {
  if (!rawUrl?.trim()) return;

  try {
    origins.add(getUrlOrigin(rawUrl.trim()));
  } catch {
    if (!isProduction) {
      console.warn(`[ECPay CVS] ECPAY_MAP_URL 格式無效：${rawUrl}`);
    }
  }
}

function getAllowedEcpayCallbackOrigins(): Set<string> {
  const origins = new Set(['https://logistics.ecpay.com.tw']);

  if (!isProduction) {
    origins.add('https://logistics-stage.ecpay.com.tw');
  }

  addUrlOrigin(origins, process.env.ECPAY_MAP_URL);

  return origins;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function payloadString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function maskIdentifier(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '[none]';
  if (text.length <= 6) return `${text.slice(0, 1)}***`;
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function normalizeWebhookPayload(payload: Record<string, unknown>): Prisma.InputJsonObject {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(payload)) {
    normalized[key] = String(value ?? '');
  }

  return normalized;
}

function sanitizePaymentPayload(payload: Record<string, unknown>): Prisma.InputJsonObject {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'CheckMacValue') continue;
    normalized[key] = String(value ?? '');
  }

  return normalized;
}

function sanitizeLogisticsPayload(payload: Record<string, unknown>): Prisma.InputJsonObject {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (key.toLowerCase() === 'checkmacvalue') continue;
    normalized[key] = String(value ?? '');
  }

  return normalized;
}

function normalizeLogisticsCheckMacPayload(
  payload: Record<string, unknown>,
  options?: { omitEmptyValues?: boolean },
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(payload)) {
    const text = String(value ?? '');
    if (options?.omitEmptyValues && key.toLowerCase() !== 'checkmacvalue' && text === '') continue;
    normalized[key] = text;
  }

  return normalized;
}

type LogisticsHashConfig = {
  source: 'ECPAY_LOGISTICS_HASH' | 'ECPAY_HASH';
  hashKey: string;
  hashIV: string;
};

type LogisticsCheckMacPayloadVariant = {
  name: string;
  payload: Record<string, string>;
};

type LogisticsCheckMacCandidate = {
  variant: string;
  sourceStringPreview: string;
  calculatedCheckMacValue: string;
  calculatedCheckMacValuePreview: string;
  matched: boolean;
};

function getLogisticsHashConfigs(): LogisticsHashConfig[] {
  const configs: LogisticsHashConfig[] = [];
  const logisticsHashKey = (process.env.ECPAY_LOGISTICS_HASH_KEY || '').trim();
  const logisticsHashIV = (process.env.ECPAY_LOGISTICS_HASH_IV || '').trim();
  const ecpayHashKey = (process.env.ECPAY_HASH_KEY || '').trim();
  const ecpayHashIV = (process.env.ECPAY_HASH_IV || '').trim();

  if (logisticsHashKey && logisticsHashIV) {
    configs.push({
      source: 'ECPAY_LOGISTICS_HASH',
      hashKey: logisticsHashKey,
      hashIV: logisticsHashIV,
    });
  }

  const isDuplicate =
    logisticsHashKey &&
    logisticsHashIV &&
    logisticsHashKey === ecpayHashKey &&
    logisticsHashIV === ecpayHashIV;

  if (ecpayHashKey && ecpayHashIV && !isDuplicate) {
    configs.push({
      source: 'ECPAY_HASH',
      hashKey: ecpayHashKey,
      hashIV: ecpayHashIV,
    });
  }

  return configs;
}

function maskCheckMacValue(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= 6) return '***';
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function maskSecretPreview(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (text.length <= 6) return `${text.slice(0, 1)}***${text.slice(-1)}`;
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function readPayloadCheckMacValue(payload: Record<string, unknown>): unknown {
  return Object.entries(payload).find(([key]) => key.toLowerCase() === 'checkmacvalue')?.[1];
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

function getLogisticsHashEnvDebug(): Record<string, { exists: boolean; preview: string | null }> {
  const envNames = [
    'ECPAY_LOGISTICS_HASH_KEY',
    'ECPAY_LOGISTICS_HASH_IV',
    'ECPAY_HASH_KEY',
    'ECPAY_HASH_IV',
  ];

  return Object.fromEntries(
    envNames.map((name) => {
      const value = (process.env[name] || '').trim();
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

function md5Upper(value: string): string {
  return crypto.createHash('md5').update(value).digest('hex').toUpperCase();
}

function getReceivedLogisticsCheckMacValue(payload: Record<string, unknown>): string {
  return String(readPayloadCheckMacValue(payload) ?? '').trim().toUpperCase();
}

function getSortedLogisticsCheckMacEntries(payload: Record<string, string>): Array<[string, string]> {
  return sortPayloadKeys(Object.keys(payload).filter((key) => key.toLowerCase() !== 'checkmacvalue')).map((key) => [
    key,
    payload[key],
  ]);
}

function buildRawCheckMacSourceFromEntries(
  entries: Array<[string, string]>,
  hashKey: string,
  hashIV: string,
): string {
  const payloadSource = entries.map(([key, value]) => `${key}=${value}`).join('&');
  return `HashKey=${hashKey}&${payloadSource}&HashIV=${hashIV}`;
}

function buildUrlSearchParamsSourceFromEntries(
  entries: Array<[string, string]>,
  hashKey: string,
  hashIV: string,
): string {
  const params = new URLSearchParams();
  params.append('HashKey', hashKey);
  for (const [key, value] of entries) {
    params.append(key, value);
  }
  params.append('HashIV', hashIV);
  return params.toString();
}

function replaceReceiverAddressSpaces(payload: Record<string, string>): Record<string, string> {
  const next = { ...payload };
  const receiverAddressKey = Object.keys(next).find((key) => key.toLowerCase() === 'receiveraddress');
  if (receiverAddressKey) {
    next[receiverAddressKey] = next[receiverAddressKey].replace(/\s+/g, '');
  }
  return next;
}

function getLogisticsCheckMacPayloadVariants(payload: Record<string, unknown>): LogisticsCheckMacPayloadVariant[] {
  const asReceived = normalizeLogisticsCheckMacPayload(payload);
  const receiverAddressNoSpaces = replaceReceiverAddressSpaces(asReceived);
  const variants = [
    {
      name: 'as-received',
      payload: asReceived,
    },
    {
      name: 'omit-empty-values',
      payload: normalizeLogisticsCheckMacPayload(payload, { omitEmptyValues: true }),
    },
    {
      name: 'receiver-address-no-spaces',
      payload: receiverAddressNoSpaces,
    },
    {
      name: 'receiver-address-no-spaces-omit-empty-values',
      payload: Object.fromEntries(
        Object.entries(receiverAddressNoSpaces).filter(
          ([key, value]) => key.toLowerCase() === 'checkmacvalue' || value !== '',
        ),
      ),
    },
  ];

  const seen = new Set<string>();
  return variants.filter((variant) => {
    const signature = JSON.stringify(Object.entries(variant.payload).sort(([a], [b]) => a.localeCompare(b)));
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function buildLogisticsCheckMacCandidates(
  payload: Record<string, unknown>,
  hashKey: string,
  hashIV: string,
): LogisticsCheckMacCandidate[] {
  const receivedCheckMacValue = getReceivedLogisticsCheckMacValue(payload);
  const maskedHashKey = maskSecretPreview(hashKey) || '***';
  const maskedHashIV = maskSecretPreview(hashIV) || '***';
  const candidates: LogisticsCheckMacCandidate[] = [];

  for (const payloadVariant of getLogisticsCheckMacPayloadVariants(payload)) {
    const entries = getSortedLogisticsCheckMacEntries(payloadVariant.payload);
    const rawSource = buildRawCheckMacSourceFromEntries(entries, hashKey, hashIV);
    const rawSourcePreview = buildRawCheckMacSourceFromEntries(entries, maskedHashKey, maskedHashIV);
    const urlSearchParamsSource = buildUrlSearchParamsSourceFromEntries(entries, hashKey, hashIV);
    const urlSearchParamsSourcePreview = buildUrlSearchParamsSourceFromEntries(entries, maskedHashKey, maskedHashIV);

    const algorithmSources = [
      {
        name: 'shared-logistics-md5',
        sourceStringPreview: `${rawSourcePreview} [shared helper applies ECPay logistics .NET URL encode + lowercase]`,
        calculatedCheckMacValue: generateLogisticsCheckMacValue(payloadVariant.payload, hashKey, hashIV),
      },
      {
        name: 'raw-no-url-encode-md5',
        sourceStringPreview: rawSourcePreview,
        calculatedCheckMacValue: md5Upper(rawSource),
      },
      {
        name: 'urlsearchparams-encode-md5',
        sourceStringPreview: urlSearchParamsSourcePreview,
        calculatedCheckMacValue: md5Upper(urlSearchParamsSource),
      },
      {
        name: 'encodeuricomponent-lowercase-md5',
        sourceStringPreview: `encodeURIComponent(${rawSourcePreview}).toLowerCase()`,
        calculatedCheckMacValue: md5Upper(encodeURIComponent(rawSource).toLowerCase()),
      },
      {
        name: 'encodeuricomponent-originalcase-md5',
        sourceStringPreview: `encodeURIComponent(${rawSourcePreview})`,
        calculatedCheckMacValue: md5Upper(encodeURIComponent(rawSource)),
      },
    ];

    for (const algorithm of algorithmSources) {
      candidates.push({
        variant: `${payloadVariant.name}/${algorithm.name}`,
        sourceStringPreview: algorithm.sourceStringPreview,
        calculatedCheckMacValue: algorithm.calculatedCheckMacValue,
        calculatedCheckMacValuePreview: maskCheckMacValue(algorithm.calculatedCheckMacValue),
        matched: algorithm.calculatedCheckMacValue === receivedCheckMacValue,
      });
    }
  }

  return candidates;
}

function logLogisticsWebhookDebug(params: {
  payload: Record<string, unknown>;
  hashSources: string[];
  matchedHashSource?: string;
  matchedVariant?: string;
  attempts: Array<{
    source: string;
    variant: string;
    sourceStringPreview: string;
    calculatedCheckMacValue: string;
    calculatedCheckMacValuePreview: string;
    matched: boolean;
  }>;
  verified: boolean;
}): void {
  if (isProduction) return;

  const debugPayload = {
    hashEnv: getLogisticsHashEnvDebug(),
    payloadKeys: sortPayloadKeys(Object.keys(params.payload)),
    payloadFieldCount: Object.keys(params.payload).length,
    checkMacValuePresent: Boolean(readPayloadCheckMacValue(params.payload)),
    checkMacValuePreview: maskCheckMacValue(readPayloadCheckMacValue(params.payload)),
    hashSources: params.hashSources,
    matchedHashSource: params.matchedHashSource || null,
    matchedVariant: params.matchedVariant || null,
    candidates: params.attempts.map((attempt) => ({
      source: attempt.source,
      variant: attempt.variant,
      calculatedCheckMacValuePreview: attempt.calculatedCheckMacValuePreview,
      matched: attempt.matched,
    })),
    verified: params.verified,
  };

  console.info('[Logistics Webhook DEBUG]', debugPayload);
}

function verifyLogisticsWebhookCheckMac(
  payload: Record<string, unknown>,
  hashConfigs: LogisticsHashConfig[],
): {
  matched: boolean;
  source: LogisticsHashConfig['source'] | null;
  variant: string | null;
  attempts: Array<{
    source: LogisticsHashConfig['source'];
    variant: string;
    sourceStringPreview: string;
    calculatedCheckMacValue: string;
    calculatedCheckMacValuePreview: string;
    matched: boolean;
  }>;
} {
  const attempts: Array<{
    source: LogisticsHashConfig['source'];
    variant: string;
    sourceStringPreview: string;
    calculatedCheckMacValue: string;
    calculatedCheckMacValuePreview: string;
    matched: boolean;
  }> = [];

  for (const config of hashConfigs) {
    for (const candidate of buildLogisticsCheckMacCandidates(payload, config.hashKey, config.hashIV)) {
      attempts.push({
        source: config.source,
        variant: candidate.variant,
        sourceStringPreview: candidate.sourceStringPreview,
        calculatedCheckMacValue: candidate.calculatedCheckMacValue,
        calculatedCheckMacValuePreview: candidate.calculatedCheckMacValuePreview,
        matched: candidate.matched,
      });

      if (candidate.matched) {
        return { matched: true, source: config.source, variant: candidate.variant, attempts };
      }
    }
  }

  return { matched: false, source: null, variant: null, attempts };
}

function isEcpayPostOfficePayload(payload: Record<string, unknown>): boolean {
  return (
    payloadString(payload.LogisticsType)?.toUpperCase() === 'HOME' &&
    payloadString(payload.LogisticsSubType)?.toUpperCase() === 'POST'
  );
}

function mapEcpayPostOfficeStatus(payload: Record<string, unknown>): {
  mappedStatus: string | null;
  rawStatus: string;
  message: string;
} {
  const rtnCode = payloadString(payload.RtnCode);
  const rawStatus = [
    payloadString(payload.LogisticsStatus),
    payloadString(payload.LogisticsStatusName),
    rtnCode,
  ]
    .filter(Boolean)
    .join(' / ');
  const message = payloadString(payload.RtnMsg) || payloadString(payload.StatusMsg) || rawStatus || '綠界物流狀態通知';
  const text = `${rawStatus} ${message}`.trim();

  if (/取消/.test(text)) {
    return { mappedStatus: 'CANCELLED', rawStatus, message };
  }

  if (/已送達|配送完成|配達|送達|簽收/.test(text)) {
    return { mappedStatus: 'DELIVERED', rawStatus, message };
  }

  if (/配送失敗|失敗|退回|異常|拒收|遺失/.test(text)) {
    return { mappedStatus: 'FAILED', rawStatus, message };
  }

  if (/配送中|運送中|運輸中|出貨|轉運/.test(text)) {
    return { mappedStatus: 'IN_TRANSIT', rawStatus, message };
  }

  if (rtnCode === '300' || /已建立|已接單|已收件|收件|接單|建立/.test(text)) {
    return { mappedStatus: 'ACCEPTED', rawStatus, message };
  }

  return { mappedStatus: null, rawStatus, message };
}

function canUpdateShipmentStatus(currentStatus: string, nextStatus: string): boolean {
  if (currentStatus === nextStatus) return false;
  if (currentStatus === 'DELIVERED' || currentStatus === 'CANCELLED') return false;
  return true;
}

function resolveLinkedOrderStatus(orderStatus: string, shipmentStatus: string): 'SHIPPED' | 'DELIVERED' | null {
  if (shipmentStatus === 'IN_TRANSIT' && orderStatus === 'PAID') {
    return 'SHIPPED';
  }

  if (shipmentStatus === 'DELIVERED' && orderStatus === 'SHIPPED') {
    return 'DELIVERED';
  }

  return null;
}

function parseWebhookOrderNumber(merchantTradeNo: string | null, customField1: string | null): string {
  if (customField1) return customField1;
  return merchantTradeNo?.split('_')[0] || '';
}

function parseTradeAmount(payload: Record<string, unknown>): number | null {
  const rawAmount = payload.TradeAmt ?? payload.TradeAmount ?? payload.TotalAmount ?? payload.Amount;

  if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === '') {
    return null;
  }

  const amount = Number(rawAmount);
  return Number.isFinite(amount) ? amount : null;
}

function amountMatches(tradeAmount: number, orderAmount: unknown): boolean {
  const tradeAmountCents = Math.round(tradeAmount * 100);
  const orderAmountCents = Math.round(Number(orderAmount) * 100);
  return tradeAmountCents === orderAmountCents;
}

export class OrderController {
  /**
   * POST /api/orders
   * 建立新訂單。
   *
   * - COD：建立訂單，不產生綠界 payload
   * - ATM / CREDIT_CARD：建立訂單後回傳綠界 AIO payload
   */
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = CreateOrderSchema.parse(req.body);
      const userId = (req as any).user.id;

      const { order, ecpayPayload } = await OrderService.createOrder(validatedData, userId);

      return res.status(201).json({
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount,
          itemCount: order.items.length,
          items: order.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            productPrice: item.productPrice,
            quantity: item.quantity,
            subtotal: Number(item.productPrice) * item.quantity,
          })),
          createdAt: order.createdAt,
          ecpayPayload,
        },
        message: ecpayPayload ? '訂單建立成功，準備導向金流支付' : '訂單建立成功 (貨到付款)',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/orders/:id/repay
   * 針對尚未付款的線上支付訂單，重新產生綠界結帳 payload。
   */
  static async repay(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const { order, ecpayPayload } = await OrderService.buildRepayPayload(id, userId);

      return res.json({
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          ecpayPayload,
        },
        message: '已重新產生付款連結，準備導向金流支付',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/orders/cvs-map
   * 產生「綠界電子地圖」自動送出表單。
   */
  static cvsMap(req: Request, res: Response) {
    try {
      const MERCHANT_ID = getRequiredEnv('ECPAY_LOGISTICS_MERCHANT_ID');
      const API_URL = cleanBaseUrl(getRequiredEnv('API_BASE_URL'));

      const cvsTypeRaw = String(req.query.type || 'UNIMART').toUpperCase();
      const allowed = ['UNIMART', 'FAMI', 'HILIFE', 'OK'] as const;
      const cvsType = (allowed as readonly string[]).includes(cvsTypeRaw) ? cvsTypeRaw : 'UNIMART';

      const logisticsSubType =
        cvsType === 'UNIMART'
          ? 'UNIMART'
          : cvsType === 'FAMI'
            ? 'FAMI'
            : cvsType === 'HILIFE'
              ? 'HILIFE'
              : 'OK';

      const params: Record<string, string> = {
        MerchantID: MERCHANT_ID,
        MerchantTradeNo: `CVS${Date.now()}`,
        LogisticsType: 'CVS',
        LogisticsSubType: logisticsSubType,
        IsCollection: 'N',
        ServerReplyURL: `${API_URL}/api/orders/cvs-callback`,
        Device: '0',
      };

      const ECPAY_MAP_URL = getEnvWithDevFallback(
        'ECPAY_MAP_URL',
        'https://logistics-stage.ecpay.com.tw/Express/map',
      );
      const ecpayMapOrigin = getUrlOrigin(ECPAY_MAP_URL);

      const inputs = Object.entries(params)
        .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}" />`)
        .join('\n');

      const nonce = crypto.randomBytes(16).toString('base64');

      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          `script-src 'self' 'nonce-${nonce}' ${ecpayMapOrigin}`,
          `script-src-elem 'self' 'nonce-${nonce}' ${ecpayMapOrigin}`,
          `form-action 'self' ${ecpayMapOrigin}`,
        ].join('; '),
      );

      const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>正在前往門市地圖...</title>
</head>
<body>
  <form id="ecpayCvsForm" method="post" action="${ECPAY_MAP_URL}">
    ${inputs}
  </form>
  <script nonce="${nonce}">
    setTimeout(function () {
      document.getElementById('ecpayCvsForm').submit();
    }, 50);
  </script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    } catch (error) {
      console.error('[CVS Map] 產生電子地圖表單失敗:', error);
      return res.status(500).send('CVS map configuration error');
    }
  }

  /**
   * POST /api/orders/cvs-callback
   * 接住綠界電子地圖回拋的門市資訊。
   */
  static cvsCallback(req: Request, res: Response) {
    const origin = req.headers.origin;
    const normalizedOrigin = origin ? cleanBaseUrl(origin) : '';

    if (normalizedOrigin && getAllowedEcpayCallbackOrigins().has(normalizedOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', normalizedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    const body = req.body || {};

    const store = {
      cvsStoreId: String(body.CVSStoreID || ''),
      cvsStoreName: String(body.CVSStoreName || ''),
      cvsAddress: String(body.CVSAddress || ''),
      cvsSubType: String(body.LogisticsSubType || ''),
    };

    const WEB_URL = cleanBaseUrl(getEnvWithDevFallback('WEB_BASE_URL', 'http://localhost:3000'));
    const payloadJson = JSON.stringify(store).replace(/</g, '\\u003c');

    const callbackNonce = crypto.randomBytes(16).toString('base64');

    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${callbackNonce}'`,
        `script-src-elem 'self' 'nonce-${callbackNonce}'`,
      ].join('; '),
    );

    const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>門市選擇完成</title>
</head>
<body style="font-family:sans-serif;text-align:center;padding:40px;">
  <p>門市選擇完成，正在返回結帳頁...</p>
  <script nonce="${callbackNonce}">
    (function () {
      var data = Object.assign({ source: 'ecpay-cvs-map' }, ${payloadJson});

      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(data, '${WEB_URL}');
          window.close();
          return;
        }
      } catch (e) {
        console.error('[CVS Callback] postMessage failed:', e);
      }

      var qs = new URLSearchParams(${payloadJson}).toString();
      window.location.href = '${WEB_URL}/checkout?' + qs;
    })();
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }

  /**
   * POST /api/orders/:id/logistics/create
   * 後台一鍵產生綠界超商寄件代碼。
   */
  static async createLogistics(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await LogisticsService.createC2CShipment(id, getAuthenticatedUserId(req));

      return res.json({
        success: true,
        data: result,
        message: '交貨便寄件代碼已成功產生，訂單狀態已更新為已出貨',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/orders/logistics-webhook
   * 接收綠界物流狀態變更背景通知。
   *
   * 會先驗證綠界物流 MD5 CheckMacValue；驗證失敗時不更新任何資料。
   */
  static async logisticsWebhook(req: Request, res: Response) {
    try {
      const body = req.body || {};
      const payload = body as Record<string, unknown>;
      const hashConfigs = getLogisticsHashConfigs();

      if (hashConfigs.length === 0) {
        console.error('[Logistics Webhook] 缺少物流 CheckMacValue 驗證設定');
        return res.status(500).send('0|LogisticsCheckMacConfigMissing');
      }

      const verification = verifyLogisticsWebhookCheckMac(payload, hashConfigs);
      logLogisticsWebhookDebug({
        payload,
        hashSources: hashConfigs.map((config) => config.source),
        matchedHashSource: verification.source || undefined,
        matchedVariant: verification.variant || undefined,
        attempts: verification.attempts,
        verified: verification.matched,
      });

      if (!verification.matched) {
        console.error('[Logistics Webhook] CheckMacValue 驗證失敗');
        return res.status(400).send('0|CheckMacValueVerifyFail');
      }

      const logisticsId = String(body.AllPayLogisticsID || body.CVSPaymentNo || '');
      const rtnCode = String(body.RtnCode || '');
      const merchantTradeNo = payloadString(body.MerchantTradeNo);
      const isPostOffice = isEcpayPostOfficePayload(payload);

      console.log('[Logistics Webhook] 收到物流狀態通知', {
        logisticsId: maskIdentifier(logisticsId),
        merchantTradeNo: maskIdentifier(merchantTradeNo),
        rtnCode,
      });

      if (isPostOffice) {
        const { mappedStatus, rawStatus, message } = mapEcpayPostOfficeStatus(payload);

        if (!logisticsId && !merchantTradeNo) {
          return res.status(400).send('0|LogisticsIdentityMissing');
        }

        const shipment = await prisma.shipment.findFirst({
          where: {
            provider: 'EC_PAY_POST_OFFICE',
            OR: [
              ...(logisticsId
                ? [
                    { providerShipmentNo: logisticsId },
                    { trackingNumber: logisticsId },
                  ]
                : []),
              ...(merchantTradeNo
                ? [
                    {
                      rawResponse: {
                        path: '$.MerchantTradeNo',
                        equals: merchantTradeNo,
                      },
                    },
                  ]
                : []),
            ],
          },
          select: {
            id: true,
            orderId: true,
            status: true,
            order: {
              select: {
                id: true,
                status: true,
                orderNumber: true,
              },
            },
          },
        });

        if (!shipment) {
          console.warn(
            '[Logistics Webhook] 已驗證但暫時找不到 EC_PAY_POST_OFFICE Shipment，可能是綠界通知早於本機交易提交。',
            {
              logisticsId: maskIdentifier(logisticsId),
              merchantTradeNo: maskIdentifier(merchantTradeNo),
              rtnCode,
            },
          );
          return res.status(200).send('1|OK');
        }

        const eventStatus = mappedStatus || rawStatus || rtnCode || null;
        const isDuplicateTerminalEvent =
          Boolean(mappedStatus) &&
          shipment.status === mappedStatus &&
          ['DELIVERED', 'FAILED', 'CANCELLED'].includes(mappedStatus);

        if (!isDuplicateTerminalEvent) {
          const shouldUpdateShipment = Boolean(mappedStatus) && canUpdateShipmentStatus(shipment.status, mappedStatus!);
          const nextOrderStatus = mappedStatus
            ? resolveLinkedOrderStatus(shipment.order.status, mappedStatus)
            : null;

          await prisma.$transaction(async (tx) => {
            await tx.shipment.update({
              where: { id: shipment.id },
              data: shouldUpdateShipment ? { status: mappedStatus! } : { updatedAt: new Date() },
              select: { id: true },
            });

            await tx.shipmentEvent.create({
              data: {
                shipmentId: shipment.id,
                orderId: shipment.orderId,
                eventType: 'ECPAY_POST_OFFICE_STATUS_UPDATED',
                status: eventStatus,
                message,
                metadata: {
                  ...sanitizeLogisticsPayload(payload),
                  mappedStatus: mappedStatus || '',
                  rawStatus,
                } satisfies Prisma.InputJsonObject,
              },
            });

            if (nextOrderStatus) {
              await tx.order.update({
                where: { id: shipment.orderId },
                data: { status: nextOrderStatus },
                select: { id: true },
              });

              await tx.orderStatusLog.create({
                data: {
                  orderId: shipment.orderId,
                  fromStatus: shipment.order.status,
                  toStatus: nextOrderStatus,
                  actorType: 'WEBHOOK',
                  actorId: null,
                  reason: 'ECPAY_POST_OFFICE_STATUS_SYNC',
                  metadata: {
                    shipmentId: shipment.id,
                    provider: 'EC_PAY_POST_OFFICE',
                    oldShipmentStatus: shipment.status,
                    newShipmentStatus: mappedStatus,
                    logisticsId,
                    merchantTradeNo,
                  } satisfies Prisma.InputJsonObject,
                },
              });
            }
          });
        }

        return res.status(200).send('1|OK');
      }

      if (logisticsId) {
        try {
          await prisma.order.updateMany({
            where: {
              shippingTrackingNumber: logisticsId,
            },
            data: {
              trackingNumber: logisticsId,
            },
          });
        } catch (error) {
          console.error('[Logistics Webhook] 更新物流狀態失敗，已忽略:', error);
        }
      }

      return res.status(200).send('1|OK');
    } catch (error) {
      console.error('[Logistics Webhook] 處理錯誤，仍回傳 1|OK:', error);
      return res.status(200).send('1|OK');
    }
  }

  /**
   * GET /api/orders/:id
   * 查詢單一訂單詳情。
   */
  static async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const order = await OrderService.findById(id);
      const userId = getAuthenticatedUserId(req);

      if (!isAdminUser(req) && order.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            message: '無權查看此訂單',
            code: 'FORBIDDEN',
          },
        });
      }

      return res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/orders
   * 查詢所有訂單清單。
   */
  static async findAll(req: Request, res: Response, next: NextFunction) {
    try {
      const orders = await OrderService.findAllForAdmin();

      return res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/orders/my
   * 查詢當前登入使用者的歷史訂單列表。
   */
  static async findMyOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;

      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;

      const result = await OrderService.findByUserId(userId, page, limit);

      return res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/orders/ecpay-webhook
   * 接收綠界金流背景付款結果通知。
   */
  static async ecpayWebhook(req: Request, res: Response) {
    try {
      const payload = (req.body || {}) as Record<string, unknown>;
      const merchantTradeNo = payloadString(payload.MerchantTradeNo);
      const providerTradeNo = payloadString(payload.TradeNo);
      const rtnCode = payloadString(payload.RtnCode) || '';
      const rtnMsg = payloadString(payload.RtnMsg);
      const ecpayCheckMacValue = String(payload.CheckMacValue || '').toUpperCase();
      const orderNumber = parseWebhookOrderNumber(
        merchantTradeNo,
        payloadString(payload.CustomField1),
      );

      const order = orderNumber
        ? await prisma.order.findUnique({
            where: {
              orderNumber,
            },
          })
        : null;

      const paymentTransaction = merchantTradeNo
        ? await prisma.paymentTransaction.findUnique({
            where: {
              merchantTradeNo,
            },
          })
        : null;

      const paymentEvent = await prisma.paymentEvent.create({
        data: {
          orderId: order?.id ?? null,
          paymentTransactionId: paymentTransaction?.id ?? null,
          merchantTradeNo,
          providerTradeNo,
          rtnCode: rtnCode || null,
          rtnMsg,
          checkMacValue: ecpayCheckMacValue || null,
          checkMacMatched: false,
          processed: false,
          rawPayload: normalizeWebhookPayload(payload),
        },
      });

      if (!isProduction) {
        console.log('========== ECPAY WEBHOOK ==========');
        console.log('[ECPay Webhook] MerchantTradeNo =', maskIdentifier(merchantTradeNo));
        console.log('[ECPay Webhook] RtnCode =', rtnCode);
        console.log('[ECPay Webhook] hasRtnMsg =', Boolean(rtnMsg));
        console.log('[ECPay Webhook] CustomField1 =', maskIdentifier(payload.CustomField1));
        console.log('[ECPay Webhook] parsed orderNumber =', maskIdentifier(orderNumber));
        console.log('===================================');
      }

      if (!payload || Object.keys(payload).length === 0) {
        console.error('🚨 [ECPay Webhook] 收到空 payload，請檢查 Express urlencoded middleware');
        await prisma.paymentEvent.update({
          where: {
            id: paymentEvent.id,
          },
          data: {
            errorMessage: 'EmptyPayload',
          },
        });
        return res.status(400).send('0|EmptyPayload');
      }

      if (typeof generateCheckMacValue !== 'function') {
        console.error(
          '🚨 [ECPay Webhook] generateCheckMacValue 不是 function，請檢查 @havoice/shared export',
        );
        await prisma.paymentEvent.update({
          where: {
            id: paymentEvent.id,
          },
          data: {
            errorMessage: 'CheckMacFunctionMissing',
          },
        });
        return res.status(500).send('0|CheckMacFunctionMissing');
      }

      const HASH_KEY = process.env.ECPAY_HASH_KEY;
      const HASH_IV = process.env.ECPAY_HASH_IV;

      if (!HASH_KEY || !HASH_IV) {
        console.error('🚨 [ECPay Webhook] 缺少 ECPAY_HASH_KEY 或 ECPAY_HASH_IV');
        await prisma.paymentEvent.update({
          where: {
            id: paymentEvent.id,
          },
          data: {
            errorMessage: 'EcpayEnvMissing',
          },
        });
        return res.status(500).send('0|EcpayEnvMissing');
      }

      const verifyParams: Record<string, string> = {};

      for (const [key, value] of Object.entries(payload)) {
        if (key === 'CheckMacValue') continue;
        verifyParams[key] = String(value ?? '');
      }

      const calculatedMac = generateCheckMacValue(verifyParams, HASH_KEY, HASH_IV).toUpperCase();

      if (ecpayCheckMacValue !== calculatedMac) {
        console.warn(
          `🚨 [ECPay Webhook] CheckMacValue 驗證失敗，MerchantTradeNo=${maskIdentifier(merchantTradeNo)}`,
        );
        await prisma.paymentEvent.update({
          where: {
            id: paymentEvent.id,
          },
          data: {
            checkMacMatched: false,
            processed: false,
            errorMessage: 'CheckMacValueVerifyFail',
          },
        });
        return res.status(400).send('0|CheckMacValueVerifyFail');
      }

      if (rtnCode === '1') {
        if (!order) {
          console.error(`🚨 [ECPay Webhook] 找不到訂單，orderNumber=${maskIdentifier(orderNumber)}`);
          await prisma.paymentEvent.update({
            where: {
              id: paymentEvent.id,
            },
            data: {
              checkMacMatched: true,
              processed: false,
              errorMessage: 'OrderNotFound',
            },
          });
          return res.status(404).send('0|OrderNotFound');
        }

        if (!merchantTradeNo) {
          console.error(
            `🚨 [ECPay Webhook] 缺少 MerchantTradeNo，orderNumber=${maskIdentifier(orderNumber)}`,
          );
          await prisma.paymentEvent.update({
            where: {
              id: paymentEvent.id,
            },
            data: {
              orderId: order.id,
              checkMacMatched: true,
              processed: false,
              errorMessage: 'MerchantTradeNoMissing',
            },
          });
          return res.status(400).send('0|MerchantTradeNoMissing');
        }

        const tradeAmount = parseTradeAmount(payload);

        if (tradeAmount === null || !amountMatches(tradeAmount, order.totalAmount)) {
          console.error(
            `🚨 [ECPay Webhook] 金額不符，orderNumber=${maskIdentifier(orderNumber)}, TradeAmt=${tradeAmount}, totalAmount=${order.totalAmount}`,
          );
          await prisma.paymentEvent.update({
            where: {
              id: paymentEvent.id,
            },
            data: {
              orderId: order.id,
              paymentTransactionId: paymentTransaction?.id ?? null,
              checkMacMatched: true,
              processed: true,
              errorMessage: 'AmountMismatch',
            },
          });
          return res.status(200).send('1|OK');
        }

        const shouldNotifyPayment = order.paymentStatus !== 'PAID';
        const shouldLogPaidStatus = order.paymentStatus !== 'PAID' && order.status !== 'PAID';
        const paidAt = new Date();

        await prisma.$transaction(async (tx) => {
          const transaction = await tx.paymentTransaction.upsert({
            where: {
              merchantTradeNo,
            },
            update: {
              orderId: order.id,
              providerTradeNo: providerTradeNo || undefined,
              amount: Number(order.totalAmount),
              method: order.paymentMethod || '',
              status: 'PAID',
              paidAt,
            },
            create: {
              orderId: order.id,
              merchantTradeNo,
              providerTradeNo,
              amount: Number(order.totalAmount),
              method: order.paymentMethod || '',
              status: 'PAID',
              paidAt,
              rawPayload: sanitizePaymentPayload(payload),
            },
          });

          if (order.paymentStatus !== 'PAID') {
            await tx.order.update({
              where: {
                id: order.id,
              },
              data: {
                paymentStatus: 'PAID',
                status: 'PAID',
              },
            });

            if (shouldLogPaidStatus) {
              await tx.orderStatusLog.create({
                data: {
                  orderId: order.id,
                  fromStatus: order.status,
                  toStatus: 'PAID',
                  actorType: 'WEBHOOK',
                  actorId: null,
                  reason: 'ECPAY_PAYMENT_PAID',
                  metadata: {
                    merchantTradeNo,
                    providerTradeNo: providerTradeNo ?? null,
                    paymentEventId: paymentEvent.id,
                  } satisfies Prisma.InputJsonObject,
                },
              });
            }
          }

          await tx.paymentEvent.update({
            where: {
              id: paymentEvent.id,
            },
            data: {
              orderId: order.id,
              paymentTransactionId: transaction.id,
              checkMacMatched: true,
              processed: true,
              errorMessage: null,
            },
          });
        });

        if (shouldNotifyPayment) {
          console.log(`✅ [ECPay Webhook] 訂單 ${maskIdentifier(orderNumber)} 已更新為 PAID`);
          void notifyPaymentConfirmed(orderNumber);
        } else {
          console.log(
            `ℹ️ [ECPay Webhook] 訂單 ${maskIdentifier(orderNumber)} 已是 PAID，忽略重複通知`,
          );
        }
      } else {
        let transactionId = paymentTransaction?.id ?? null;

        if (order && merchantTradeNo) {
          const failedStatusUpdate =
            paymentTransaction?.status === 'PAID'
              ? {}
              : {
                  status: 'FAILED',
                };

          const transaction = await prisma.paymentTransaction.upsert({
            where: {
              merchantTradeNo,
            },
            update: {
              orderId: order.id,
              providerTradeNo: providerTradeNo || undefined,
              amount: Number(order.totalAmount),
              method: order.paymentMethod || '',
              ...failedStatusUpdate,
            },
            create: {
              orderId: order.id,
              merchantTradeNo,
              providerTradeNo,
              amount: Number(order.totalAmount),
              method: order.paymentMethod || '',
              status: 'FAILED',
              rawPayload: sanitizePaymentPayload(payload),
            },
          });
          transactionId = transaction.id;
        }

        await prisma.paymentEvent.update({
          where: {
            id: paymentEvent.id,
          },
          data: {
            orderId: order?.id ?? null,
            paymentTransactionId: transactionId,
            checkMacMatched: true,
            processed: true,
          },
        });

        console.warn(
          `⚠️ [ECPay Webhook] 付款未成功，MerchantTradeNo=${maskIdentifier(merchantTradeNo)}, RtnCode=${rtnCode}, hasRtnMsg=${Boolean(rtnMsg)}`,
        );
      }

      return res.status(200).send('1|OK');
    } catch (error) {
      console.error('🚨 [ECPay Webhook Error] 伺服器處理錯誤:', error);
      return res.status(500).send('0|ServerError');
    }
  }
}
