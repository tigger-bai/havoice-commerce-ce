import { NextRequest } from 'next/server';

import { type OrderStatus, type Prisma, prisma } from '@havoice/database';

import { createAdminAuditLog } from '@/lib/admin-audit-log';
import { jsonError, jsonOk } from '@/lib/api-helpers';
import { requireAdminSession } from '@/lib/auth/api-guard';
import { createShipmentEvent } from '@/lib/shipment-records';

const POST_OFFICE_STATUSES = new Set([
  'CREATED',
  'ACCEPTED',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
]);

type PostOfficeStatus = 'CREATED' | 'ACCEPTED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

const POST_OFFICE_STATUS_TRANSITIONS: Record<PostOfficeStatus, PostOfficeStatus[]> = {
  CREATED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_TRANSIT', 'FAILED', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED', 'CANCELLED'],
  FAILED: ['ACCEPTED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

function isPostOfficeStatus(value: string): value is PostOfficeStatus {
  return POST_OFFICE_STATUSES.has(value);
}

function defaultStatusMessage(status: string): string {
  if (status === 'CREATED') return '郵局出貨單已建立';
  if (status === 'ACCEPTED') return '郵局已收件';
  if (status === 'IN_TRANSIT') return '郵局物流運送中';
  if (status === 'DELIVERED') return '郵局物流已送達';
  if (status === 'FAILED') return '郵局物流配送失敗';
  if (status === 'CANCELLED') return '郵局物流已取消';
  return `郵局物流狀態更新為 ${status}`;
}

function resolveLinkedOrderStatus(orderStatus: string, shipmentStatus: string): OrderStatus | null {
  if (shipmentStatus === 'IN_TRANSIT' && orderStatus === 'PAID') {
    return 'SHIPPED';
  }

  if (shipmentStatus === 'DELIVERED' && orderStatus === 'SHIPPED') {
    return 'DELIVERED';
  }

  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const status = typeof (body as { status?: unknown })?.status === 'string'
      ? String((body as { status: string }).status).trim().toUpperCase()
      : '';
    const message = typeof (body as { message?: unknown })?.message === 'string'
      ? String((body as { message: string }).message).trim()
      : '';

    if (!isPostOfficeStatus(status)) {
      return jsonError(400, 'INVALID_POST_OFFICE_STATUS', '郵局物流狀態不合法');
    }

    const order = await prisma.order.findFirst({
      where: { id: params.id, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        shipments: {
          where: { provider: 'POST_OFFICE' },
          select: {
            id: true,
            provider: true,
            status: true,
            trackingNumber: true,
            providerShipmentNo: true,
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

    if (!shipment || shipment.provider !== 'POST_OFFICE') {
      return jsonError(404, 'POST_OFFICE_SHIPMENT_NOT_FOUND', '此訂單尚未建立郵局出貨單');
    }

    const oldStatus = shipment.status.trim().toUpperCase();

    if (!isPostOfficeStatus(oldStatus)) {
      return jsonError(400, 'CURRENT_POST_OFFICE_STATUS_INVALID', '目前物流狀態不合法，無法更新');
    }

    if (oldStatus === status) {
      return jsonError(400, 'POST_OFFICE_STATUS_UNCHANGED', '狀態未變更');
    }

    if (!POST_OFFICE_STATUS_TRANSITIONS[oldStatus].includes(status)) {
      return jsonError(
        400,
        'POST_OFFICE_STATUS_TRANSITION_NOT_ALLOWED',
        `不允許從 ${oldStatus} 變更為 ${status}`,
      );
    }

    const linkedOrderStatus = resolveLinkedOrderStatus(order.status, status);
    const eventMessage = message || defaultStatusMessage(status);

    const result = await prisma.$transaction(async (tx) => {
      const updatedShipment = await tx.shipment.update({
        where: { id: shipment.id },
        data: { status },
        select: {
          id: true,
          provider: true,
          status: true,
          trackingNumber: true,
          providerShipmentNo: true,
          updatedAt: true,
        },
      });

      await createShipmentEvent({
        client: tx,
        shipmentId: shipment.id,
        orderId: order.id,
        eventType: 'POST_OFFICE_STATUS_UPDATED',
        status,
        message: eventMessage,
        metadata: {
          source: 'admin_post_office_status_update',
          oldStatus,
          newStatus: status,
        } satisfies Prisma.InputJsonObject,
      });

      if (linkedOrderStatus) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: linkedOrderStatus },
          select: { id: true },
        });

        await tx.orderStatusLog.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: linkedOrderStatus,
            actorType: 'ADMIN',
            actorId: guard.user.id,
            reason: 'POST_OFFICE_STATUS_SYNC',
            metadata: {
              shipmentId: shipment.id,
              oldShipmentStatus: oldStatus,
              newShipmentStatus: status,
              source: 'admin_post_office_status_update',
            } satisfies Prisma.InputJsonObject,
          },
        });
      }

      await createAdminAuditLog({
        client: tx,
        req,
        actor: guard.user,
        action: 'ORDER_POST_OFFICE_STATUS_UPDATE',
        resourceType: 'ORDER',
        resourceId: order.id,
        description: `更新訂單 ${order.orderNumber} 郵局物流狀態：${oldStatus} -> ${status}`,
        beforeData: {
          shipmentId: shipment.id,
          status: oldStatus,
          orderStatus: order.status,
        },
        afterData: {
          shipmentId: shipment.id,
          status,
          orderStatus: linkedOrderStatus ?? order.status,
        },
        metadata: {
          source: 'admin_post_office_status_update',
          shipmentId: shipment.id,
          oldStatus,
          newStatus: status,
          linkedOrderStatus,
        } satisfies Prisma.InputJsonObject,
      });

      return updatedShipment;
    });

    return jsonOk({
      id: result.id,
      provider: result.provider,
      status: result.status,
      trackingNumber: result.trackingNumber,
      providerShipmentNo: result.providerShipmentNo,
      updatedAt: result.updatedAt,
      linkedOrderStatus,
    });
  } catch (err) {
    console.error(
      '[PATCH /api/orders/[id]/post-office/status] error:',
      err instanceof Error ? err.message : err,
    );
    return jsonError(500, 'INTERNAL_ERROR', '更新郵局物流狀態失敗，請稍後再試');
  }
}
