import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@havoice/database';
import { decryptLogisticsV2Data, encryptLogisticsV2Data } from '@havoice/shared';

import { jsonError } from '@/lib/api-helpers';
import { requireAdminSession } from '@/lib/auth/api-guard';

export const runtime = 'nodejs';

const PROVIDER = 'EC_PAY_POST_OFFICE';
const isProduction = process.env.NODE_ENV === 'production';
const JSON_CONTENT_TYPE = 'application/json';

type PrintMode = {
  label: 'A4' | 'A6';
  value: 1 | 2;
};

function readEnv(name: string): string {
  return (process.env[name] || '').replace(/["']/g, '').trim();
}

function readJsonString(value: unknown, key: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

  const raw = (value as Record<string, unknown>)[key];
  if (raw === null || raw === undefined) return '';

  return String(raw).trim();
}

function resolvePrintApiUrl(): string {
  const explicitUrl = readEnv('ECPAY_LOGISTICS_PRINT_API_URL');
  if (explicitUrl) return explicitUrl;

  const createApiUrl = readEnv('ECPAY_LOGISTICS_API_URL');
  if (!createApiUrl) return '';

  try {
    const url = new URL(createApiUrl);
    url.pathname = '/Express/v2/PrintTradeDocument';
    url.search = '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizePrintMode(value: string | null): PrintMode {
  const mode = (value || 'A4').trim().toUpperCase();
  return mode === 'A6' ? { label: 'A6', value: 2 } : { label: 'A4', value: 1 };
}

function getTaipeiTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function sanitizeTextPreview(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function logPrintLabelDebug(params: {
  printApiUrl: string;
  requestPayloadKeys: string[];
  dataPayloadKeys: string[];
  responseStatus?: number;
  responseContentType?: string;
}): void {
  if (isProduction) return;

  console.info('[EC_PAY_POST_OFFICE PRINT_LABEL DEBUG]', {
    printApiUrl: params.printApiUrl,
    requestPayloadKeys: params.requestPayloadKeys,
    dataPayloadKeys: params.dataPayloadKeys,
    responseStatus: params.responseStatus,
    responseContentType: params.responseContentType,
  });
}

function buildInlineFilename(orderNumber: string, printMode: string, contentType: string): string {
  const safeOrderNumber = orderNumber.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'order';
  const extension = contentType.toLowerCase().includes('pdf') ? 'pdf' : 'html';
  return `ecpay-post-office-label-${safeOrderNumber}-${printMode}.${extension}`;
}

function decodeResponsePreview(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8').decode(buffer);
  } catch {
    return '';
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readStringField(data: Record<string, unknown> | null, keys: string[]): string {
  if (!data) return '';

  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function decodeBase64Document(value: string): ArrayBuffer | null {
  try {
    const buffer = Buffer.from(value, 'base64');
    return buffer.byteLength > 0 ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : null;
  } catch {
    return null;
  }
}

function extractInlineDocument(data: Record<string, unknown> | null): {
  body: BodyInit;
  contentType: string;
} | null {
  const html = readStringField(data, [
    'Html',
    'HTML',
    'html',
    'LabelHtml',
    'TradeDocument',
    'PrintTradeDocument',
  ]);
  if (html) {
    return {
      body: html,
      contentType: 'text/html; charset=utf-8',
    };
  }

  const pdfBase64 = readStringField(data, ['Pdf', 'PDF', 'PdfBase64', 'FileContent', 'LabelFile']);
  const pdf = pdfBase64 ? decodeBase64Document(pdfBase64) : null;
  if (pdf) {
    return {
      body: pdf,
      contentType: 'application/pdf',
    };
  }

  return null;
}

function buildJsonErrorMessage(json: Record<string, unknown> | null, data: Record<string, unknown> | null): string {
  return (
    readStringField(data, ['RtnMsg', 'TransMsg', 'Message', 'Msg']) ||
    readStringField(json, ['TransMsg', 'RtnMsg', 'Message', 'Msg']) ||
    '綠界託運單列印 API 回傳錯誤'
  );
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  const merchantId = readEnv('ECPAY_MERCHANT_ID');
  const hashKey = readEnv('ECPAY_HASH_KEY');
  const hashIV = readEnv('ECPAY_HASH_IV');
  const platformId = readEnv('ECPAY_PLATFORM_ID');
  const printApiUrl = resolvePrintApiUrl();
  const printMode = normalizePrintMode(req.nextUrl.searchParams.get('printMode'));

  if (!merchantId || !hashKey || !hashIV) {
    return jsonError(500, 'ECPAY_PRINT_ENV_MISSING', '缺少綠界正式物流列印所需 MerchantID / HashKey / HashIV');
  }

  if (!printApiUrl) {
    return jsonError(500, 'ECPAY_PRINT_API_URL_MISSING', '缺少綠界物流託運單列印 API URL');
  }

  const order = await prisma.order.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
    },
    select: {
      id: true,
      orderNumber: true,
      shipments: {
        where: {
          provider: PROVIDER,
        },
        select: {
          id: true,
          providerShipmentNo: true,
          trackingNumber: true,
          rawResponse: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!order) {
    return jsonError(404, 'ORDER_NOT_FOUND', '找不到此訂單');
  }

  const shipment = order.shipments[0] ?? null;
  if (!shipment) {
    return jsonError(404, 'ECPAY_POST_OFFICE_SHIPMENT_NOT_FOUND', '此訂單尚未建立綠界郵局一般宅配物流單');
  }

  const allPayLogisticsId =
    shipment.providerShipmentNo ||
    readJsonString(shipment.rawResponse, 'AllPayLogisticsID');
  if (!allPayLogisticsId) {
    return jsonError(400, 'ECPAY_LOGISTICS_ID_MISSING', '缺少 AllPayLogisticsID，無法列印正式郵局託運單');
  }

  const dataPayload: Record<string, unknown> = {
    MerchantID: merchantId,
    LogisticsID: [allPayLogisticsId],
    LogisticsSubType: 'POST',
    PrintMode: printMode.value,
  };

  const requestPayload: Record<string, unknown> = {
    MerchantID: merchantId,
    PlatformID: platformId,
    RqHeader: {
      Timestamp: getTaipeiTimestamp(),
    },
    Data: encryptLogisticsV2Data(dataPayload, hashKey, hashIV),
  };

  let response: Response;
  let responseBuffer: ArrayBuffer;

  try {
    response = await fetch(printApiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json,text/html,application/pdf,*/*',
        'Content-Type': JSON_CONTENT_TYPE,
      },
      body: JSON.stringify(requestPayload),
    });

    responseBuffer = await response.arrayBuffer();
  } catch (err) {
    console.error(
      '[GET /api/orders/[id]/ecpay-post-office/print-label] 呼叫綠界託運單列印 API 失敗:',
      err instanceof Error ? err.message : err,
    );
    return jsonError(502, 'ECPAY_PRINT_LABEL_GATEWAY_ERROR', '無法連線綠界託運單列印 API，請稍後再試');
  }

  const responseText = decodeResponsePreview(responseBuffer);
  const responsePreview = sanitizeTextPreview(responseText);
  const responseContentType = response.headers.get('content-type') || '';
  logPrintLabelDebug({
    printApiUrl,
    requestPayloadKeys: Object.keys(requestPayload),
    dataPayloadKeys: Object.keys(dataPayload),
    responseStatus: response.status,
    responseContentType,
  });

  const responseJson = responseContentType.includes('json') ? parseJsonObject(responseText) : null;
  const encryptedResponseData = typeof responseJson?.Data === 'string' ? responseJson.Data : '';
  const decryptedResponseData = encryptedResponseData
    ? (() => {
        try {
          return decryptLogisticsV2Data<Record<string, unknown>>(encryptedResponseData, hashKey, hashIV);
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    return jsonError(
      502,
      'ECPAY_PRINT_LABEL_FAILED',
      buildJsonErrorMessage(responseJson, decryptedResponseData),
      {
        status: response.status,
        response: responseJson || responsePreview || undefined,
        data: decryptedResponseData || undefined,
      },
    );
  }

  if (responseJson) {
    const transCode = String(responseJson.TransCode ?? responseJson.RtnCode ?? '').trim();
    const isSuccess = transCode === '1' || transCode === '0' || transCode === '';

    if (!isSuccess) {
      return jsonError(400, 'ECPAY_PRINT_LABEL_FAILED', buildJsonErrorMessage(responseJson, decryptedResponseData), {
        response: responseJson,
        data: decryptedResponseData || undefined,
      });
    }

    const document = extractInlineDocument(decryptedResponseData || responseJson);
    if (document) {
      return new NextResponse(document.body, {
        status: 200,
        headers: {
          'Content-Type': document.contentType,
          'Content-Disposition': `inline; filename="${buildInlineFilename(order.orderNumber, printMode.label, document.contentType)}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return jsonError(502, 'ECPAY_PRINT_LABEL_DOCUMENT_MISSING', '綠界回傳成功但未包含可列印託運單內容', {
      response: responseJson,
      data: decryptedResponseData || undefined,
    });
  }

  if (responsePreview.startsWith('0|')) {
    return jsonError(400, 'ECPAY_PRINT_LABEL_FAILED', responsePreview);
  }

  const contentType = responseContentType || 'text/html; charset=utf-8';

  return new NextResponse(responseBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${buildInlineFilename(order.orderNumber, printMode.label, contentType)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
