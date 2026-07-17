import type { Prisma } from '@havoice/database';

const BASE_REQUIRED_POST_OFFICE_ENV = [
  'POST_OFFICE_API_URL',
  'POST_OFFICE_SENDER_NAME',
  'POST_OFFICE_SENDER_PHONE',
  'POST_OFFICE_SENDER_ADDRESS',
] as const;
type PostOfficeMode = 'mock' | 'production';

type PostOfficeConfig = {
  mode: PostOfficeMode;
  apiUrl?: string;
  customerId?: string;
  senderName?: string;
  senderPhone?: string;
  senderAddress?: string;
  missing: string[];
};

export type PostOfficeShipmentOrder = {
  id: string;
  orderNumber: string;
  shippingMethod: string | null;
  totalAmount: number;
  recipient: {
    name: string;
    phone: string;
    email: string | null;
    address: string;
  };
  items: Array<{
    productName: string;
    quantity: number;
  }>;
};

export type NormalizedPostOfficeResponse = {
  status: 'CREATED' | 'FAILED';
  trackingNumber: string | null;
  providerShipmentNo: string | null;
  message: string;
  rawResponse: Prisma.InputJsonObject;
  mock: boolean;
};

export class PostOfficeServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PostOfficeServiceError';
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function isFalsy(value: string | undefined): boolean {
  return value === '0' || value?.toLowerCase() === 'false';
}

function getCustomerId(): string | undefined {
  return readEnv('POST_OFFICE_CUSTOMER_ID') || readEnv('POST_OFFICE_ACCOUNT');
}

function getApiCredential(): string | undefined {
  return readEnv('POST_OFFICE_API_KEY') || readEnv('POST_OFFICE_SECRET');
}

function getMissingConfigNames(): string[] {
  const missing: string[] = BASE_REQUIRED_POST_OFFICE_ENV.filter((name) => !readEnv(name));

  if (!getCustomerId()) {
    missing.push('POST_OFFICE_CUSTOMER_ID or POST_OFFICE_ACCOUNT');
  }

  if (!getApiCredential()) {
    missing.push('POST_OFFICE_API_KEY or POST_OFFICE_SECRET');
  }

  return missing;
}

function hasProductionConfig(): boolean {
  return getMissingConfigNames().length === 0;
}

function redactSensitiveFields(input: Record<string, unknown>): Prisma.InputJsonObject {
  const safe: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(input)) {
    if (/secret|api[_-]?key|token|password|credential/i.test(key)) {
      continue;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      safe[key] = value;
    }
  }

  return safe as Prisma.InputJsonObject;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isPostOfficeEnabled(): boolean {
  const flag = readEnv('POST_OFFICE_ENABLED');

  if (isFalsy(flag)) return false;
  if (isTruthy(flag)) return true;

  if (process.env.NODE_ENV === 'production') {
    return hasProductionConfig();
  }

  return true;
}

export function validatePostOfficeConfig(): PostOfficeConfig {
  if (!isPostOfficeEnabled()) {
    throw new PostOfficeServiceError(503, 'POST_OFFICE_DISABLED', '郵局 API 尚未啟用');
  }

  const missing = getMissingConfigNames();

  if (process.env.NODE_ENV === 'production' && missing.length > 0) {
    throw new PostOfficeServiceError(
      500,
      'POST_OFFICE_ENV_MISSING',
      `缺少郵局物流必要環境變數：${missing.join(', ')}`,
    );
  }

  return {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'mock',
    apiUrl: readEnv('POST_OFFICE_API_URL'),
    customerId: getCustomerId(),
    senderName: readEnv('POST_OFFICE_SENDER_NAME'),
    senderPhone: readEnv('POST_OFFICE_SENDER_PHONE'),
    senderAddress: readEnv('POST_OFFICE_SENDER_ADDRESS'),
    missing,
  };
}

export function normalizePostOfficeResponse(response: Record<string, unknown>): NormalizedPostOfficeResponse {
  const trackingNumber =
    stringValue(response.trackingNumber) ||
    stringValue(response.providerShipmentNo) ||
    stringValue(response.shipmentNo);
  const providerShipmentNo =
    stringValue(response.providerShipmentNo) ||
    stringValue(response.shipmentNo) ||
    trackingNumber;
  const status = stringValue(response.status) === 'FAILED' ? 'FAILED' : 'CREATED';
  const message = stringValue(response.message) || '郵局出貨單建立完成';

  return {
    status,
    trackingNumber,
    providerShipmentNo,
    message,
    rawResponse: redactSensitiveFields(response),
    mock: response.mock === true,
  };
}

export async function createPostOfficeShipment(
  order: PostOfficeShipmentOrder,
): Promise<NormalizedPostOfficeResponse> {
  const config = validatePostOfficeConfig();

  if (config.mode === 'production') {
    throw new PostOfficeServiceError(
      501,
      'POST_OFFICE_ADAPTER_NOT_IMPLEMENTED',
      '郵局正式 API adapter 尚未串接，取得正式 API 規格後再啟用建立出貨單',
    );
  }

  const suffix = `${order.orderNumber.replace(/[^A-Za-z0-9]/g, '')}${Date.now().toString().slice(-8)}`.slice(-14);

  return normalizePostOfficeResponse({
    mock: true,
    provider: 'POST_OFFICE',
    status: 'CREATED',
    trackingNumber: `POMOCK${suffix}`,
    providerShipmentNo: `POMOCK${suffix}`,
    message: 'Development mock 郵局出貨單已建立；production 不會使用 mock response',
    orderNumber: order.orderNumber,
    shippingMethod: order.shippingMethod,
    totalAmount: order.totalAmount,
    recipientName: order.recipient.name,
    recipientPhone: order.recipient.phone,
    recipientAddress: order.recipient.address,
    itemCount: order.items.length,
    missingConfig: config.missing.join(','),
    createdAt: new Date().toISOString(),
  });
}
