import { NextRequest } from 'next/server';

import { prisma, type Prisma } from '@havoice/database';

import { createAdminAuditLog } from '@/lib/admin-audit-log';
import { jsonError, jsonOk, toNumber } from '@/lib/api-helpers';
import { requireAdminSession } from '@/lib/auth/api-guard';
import {
  createPostOfficeShipment,
  PostOfficeServiceError,
  type PostOfficeShipmentOrder,
} from '@/lib/post-office-service';
import { createShipmentEvent, upsertShipmentRecord } from '@/lib/shipment-records';

const POST_OFFICE_SHIPPING_METHODS = new Set(['STANDARD', 'EXPRESS']);
const BLOCKED_ORDER_STATUSES = new Set(['SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']);

type ParsedOrderNotes = {
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  shippingAddress?: string;
};

function parseOrderNotes(notes: string | null): ParsedOrderNotes {
  if (!notes) return {};

  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;

    return {
      recipientName: typeof parsed.recipientName === 'string' ? parsed.recipientName.trim() : undefined,
      recipientPhone: typeof parsed.recipientPhone === 'string' ? parsed.recipientPhone.trim() : undefined,
      recipientEmail: typeof parsed.recipientEmail === 'string' ? parsed.recipientEmail.trim() : undefined,
      shippingAddress: typeof parsed.shippingAddress === 'string' ? parsed.shippingAddress.trim() : undefined,
    };
  } catch {
    return {};
  }
}

function resolveRecipient(order: {
  recipient: {
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  } | null;
  notes: string | null;
  user: { name: string | null; email: string | null; phone: string | null } | null;
  shippingAddress: string | null;
}): PostOfficeShipmentOrder['recipient'] {
  const notes = parseOrderNotes(order.notes);

  return {
    name: order.recipient?.name?.trim() || notes.recipientName || order.user?.name?.trim() || '',
    phone: order.recipient?.phone?.trim() || notes.recipientPhone || order.user?.phone?.trim() || '',
    email: order.recipient?.email?.trim() || notes.recipientEmail || order.user?.email?.trim() || null,
    address: order.recipient?.address?.trim() || notes.shippingAddress || order.shippingAddress?.trim() || '',
  };
}

function missingRecipientFields(recipient: PostOfficeShipmentOrder['recipient']): string[] {
  const missing: string[] = [];
  if (!recipient.name) missing.push('收件人姓名');
  if (!recipient.phone) missing.push('收件人電話');
  if (!recipient.address) missing.push('收件地址');
  return missing;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
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
        notes: true,
        totalAmount: true,
        user: { select: { name: true, email: true, phone: true } },
        recipient: {
          select: {
            name: true,
            phone: true,
            email: true,
            address: true,
          },
        },
        items: {
          select: {
            productName: true,
            quantity: true,
          },
        },
        shipments: {
          where: { provider: 'POST_OFFICE' },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!order) {
      return jsonError(404, 'ORDER_NOT_FOUND', '找不到此訂單');
    }

    if (order.shipments.length > 0) {
      return jsonError(409, 'POST_OFFICE_SHIPMENT_EXISTS', '此訂單已建立郵局出貨單');
    }

    if (order.shippingMethod === 'STORE') {
      return jsonError(400, 'CVS_ORDER_NOT_SUPPORTED', '超商取貨訂單請使用綠界 C2C');
    }

    if (!order.shippingMethod || !POST_OFFICE_SHIPPING_METHODS.has(order.shippingMethod)) {
      return jsonError(400, 'SHIPPING_METHOD_NOT_SUPPORTED', '此配送方式不適用郵局出貨');
    }

    if (BLOCKED_ORDER_STATUSES.has(order.status)) {
      return jsonError(409, 'ORDER_STATUS_NOT_ALLOWED', '此訂單狀態不可建立郵局出貨單');
    }

    const canFulfill = order.paymentMethod === 'COD' || order.paymentStatus === 'PAID';
    if (!canFulfill) {
      return jsonError(409, 'ORDER_NOT_PAID', '訂單尚未付款，無法建立郵局出貨單');
    }

    const recipient = resolveRecipient(order);
    const missingFields = missingRecipientFields(recipient);
    if (missingFields.length > 0) {
      return jsonError(400, 'RECIPIENT_INCOMPLETE', `缺少收件人資料：${missingFields.join('、')}`);
    }

    const postOfficeResponse = await createPostOfficeShipment({
      id: order.id,
      orderNumber: order.orderNumber,
      shippingMethod: order.shippingMethod,
      totalAmount: toNumber(order.totalAmount),
      recipient,
      items: order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
      })),
    });

    const result = await prisma.$transaction(async (tx) => {
      const shipment = await upsertShipmentRecord({
        client: tx,
        orderId: order.id,
        provider: 'POST_OFFICE',
        shippingMethod: order.shippingMethod,
        status: postOfficeResponse.status,
        trackingNumber: postOfficeResponse.trackingNumber,
        providerShipmentNo: postOfficeResponse.providerShipmentNo,
        recipientName: recipient.name,
        recipientPhone: recipient.phone,
        recipientEmail: recipient.email,
        recipientAddress: recipient.address,
        rawResponse: postOfficeResponse.rawResponse,
      });

      await createShipmentEvent({
        client: tx,
        shipmentId: shipment.id,
        orderId: order.id,
        eventType: 'POST_OFFICE_CREATED',
        status: postOfficeResponse.status,
        message: postOfficeResponse.message,
        metadata: {
          source: 'admin_post_office_create',
          mock: postOfficeResponse.mock,
          trackingNumber: postOfficeResponse.trackingNumber,
          providerShipmentNo: postOfficeResponse.providerShipmentNo,
        } satisfies Prisma.InputJsonObject,
      });

      await createAdminAuditLog({
        client: tx,
        req,
        actor: guard.user,
        action: 'ORDER_POST_OFFICE_SHIPMENT_CREATE',
        resourceType: 'ORDER',
        resourceId: order.id,
        description: `建立訂單 ${order.orderNumber} 郵局出貨單`,
        beforeData: {
          status: order.status,
          paymentStatus: order.paymentStatus,
          shippingMethod: order.shippingMethod,
        },
        afterData: {
          shipmentId: shipment.id,
          provider: 'POST_OFFICE',
          status: postOfficeResponse.status,
          trackingNumber: postOfficeResponse.trackingNumber,
          providerShipmentNo: postOfficeResponse.providerShipmentNo,
        },
        metadata: {
          source: 'admin_post_office_create',
          orderNumber: order.orderNumber,
          shipmentId: shipment.id,
          mock: postOfficeResponse.mock,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          shippingMethod: order.shippingMethod,
        } satisfies Prisma.InputJsonObject,
      });

      return {
        shipmentId: shipment.id,
        status: postOfficeResponse.status,
        trackingNumber: postOfficeResponse.trackingNumber,
        providerShipmentNo: postOfficeResponse.providerShipmentNo,
        mock: postOfficeResponse.mock,
      };
    });

    return jsonOk(result);
  } catch (err) {
    if (err instanceof PostOfficeServiceError) {
      return jsonError(err.statusCode, err.code, err.message);
    }

    console.error(
      '[POST /api/orders/[id]/post-office] error:',
      err instanceof Error ? err.message : err,
    );
    return jsonError(500, 'INTERNAL_ERROR', '建立郵局出貨單失敗，請稍後再試');
  }
}
