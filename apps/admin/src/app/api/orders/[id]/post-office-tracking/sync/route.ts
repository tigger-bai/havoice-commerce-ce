import { NextRequest } from 'next/server';

import { prisma, type Prisma } from '@havoice/database';

import { jsonError, jsonOk } from '@/lib/api-helpers';
import { createAdminAuditLog } from '@/lib/admin-audit-log';
import { requireAdminSession } from '@/lib/auth/api-guard';
import { createShipmentEvent, upsertShipmentRecord } from '@/lib/shipment-records';
import {
  fetchChunghwaPostTracking,
  isPostOfficeTrackingNumber,
  type ChunghwaPostTrackingEvent,
} from '@/lib/post-office-tracking';

function buildEventMessage(event: ChunghwaPostTrackingEvent): string {
  return [event.datetime, event.station, event.status].filter(Boolean).join(' | ') || '中華郵政物流事件';
}

function buildEventKey(event: Pick<ChunghwaPostTrackingEvent, 'datetime' | 'status' | 'station'>): string {
  return [event.datetime || '', event.status || '', event.station || ''].join('|').trim();
}

function resolveTrackingNumber(order: {
  trackingNumber: string | null;
  shippingTrackingNumber: string | null;
  shipments: Array<{ trackingNumber: string | null; providerShipmentNo: string | null }>;
}): string {
  const candidates = [
    order.trackingNumber,
    order.shippingTrackingNumber,
    ...order.shipments.flatMap((shipment) => [shipment.trackingNumber, shipment.providerShipmentNo]),
  ];

  return candidates.find((candidate) => isPostOfficeTrackingNumber(candidate)) || '';
}

function getTrackingErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return '同步郵局物流狀態失敗';

  if (err.message === 'INVALID_POST_OFFICE_TRACKING_NUMBER') {
    return '郵局追蹤號格式不正確';
  }

  if (err.message === 'CHUNGHWA_POST_TRACKING_TIMEOUT') {
    return '中華郵政查詢逾時，請稍後再試';
  }

  if (err.message.startsWith('CHUNGHWA_POST_TRACKING_HTTP_')) {
    return '中華郵政查詢服務暫時無法使用';
  }

  return '同步郵局物流狀態失敗';
}

function getSyncMessage(eventCount: number, syncedCount: number): string {
  if (eventCount > 0 && syncedCount > 0) {
    return `已同步郵局物流狀態，共新增 ${syncedCount} 筆。`;
  }

  if (eventCount > 0) {
    return '已取得郵局物流狀態，但沒有新的紀錄。';
  }

  return '已連線中華郵政查詢，但目前沒有取得物流紀錄。請使用官方查詢頁確認。';
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let mode: 'auto' | 'manual' = 'manual';
    try {
      const body = (await req.json()) as { mode?: unknown };
      mode = body?.mode === 'auto' ? 'auto' : 'manual';
    } catch {
      mode = 'manual';
    }

    const order = await prisma.order.findFirst({
      where: { id: params.id, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        shippingMethod: true,
        trackingNumber: true,
        shippingTrackingNumber: true,
        recipient: {
          select: {
            name: true,
            phone: true,
            email: true,
            address: true,
          },
        },
        shipments: {
          select: {
            id: true,
            provider: true,
            trackingNumber: true,
            providerShipmentNo: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      return jsonError(404, 'ORDER_NOT_FOUND', '找不到此訂單');
    }

    const trackingNumber = resolveTrackingNumber(order);
    if (!trackingNumber) {
      return jsonError(400, 'POST_OFFICE_TRACKING_NUMBER_MISSING', '缺少有效的郵局追蹤號碼');
    }

    let events: ChunghwaPostTrackingEvent[];
    try {
      events = await fetchChunghwaPostTracking(trackingNumber);
    } catch (err) {
      return jsonError(502, 'POST_OFFICE_TRACKING_SYNC_FAILED', getTrackingErrorMessage(err));
    }

    const shipment =
      order.shipments.find((candidate) => candidate.trackingNumber === trackingNumber) ??
      (await upsertShipmentRecord({
        orderId: order.id,
        provider: 'MANUAL',
        shippingMethod: order.shippingMethod,
        status: 'CREATED',
        trackingNumber,
        recipientName: order.recipient?.name ?? null,
        recipientPhone: order.recipient?.phone ?? null,
        recipientEmail: order.recipient?.email ?? null,
        recipientAddress: order.recipient?.address ?? null,
      }));

    const existingEvents = await prisma.shipmentEvent.findMany({
      where: {
        orderId: order.id,
        shipmentId: shipment.id,
        eventType: 'CHUNGHWA_POST_TRACKING_SYNCED',
      },
      select: {
        status: true,
        message: true,
        metadata: true,
      },
    });

    const existingKeys = new Set(
      existingEvents.map((event) => {
        const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : null;
        const rawEvent = metadata && 'event' in metadata ? (metadata.event as Record<string, unknown>) : null;
        const datetime = typeof rawEvent?.datetime === 'string' ? rawEvent.datetime : '';
        const status = typeof rawEvent?.status === 'string' ? rawEvent.status : event.status || '';
        const station = typeof rawEvent?.station === 'string' ? rawEvent.station : '';
        return buildEventKey({ datetime, status, station });
      })
    );

    let syncedCount = 0;
    for (const event of events) {
      const eventKey = buildEventKey(event);
      if (!eventKey || existingKeys.has(eventKey)) continue;

      await createShipmentEvent({
        shipmentId: shipment.id,
        orderId: order.id,
        eventType: 'CHUNGHWA_POST_TRACKING_SYNCED',
        status: event.status || null,
        message: buildEventMessage(event),
        metadata: {
          source: 'chunghwa_post_tracking_sync',
          trackingNumber,
          event: {
            datetime: event.datetime,
            status: event.status,
            station: event.station,
            rawData: event.rawData ?? {},
          },
        } satisfies Prisma.InputJsonObject,
      });

      syncedCount += 1;
      existingKeys.add(eventKey);
    }

    const eventCount = events.length;
    const message = getSyncMessage(eventCount, syncedCount);

    if (mode === 'manual' || eventCount > 0) {
      await createAdminAuditLog({
        req,
        actor: guard.user,
        action: 'ORDER_POST_OFFICE_TRACKING_SYNC',
        resourceType: 'ORDER',
        resourceId: order.id,
        description:
          mode === 'manual'
            ? `手動同步郵局物流狀態，郵件號碼：${trackingNumber}，取得事件數：${eventCount}，新增事件數：${syncedCount}`
            : `自動同步郵局物流狀態，郵件號碼：${trackingNumber}，取得事件數：${eventCount}，新增事件數：${syncedCount}`,
        metadata: {
          source: 'admin_order_post_office_tracking_sync',
          mode,
          orderNumber: order.orderNumber,
          trackingNumber,
          eventCount,
          syncedCount,
        },
      });
    }

    return jsonOk({
      trackingNumber,
      events,
      eventCount,
      syncedCount,
      message,
    });
  } catch (err) {
    console.error('[POST /api/orders/[id]/post-office-tracking/sync] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '同步郵局物流狀態失敗，請稍後再試');
  }
}
