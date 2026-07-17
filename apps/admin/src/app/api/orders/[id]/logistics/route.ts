// apps/admin/src/app/api/orders/[id]/logistics/route.ts
import { NextRequest } from 'next/server';
import { prisma, type Prisma } from '@havoice/database';
import { generateLogisticsCheckMacValue } from '@havoice/shared';
import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toNumber } from '@/lib/api-helpers';
import { createAdminAuditLog } from '@/lib/admin-audit-log';
import { createShipmentEvent, upsertShipmentRecord } from '@/lib/shipment-records';

export const runtime = 'nodejs';

const SUBTYPE_TO_C2C: Record<string, string> = {
  UNIMART: 'UNIMARTC2C',
  FAMI: 'FAMIC2C',
  HILIFE: 'HILIFEC2C',
  OKMART: 'OKMARTC2C',
  OK: 'OKMARTC2C',
};

function resolveSubType(order: { cvsSubType: string | null; shippingAddress: string | null }): string | null {
  if (order.cvsSubType && order.cvsSubType.toUpperCase().endsWith('C2C')) {
    return order.cvsSubType.toUpperCase();
  }

  if (order.cvsSubType && SUBTYPE_TO_C2C[order.cvsSubType.toUpperCase()]) {
    return SUBTYPE_TO_C2C[order.cvsSubType.toUpperCase()];
  }

  const addr = order.shippingAddress || '';
  if (/7-ELEVEN|7-11|統一|UNIMART/i.test(addr)) return 'UNIMARTC2C';
  if (/全家|FamilyMart|FAMI/i.test(addr)) return 'FAMIC2C';
  if (/萊爾富|Hi-Life|HILIFE/i.test(addr)) return 'HILIFEC2C';
  if (/OK|OKMART/i.test(addr)) return 'OKMARTC2C';

  return 'UNIMARTC2C';
}

function resolveStoreId(order: { cvsStoreId: string | null; shippingAddress: string | null }): string | null {
  if (order.cvsStoreId && order.cvsStoreId.trim()) return order.cvsStoreId.trim();

  const match = (order.shippingAddress || '').match(/門市代號\s*([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

function resolveReceiver(order: {
  notes: string | null;
  user: { name: string | null; phone: string | null } | null;
}): { name: string; cellular: string } {
  let name = '';
  let cellular = '';

  try {
    if (order.notes) {
      const parsed = JSON.parse(order.notes) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        name = String(parsed.recipientName || '');
        cellular = String(parsed.recipientPhone || '');
      }
    }
  } catch {
    // 忽略 notes JSON 解析失敗，改用會員資料。
  }

  if (!name) name = order.user?.name || '收件人';
  if (!cellular) cellular = order.user?.phone || '';

  const safeName = name.replace(/[^\u4e00-\u9fa5A-Za-z]/g, '').slice(0, 10) || '收件人';

  return { name: safeName, cellular };
}

function parseLogisticsResponse(text: string): { ok: boolean; message: string; data: Record<string, string> } {
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
    if (eq > 0) data[pair.slice(0, eq)] = pair.slice(eq + 1);
  }

  return { ok: true, message: 'OK', data };
}

function readEnvValue(name: string): string {
  return (process.env[name] || '').replace(/["']/g, '').trim();
}

function readRequiredEnv() {
  const MERCHANT_ID = readEnvValue('ECPAY_LOGISTICS_MERCHANT_ID');
  const HASH_KEY = readEnvValue('ECPAY_LOGISTICS_HASH_KEY');
  const HASH_IV = readEnvValue('ECPAY_LOGISTICS_HASH_IV');
  const LOGISTICS_URL = readEnvValue('ECPAY_LOGISTICS_URL');
  const RAW_API_URL = readEnvValue('API_BASE_URL');

  return {
    MERCHANT_ID,
    HASH_KEY,
    HASH_IV,
    LOGISTICS_URL,
    RAW_API_URL,
  };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    const order = await prisma.order.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        items: true,
        user: { select: { name: true, email: true, phone: true } },
        recipient: {
          select: {
            name: true,
            phone: true,
            email: true,
            address: true,
          },
        },
      },
    });

    if (!order) return jsonError(404, 'ORDER_NOT_FOUND', '找不到此訂單');

    if (order.shippingTrackingNumber) {
      return jsonError(409, 'LOGISTICS_ALREADY_CREATED', '此訂單已取得寄件編號，請勿重複申請');
    }

    if (order.shippingMethod !== 'STORE') {
      return jsonError(400, 'NOT_CVS_ORDER', '僅超商取貨訂單可申請交貨便寄件代碼');
    }

    const isCOD = order.paymentMethod === 'COD';
    const isPaid = order.paymentStatus === 'PAID';
    if (!isCOD && !isPaid) {
      return jsonError(400, 'ORDER_NOT_PAID', '此訂單尚未付款，無法申請物流寄件代碼');
    }

    const subType = resolveSubType(order);
    if (!subType) return jsonError(400, 'CVS_SUBTYPE_UNKNOWN', '無法判讀超商類型，請確認訂單門市資訊');

    const storeId = resolveStoreId(order);
    if (!storeId) return jsonError(400, 'CVS_STORE_ID_MISSING', '無法取得取貨門市代號，請確認訂單門市資訊');

    const { name: receiverName, cellular: receiverCellular } = resolveReceiver(order);
    if (!receiverCellular || !/^09\d{8}$/.test(receiverCellular)) {
      return jsonError(400, 'RECEIVER_CELLULAR_INVALID', '收件人手機格式不正確，無法拋單');
    }

    const { MERCHANT_ID, HASH_KEY, HASH_IV, LOGISTICS_URL, RAW_API_URL } = readRequiredEnv();
    if (!MERCHANT_ID || !HASH_KEY || !HASH_IV || !LOGISTICS_URL || !RAW_API_URL) {
      return jsonError(500, 'ENV_MISSING', '伺服器設定錯誤：缺少物流環境變數，請聯絡系統管理員');
    }

    const API_URL = RAW_API_URL.endsWith('/') ? RAW_API_URL.slice(0, -1) : RAW_API_URL;
    const senderNameSource = readEnvValue('SENDER_NAME');
    const senderPhoneSource = readEnvValue('SENDER_PHONE');

    if (!senderNameSource || !senderPhoneSource) {
      return jsonError(500, 'ENV_MISSING', '伺服器設定錯誤：缺少寄件人環境變數，請聯絡系統管理員');
    }

    const SENDER_NAME = senderNameSource.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
    const SENDER_PHONE = senderPhoneSource.trim();

    const amount = Math.round(toNumber(order.totalAmount));
    const now = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : n.toString());
    const tradeDate = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(
      now.getHours(),
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const merchantTradeNo = `${order.orderNumber}${now.getTime().toString().slice(-6)}`.slice(0, 20);

    const safeGoodsName =
      order.items
        .map((item) => item.productName)
        .join(',')
        .replace(/[^\u4e00-\u9fa5A-Za-z0-9, ]/g, '')
        .slice(0, 45) || '商品一批';

    const ecpayParams: Record<string, string> = {
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      LogisticsType: 'CVS',
      LogisticsSubType: subType,
      GoodsAmount: amount.toString(),
      IsCollection: isCOD ? 'Y' : 'N',
      CollectionAmount: isCOD ? amount.toString() : '0',
      GoodsName: safeGoodsName,
      SenderName: SENDER_NAME,
      SenderCellPhone: SENDER_PHONE,
      ReceiverName: receiverName,
      ReceiverCellPhone: receiverCellular,
      ReceiverStoreID: storeId,
      ServerReplyURL: `${API_URL}/api/orders/logistics-webhook`,
      LogisticsC2CReplyURL: `${API_URL}/api/orders/logistics-webhook`,
    };

    const checkMacValue = generateLogisticsCheckMacValue(ecpayParams, HASH_KEY, HASH_IV);
    const postParams: Record<string, string> = {
      ...ecpayParams,
      CheckMacValue: checkMacValue,
    };

    let responseText = '';
    try {
      const res = await fetch(LOGISTICS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(postParams).toString(),
      });

      responseText = await res.text();
    } catch (err) {
      console.error('[POST /api/orders/[id]/logistics] 呼叫綠界物流 API 失敗:', err);
      return jsonError(502, 'LOGISTICS_GATEWAY_ERROR', '無法連線綠界物流系統，請稍後再試');
    }

    const parsed = parseLogisticsResponse(responseText);
    if (!parsed.ok) {
      console.error(`[POST /api/orders/[id]/logistics] 綠界建立失敗（${order.orderNumber}）：${parsed.message}`);
      return jsonError(400, 'LOGISTICS_CREATE_FAILED', `綠界物流建立失敗：${parsed.message}`);
    }

    const trackingNumber = parsed.data['AllPayLogisticsID'] || parsed.data['CVSPaymentNo'] || merchantTradeNo;
    const cvsPaymentNo = parsed.data['CVSPaymentNo'] || null;
    const cvsValidationNo = parsed.data['CVSValidationNo'] || null;

    const statusLogData =
      order.status !== 'SHIPPED'
        ? {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'SHIPPED',
            actorType: 'ADMIN',
            actorId: guard.user.id,
            reason: 'ADMIN_C2C_CREATE_SHIPMENT',
            metadata: {
              logisticsMerchantTradeNo: merchantTradeNo,
              shippingTrackingNumber: trackingNumber,
              shippingPaymentNo: cvsPaymentNo,
              shippingValidationNo: cvsValidationNo,
            } satisfies Prisma.InputJsonObject,
          }
        : null;

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          shippingTrackingNumber: trackingNumber,
          shippingPaymentNo: cvsPaymentNo,
          shippingValidationNo: cvsValidationNo,
          trackingNumber: order.trackingNumber || trackingNumber,
          status: 'SHIPPED',
        } as never,
        select: {
          id: true,
          status: true,
          shippingTrackingNumber: true,
          shippingPaymentNo: true,
          shippingValidationNo: true,
        },
      });

      if (statusLogData) {
        await tx.orderStatusLog.create({ data: statusLogData });
      }

      const shipment = await upsertShipmentRecord({
        client: tx,
        orderId: order.id,
        provider: 'EC_PAY_C2C',
        shippingMethod: order.shippingMethod,
        status: 'SHIPPED',
        trackingNumber,
        providerShipmentNo: trackingNumber,
        paymentNo: cvsPaymentNo,
        validationNo: cvsValidationNo,
        cvsStoreId: storeId,
        cvsAddress: order.shippingAddress,
        cvsSubType: subType,
        recipientName: order.recipient?.name || receiverName,
        recipientPhone: order.recipient?.phone || receiverCellular,
        recipientEmail: order.recipient?.email || order.user?.email || null,
        recipientAddress: order.recipient?.address || order.shippingAddress,
        rawResponse: parsed.data as Prisma.InputJsonObject,
      });

      await createShipmentEvent({
        client: tx,
        shipmentId: shipment.id,
        orderId: order.id,
        eventType: 'ECPAY_C2C_CREATED',
        status: 'SHIPPED',
        message: '綠界 C2C 交貨便寄件代碼建立成功',
        metadata: {
          logisticsMerchantTradeNo: merchantTradeNo,
          logisticsSubType: subType,
          shippingTrackingNumber: trackingNumber,
          shippingPaymentNo: cvsPaymentNo,
          shippingValidationNo: cvsValidationNo,
        } satisfies Prisma.InputJsonObject,
      });

      if (statusLogData) {
        await createShipmentEvent({
          client: tx,
          shipmentId: shipment.id,
          orderId: order.id,
          eventType: 'ORDER_MARKED_SHIPPED',
          status: 'SHIPPED',
          message: 'C2C 拋單成功後自動標記訂單為已出貨',
          metadata: {
            fromStatus: order.status,
            toStatus: 'SHIPPED',
            source: 'ecpay_c2c_create',
          } satisfies Prisma.InputJsonObject,
        });
      }

      await createAdminAuditLog({
        client: tx,
        req,
        actor: guard.user,
        action: 'ORDER_C2C_LOGISTICS_CREATE',
        resourceType: 'ORDER',
        resourceId: order.id,
        description: `建立訂單 ${order.orderNumber} 超商交貨便寄件代碼`,
        beforeData: {
          status: order.status,
          trackingNumber: order.trackingNumber,
          shippingTrackingNumber: order.shippingTrackingNumber,
          shippingPaymentNo: order.shippingPaymentNo,
          shippingValidationNo: order.shippingValidationNo,
        },
        afterData: {
          status: 'SHIPPED',
          trackingNumber: order.trackingNumber || trackingNumber,
          shippingTrackingNumber: trackingNumber,
          shippingPaymentNo: cvsPaymentNo,
          shippingValidationNo: cvsValidationNo,
        },
        metadata: {
          source: 'admin_c2c_logistics_create',
          orderNumber: order.orderNumber,
          logisticsMerchantTradeNo: merchantTradeNo,
          logisticsSubType: subType,
          storeId,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          shippingMethod: order.shippingMethod,
        } satisfies Prisma.InputJsonObject,
      });

      return updatedOrder;
    });

    return jsonOk({
      id: updated.id,
      status: updated.status,
      shippingTrackingNumber: updated.shippingTrackingNumber,
      shippingPaymentNo: updated.shippingPaymentNo,
      shippingValidationNo: updated.shippingValidationNo,
    });
  } catch (err) {
    console.error('[POST /api/orders/[id]/logistics] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '申請物流寄件代碼失敗，請稍後再試');
  }
}
