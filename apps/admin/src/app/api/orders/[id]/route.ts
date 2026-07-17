// apps/admin/src/app/api/orders/[id]/route.ts
import { NextRequest } from 'next/server';

import { prisma, type Prisma } from '@havoice/database';

import { requireAdminSession, requireProductModuleSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError, toNumber } from '@/lib/api-helpers';
import { createAdminAuditLog } from '@/lib/admin-audit-log';
import { createShipmentEvent, upsertShipmentRecord } from '@/lib/shipment-records';
import { sendOrderShippedEmail } from '@/lib/mailer';
import { parsePostOfficeTrackingInput } from '@/lib/post-office-tracking';
import type { OrderEmailData } from '@havoice/shared';

type ParsedOrderNotes = {
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  shippingAddress?: string;
  customerNote?: string;
};

type OrderRecipientView = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  country: string;
};

function parseOrderNotes(notes: string | null): ParsedOrderNotes {
  if (!notes) return {};

  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return { customerNote: notes };

    return {
      recipientName: typeof parsed.recipientName === 'string' ? parsed.recipientName.trim() : undefined,
      recipientPhone: typeof parsed.recipientPhone === 'string' ? parsed.recipientPhone.trim() : undefined,
      recipientEmail: typeof parsed.recipientEmail === 'string' ? parsed.recipientEmail.trim() : undefined,
      shippingAddress: typeof parsed.shippingAddress === 'string' ? parsed.shippingAddress.trim() : undefined,
      customerNote: typeof parsed.customerNote === 'string' ? parsed.customerNote : undefined,
    };
  } catch {
    return { customerNote: notes };
  }
}

function resolveOrderRecipient(args: {
  recipient: {
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    district: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  notes: ParsedOrderNotes;
  user: { name: string | null; email: string | null } | null;
  shippingAddress: string | null;
}): OrderRecipientView {
  return {
    name: args.recipient?.name?.trim() || args.notes.recipientName || args.user?.name || '',
    phone: args.recipient?.phone?.trim() || args.notes.recipientPhone || '',
    email: args.recipient?.email?.trim() || args.notes.recipientEmail || args.user?.email || '',
    address: args.recipient?.address?.trim() || args.notes.shippingAddress || args.shippingAddress || '',
    city: args.recipient?.city ?? null,
    district: args.recipient?.district ?? null,
    postalCode: args.recipient?.postalCode ?? null,
    country: args.recipient?.country || 'TW',
  };
}

/**
 * 非同步寄送「商品出貨通知信」。
 */
async function notifyOrderShipped(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { name: true, email: true } },
        recipient: {
          select: {
            name: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            district: true,
            postalCode: true,
            country: true,
          },
        },
        items: true,
      },
    });

    if (!order) {
      console.error(`[notifyOrderShipped] 找不到訂單，orderId=${orderId}`);
      return;
    }

    const notes = parseOrderNotes(order.notes);
    const recipient = resolveOrderRecipient({
      recipient: order.recipient,
      notes,
      user: order.user,
      shippingAddress: order.shippingAddress,
    });

    if (!recipient.email) {
      console.error(`[notifyOrderShipped] 找不到訂單或收件信箱，orderId=${orderId}`);
      return;
    }

    const data: OrderEmailData = {
      orderNumber: order.orderNumber,
      customerName: recipient.name,
      totalAmount: toNumber(order.totalAmount),
      shippingAddress: recipient.address || order.shippingAddress,
      trackingNumber: order.trackingNumber,
      items: order.items.map((it) => ({
        productName: it.productName,
        productPrice: toNumber(it.productPrice),
        quantity: it.quantity,
      })),
    };

    await sendOrderShippedEmail(recipient.email, data);
  } catch (err) {
    console.error('[notifyOrderShipped] 寄信流程發生錯誤:', err);
  }
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PAID', 'SHIPPED', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

const FULFILLMENT_STATUSES = new Set(['SHIPPED', 'DELIVERED']);

function getStatusLogReason(args: {
  nextStatus: string;
  hasExplicitStatus: boolean;
  hasTracking: boolean;
}): string {
  if (args.nextStatus === 'CANCELLED') return 'ADMIN_CANCEL_ORDER';

  if (args.nextStatus === 'SHIPPED' && args.hasTracking && !args.hasExplicitStatus) {
    return 'ADMIN_TRACKING_AUTO_SHIPPED';
  }

  return 'ADMIN_UPDATE_ORDER_STATUS';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireProductModuleSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    const isVendor = guard.user.role === 'VENDOR';

    const order = await prisma.order.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, address: true, remark: true } },
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            facebookName: true,
            lineId: true,
            remark: true,
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
            country: true,
          },
        },
        items: {
          include: { product: { select: { slug: true, sku: true, coverImage: true } } },
        },
        paymentTransactions: {
          select: {
            id: true,
            merchantTradeNo: true,
            providerTradeNo: true,
            amount: true,
            method: true,
            status: true,
            paidAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        paymentEvents: {
          select: {
            id: true,
            merchantTradeNo: true,
            providerTradeNo: true,
            rtnCode: true,
            rtnMsg: true,
            checkMacMatched: true,
            processed: true,
            errorMessage: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        statusLogs: {
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            actorType: true,
            actorId: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        shipments: {
          select: {
            id: true,
            provider: true,
            shippingMethod: true,
            status: true,
            trackingNumber: true,
            providerShipmentNo: true,
            paymentNo: true,
            validationNo: true,
            cvsStoreId: true,
            cvsStoreName: true,
            cvsAddress: true,
            cvsSubType: true,
            recipientName: true,
            recipientPhone: true,
            recipientEmail: true,
            recipientAddress: true,
            createdAt: true,
            updatedAt: true,
            events: {
              select: {
                id: true,
                eventType: true,
                status: true,
                message: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        refunds: {
          select: {
            id: true,
            provider: true,
            amount: true,
            status: true,
            reason: true,
            providerRefundNo: true,
            createdAt: true,
            updatedAt: true,
            events: {
              select: {
                id: true,
                eventType: true,
                status: true,
                message: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      return jsonError(404, 'ORDER_NOT_FOUND', '找不到此訂單');
    }

    const parsedNotes = parseOrderNotes(order.notes);
    const resolvedRecipient = resolveOrderRecipient({
      recipient: order.recipient,
      notes: parsedNotes,
      user: order.user,
      shippingAddress: order.shippingAddress,
    });
    const pureCustomerNote = parsedNotes.customerNote || '';

    const visibleItems = isVendor
      ? order.items.filter((it) => it.vendorId === guard.user.id)
      : order.items;

    if (isVendor && visibleItems.length === 0) {
      return jsonError(403, 'FORBIDDEN', '您沒有權限檢視此訂單');
    }

    const adminAuditLogs = isVendor
      ? []
      : await prisma.adminAuditLog.findMany({
          where: {
            resourceType: 'ORDER',
            resourceId: order.id,
          },
          select: {
            id: true,
            action: true,
            actorEmail: true,
            actorName: true,
            description: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

    return jsonOk({
      id: order.id,
      orderNumber: order.orderNumber,
      source: order.source,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      shippingMethod: order.shippingMethod,
      shippingAddress: order.shippingAddress,
      trackingNumber: order.trackingNumber,
      cvsStoreId: order.cvsStoreId,
      shippingTrackingNumber: order.shippingTrackingNumber,
      shippingPaymentNo: order.shippingPaymentNo,
      shippingValidationNo: order.shippingValidationNo,
      notes: pureCustomerNote, // 🟢 替換為乾淨的備註
      totalAmount: isVendor
        ? Math.round(
            visibleItems.reduce(
              (sum, it) => sum + toNumber(it.productPrice) * (it.quantity || 0),
              0
            ) * 100
          ) / 100
        : toNumber(order.totalAmount),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: {
        id: order.customer?.id ?? order.user?.id ?? null,
        name: order.customer?.name || order.user?.name || resolvedRecipient.name || '—',
        email: order.customer?.email || order.user?.email || resolvedRecipient.email || '—',
        phone: order.customer?.phone || order.user?.phone || resolvedRecipient.phone || '—',
        facebookName: order.customer?.facebookName || null,
        lineId: order.customer?.lineId || null,
        remark: order.customer?.remark || order.user?.remark || null,
        type: order.customer ? 'CUSTOMER' : 'USER',
      },
      recipient: {
        name: resolvedRecipient.name || '—',
        phone: resolvedRecipient.phone || '—',
        email: resolvedRecipient.email || '—',
        address: resolvedRecipient.address || '—',
        city: resolvedRecipient.city,
        district: resolvedRecipient.district,
        postalCode: resolvedRecipient.postalCode,
        country: resolvedRecipient.country,
      },
      items: visibleItems.map((it) => ({
        id: it.id,
        productName: it.productName,
        productPrice: toNumber(it.productPrice),
        quantity: it.quantity,
        subtotal: toNumber(it.productPrice) * (it.quantity || 0),
        sku: it.product?.sku ?? null,
        slug: it.product?.slug ?? null,
        coverImage: it.product?.coverImage ?? null,
      })),
      paymentTransactions: isVendor
        ? []
        : order.paymentTransactions.map((transaction) => ({
            id: transaction.id,
            merchantTradeNo: transaction.merchantTradeNo,
            providerTradeNo: transaction.providerTradeNo,
            amount: toNumber(transaction.amount),
            method: transaction.method,
            status: transaction.status,
            paidAt: transaction.paidAt,
            createdAt: transaction.createdAt,
            updatedAt: transaction.updatedAt,
          })),
      paymentEvents: isVendor
        ? []
        : order.paymentEvents.map((event) => ({
            id: event.id,
            merchantTradeNo: event.merchantTradeNo,
            providerTradeNo: event.providerTradeNo,
            rtnCode: event.rtnCode,
            rtnMsg: event.rtnMsg,
            checkMacMatched: event.checkMacMatched,
            processed: event.processed,
            errorMessage: event.errorMessage,
            createdAt: event.createdAt,
          })),
      orderStatusLogs: order.statusLogs.map((log) => ({
        id: log.id,
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        actorType: log.actorType,
        actorId: isVendor ? null : log.actorId,
        reason: log.reason,
        createdAt: log.createdAt,
      })),
      adminAuditLogs: adminAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        actorEmail: log.actorEmail,
        actorName: log.actorName,
        description: log.description,
        createdAt: log.createdAt,
      })),
      shipments: order.shipments.map((shipment) => ({
        id: shipment.id,
        provider: shipment.provider,
        shippingMethod: shipment.shippingMethod,
        status: shipment.status,
        trackingNumber: shipment.trackingNumber,
        providerShipmentNo: shipment.providerShipmentNo,
        paymentNo: shipment.paymentNo,
        validationNo: shipment.validationNo,
        cvsStoreId: shipment.cvsStoreId,
        cvsStoreName: shipment.cvsStoreName,
        cvsAddress: shipment.cvsAddress,
        cvsSubType: shipment.cvsSubType,
        recipientName: shipment.recipientName,
        recipientPhone: shipment.recipientPhone,
        recipientEmail: shipment.recipientEmail,
        recipientAddress: shipment.recipientAddress,
        createdAt: shipment.createdAt,
        updatedAt: shipment.updatedAt,
        events: shipment.events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          status: event.status,
          message: event.message,
          createdAt: event.createdAt,
        })),
      })),
      refunds: isVendor
        ? []
        : order.refunds.map((refund) => ({
            id: refund.id,
            provider: refund.provider,
            amount: toNumber(refund.amount),
            status: refund.status,
            reason: refund.reason,
            providerRefundNo: refund.providerRefundNo,
            createdAt: refund.createdAt,
            updatedAt: refund.updatedAt,
            events: refund.events.map((event) => ({
              id: event.id,
              eventType: event.eventType,
              status: event.status,
              message: event.message,
              createdAt: event.createdAt,
            })),
          })),
      allowedTransitions: ALLOWED_TRANSITIONS[order.status] ?? [],
    });
  } catch (err) {
    console.error('[GET /api/orders/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '無法載入訂單詳情，請稍後再試');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const rawStatus = (body as { status?: unknown })?.status;
    const rawTracking = (body as { trackingNumber?: unknown })?.trackingNumber;
    const hasStatus = typeof rawStatus === 'string' && rawStatus.length > 0;
    const hasTracking = typeof rawTracking === 'string';

    if (!hasStatus && !hasTracking) {
      return jsonError(400, 'MISSING_PAYLOAD', '請提供要更新的 status 或 trackingNumber');
    }

    const nextStatus = hasStatus ? String(rawStatus) : '';
    const parsedTracking = hasTracking ? parsePostOfficeTrackingInput(String(rawTracking)) : null;
    if (
      hasTracking &&
      String(rawTracking).trim() &&
      !parsedTracking?.trackingNumber
    ) {
      return jsonError(
        400,
        'POST_OFFICE_TRACKING_NUMBER_NOT_FOUND',
        parsedTracking?.error || '無法從輸入內容解析郵局郵件號碼，請確認後再儲存'
      );
    }
    const nextTracking = hasTracking ? parsedTracking?.trackingNumber.trim() ?? '' : undefined;

    const order = await prisma.order.findFirst({
      where: { id: params.id, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        totalAmount: true,
        shippingMethod: true,
        shippingAddress: true,
        trackingNumber: true,
        cvsStoreId: true,
        cvsSubType: true,
        recipient: {
          select: {
            name: true,
            phone: true,
            email: true,
            address: true,
          },
        },
        paymentTransactions: {
          where: { status: 'PAID' },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      return jsonError(404, 'ORDER_NOT_FOUND', '找不到此訂單');
    }

    const data: { status?: string; paymentStatus?: string; trackingNumber?: string | null } = {};

    if (hasStatus && order.status !== nextStatus) {
      if (nextStatus === 'CANCELLED' && FULFILLMENT_STATUSES.has(order.status)) {
        return jsonError(
          409,
          'ORDER_ALREADY_FULFILLED',
          '已出貨或已送達的訂單不可直接取消'
        );
      }

      const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(nextStatus)) {
        return jsonError(
          409,
          'INVALID_TRANSITION',
          `無法將訂單從「${order.status}」變更為「${nextStatus}」`
        );
      }

      const isFulfillmentStatus = nextStatus === 'SHIPPED' || nextStatus === 'DELIVERED';
      const canFulfill = order.paymentMethod === 'COD' || order.paymentStatus === 'PAID';

      if (isFulfillmentStatus && !canFulfill) {
        return jsonError(
          409,
          'ORDER_NOT_PAID_FOR_FULFILLMENT',
          '此訂單尚未付款，無法標記為已出貨或已送達'
        );
      }

      data.status = nextStatus;
      if (nextStatus === 'PAID') data.paymentStatus = 'PAID';
      if (nextStatus === 'REFUNDED') data.paymentStatus = 'REFUNDED';
    }
    if (hasTracking) {
      data.trackingNumber = nextTracking ? nextTracking : null;

      /**
       * 後台手動填入物流單號時：
       * - 若訂單已付款，或付款方式為貨到付款
       * - 且目前尚未出貨
       * - 自動把訂單標記為已出貨
       *
       * 這樣後台人員不用再分兩次操作：
       * 1. 先填物流單號
       * 2. 再手動按「標記為已出貨」
       */
      const canFulfill = order.paymentMethod === 'COD' || order.paymentStatus === 'PAID';

      if (nextTracking && canFulfill && order.status === 'PAID') {
        data.status = 'SHIPPED';
      }

      if (nextTracking && canFulfill && order.status === 'PENDING' && order.paymentMethod === 'COD') {
        data.status = 'SHIPPED';
      }
    }

    if (Object.keys(data).length === 0) {
      return jsonOk({ id: order.id, status: order.status, unchanged: true });
    }

    const trackingChanged = hasTracking && (order.trackingNumber ?? null) !== (data.trackingNumber ?? null);
    const statusChanged = Boolean(data.status && data.status !== order.status);
    const isAutoMarkShipped = Boolean(
      data.status === 'SHIPPED' && hasTracking && !hasStatus && order.status !== 'SHIPPED',
    );
    const auditMetadata = {
      source: 'admin_order_patch',
      orderNumber: order.orderNumber,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      shippingMethod: order.shippingMethod,
    } satisfies Prisma.InputJsonObject;
    const shouldCreateRefund = order.paymentStatus === 'PAID' && order.paymentMethod !== 'COD';
    const paidPaymentTransaction = order.paymentTransactions[0] ?? null;
    const shipmentRecipient = {
      recipientName: order.recipient?.name || null,
      recipientPhone: order.recipient?.phone || null,
      recipientEmail: order.recipient?.email || null,
      recipientAddress: order.recipient?.address || order.shippingAddress || null,
    };

    const statusLogData =
      data.status && data.status !== order.status
        ? {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: data.status,
            actorType: 'ADMIN',
            actorId: guard.user.id,
            reason: getStatusLogReason({
              nextStatus: data.status,
              hasExplicitStatus: hasStatus,
              hasTracking,
            }),
            metadata: {
              requestedStatus: hasStatus ? nextStatus : null,
              trackingNumber: hasTracking ? nextTracking ?? null : null,
            } satisfies Prisma.InputJsonObject,
          }
        : null;

    if (data.status === 'CANCELLED') {
      /**
       * 已付款但尚未出貨的訂單目前允許後台取消並回補庫存。
       * 正式環境未來應在這裡串接退款流程，避免只取消訂單卻未處理金流退款。
       */
      const updated = await prisma.$transaction(async (tx) => {
        const cancelled = await tx.order.updateMany({
          where: {
            id: order.id,
            deletedAt: null,
            status: order.status,
          },
          data: data as never,
        });

        if (cancelled.count === 0) {
          return null;
        }

        if (statusLogData) {
          await tx.orderStatusLog.create({ data: statusLogData });
        }

        await createAdminAuditLog({
          client: tx,
          req,
          actor: guard.user,
          action: 'ORDER_CANCEL',
          resourceType: 'ORDER',
          resourceId: order.id,
          description: `取消訂單 ${order.orderNumber}`,
          beforeData: { status: order.status },
          afterData: { status: 'CANCELLED' },
          metadata: {
            ...auditMetadata,
            reason: 'order_cancelled',
          },
        });

        if (shouldCreateRefund) {
          // 目前尚未串接綠界正式退款 API，因此只建立待退款紀錄，待後續人工或系統退款流程處理。
          const refund = await tx.refund.create({
            data: {
              orderId: order.id,
              paymentTransactionId: paidPaymentTransaction?.id ?? null,
              provider: 'EC_PAY',
              amount: order.totalAmount,
              status: 'REQUESTED',
              reason: 'order_cancelled',
              requestedByActorType: 'ADMIN',
              requestedByActorId: guard.user.id,
            },
            select: { id: true },
          });

          await tx.refundEvent.create({
            data: {
              refundId: refund.id,
              orderId: order.id,
              eventType: 'REFUND_REQUESTED',
              status: 'REQUESTED',
              message: '已付款訂單取消，建立待退款紀錄',
              metadata: {
                source: 'admin_order_cancel',
                orderNumber: order.orderNumber,
                paymentMethod: order.paymentMethod,
                paymentStatus: order.paymentStatus,
                paymentTransactionId: paidPaymentTransaction?.id ?? null,
              } satisfies Prisma.InputJsonObject,
            },
          });
        }

        const items = await tx.orderItem.findMany({
          where: { orderId: order.id },
          select: {
            id: true,
            productId: true,
            productName: true,
            quantity: true,
          },
        });

        for (const item of items) {
          const updatedProduct = await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { increment: item.quantity },
              version: { increment: 1 },
            },
            select: {
              stock: true,
            },
          });

          if (item.quantity === 0) continue;

          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              orderId: order.id,
              orderItemId: item.id,
              type: 'ORDER_CANCEL_RESTORE',
              quantityChange: item.quantity,
              beforeQuantity: updatedProduct.stock - item.quantity,
              afterQuantity: updatedProduct.stock,
              actorType: 'ADMIN',
              actorId: guard.user.id,
              reason: 'order_cancelled',
              metadata: {
                productName: item.productName,
                fromStatus: order.status,
              } satisfies Prisma.InputJsonObject,
            },
          });
        }

        return tx.order.findFirst({
          where: { id: order.id, deletedAt: null },
          select: {
            id: true,
            status: true,
            paymentStatus: true,
            trackingNumber: true,
            updatedAt: true,
          },
        });
      });

      if (!updated) {
        return jsonError(
          409,
          'ORDER_CANCEL_CONFLICT',
          '訂單狀態已變更，請重新載入後再操作'
        );
      }

      return jsonOk({
        id: updated.id,
        status: updated.status,
        paymentStatus: updated.paymentStatus,
        trackingNumber: updated.trackingNumber,
        updatedAt: updated.updatedAt,
        allowedTransitions: ALLOWED_TRANSITIONS[updated.status] ?? [],
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: data as never,
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          trackingNumber: true,
          updatedAt: true,
        },
      });

      if (statusLogData) {
        await tx.orderStatusLog.create({ data: statusLogData });
      }

      let shipmentForOrder: { id: string } | null = null;

      if (trackingChanged && data.trackingNumber) {
        shipmentForOrder = await upsertShipmentRecord({
          client: tx,
          orderId: order.id,
          provider: 'MANUAL',
          shippingMethod: order.shippingMethod,
          status: updatedOrder.status === 'SHIPPED' ? 'SHIPPED' : 'CREATED',
          trackingNumber: data.trackingNumber,
          cvsStoreId: order.cvsStoreId,
          cvsSubType: order.cvsSubType,
          ...shipmentRecipient,
        });

        await createShipmentEvent({
          client: tx,
          shipmentId: shipmentForOrder.id,
          orderId: order.id,
          eventType: 'MANUAL_TRACKING_UPDATED',
          status: updatedOrder.status === 'SHIPPED' ? 'SHIPPED' : 'CREATED',
          message: `手動更新物流單號：${data.trackingNumber}`,
          metadata: {
            trackingNumber: data.trackingNumber,
            source: 'admin_order_patch',
          } satisfies Prisma.InputJsonObject,
        });
      }

      if (trackingChanged) {
        await createAdminAuditLog({
          client: tx,
          req,
          actor: guard.user,
          action: 'ORDER_TRACKING_UPDATE',
          resourceType: 'ORDER',
          resourceId: order.id,
          description: `更新訂單 ${order.orderNumber} 物流單號`,
          beforeData: { trackingNumber: order.trackingNumber },
          afterData: { trackingNumber: data.trackingNumber ?? null },
          metadata: auditMetadata,
        });
      }

      if (updatedOrder.status === 'SHIPPED' && statusChanged) {
        if (!shipmentForOrder) {
          shipmentForOrder = await upsertShipmentRecord({
            client: tx,
            orderId: order.id,
            provider: 'MANUAL',
            fallbackToAnyShipment: true,
            shippingMethod: order.shippingMethod,
            status: 'SHIPPED',
            trackingNumber: updatedOrder.trackingNumber ?? order.trackingNumber ?? undefined,
            cvsStoreId: order.cvsStoreId ?? undefined,
            cvsSubType: order.cvsSubType ?? undefined,
            recipientName: shipmentRecipient.recipientName ?? undefined,
            recipientPhone: shipmentRecipient.recipientPhone ?? undefined,
            recipientEmail: shipmentRecipient.recipientEmail ?? undefined,
            recipientAddress: shipmentRecipient.recipientAddress ?? undefined,
          });
        }

        await createShipmentEvent({
          client: tx,
          shipmentId: shipmentForOrder.id,
          orderId: order.id,
          eventType: 'ORDER_MARKED_SHIPPED',
          status: 'SHIPPED',
          message: `訂單狀態標記為已出貨`,
          metadata: {
            fromStatus: order.status,
            toStatus: 'SHIPPED',
            source: isAutoMarkShipped ? 'tracking_auto_mark_shipped' : 'admin_status_update',
          } satisfies Prisma.InputJsonObject,
        });
      }

      if (isAutoMarkShipped) {
        await createAdminAuditLog({
          client: tx,
          req,
          actor: guard.user,
          action: 'ORDER_AUTO_MARK_SHIPPED',
          resourceType: 'ORDER',
          resourceId: order.id,
          description: `訂單 ${order.orderNumber} 因物流單號自動標記已出貨`,
          beforeData: { status: order.status },
          afterData: { status: 'SHIPPED' },
          metadata: {
            ...auditMetadata,
            trackingNumber: data.trackingNumber ?? null,
          },
        });
      } else if (statusChanged) {
        await createAdminAuditLog({
          client: tx,
          req,
          actor: guard.user,
          action: 'ORDER_STATUS_UPDATE',
          resourceType: 'ORDER',
          resourceId: order.id,
          description: `更新訂單 ${order.orderNumber} 狀態：${order.status} -> ${data.status}`,
          beforeData: { status: order.status },
          afterData: { status: data.status ?? order.status },
          metadata: auditMetadata,
        });
      }

      return updatedOrder;
    });

    if (data.status === 'SHIPPED') {
      void notifyOrderShipped(order.id);
    }

    return jsonOk({
      id: updated.id,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      trackingNumber: updated.trackingNumber,
      updatedAt: updated.updatedAt,
      allowedTransitions: ALLOWED_TRANSITIONS[updated.status] ?? [],
    });
  } catch (err) {
    console.error('[PATCH /api/orders/[id]] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '更新訂單狀態失敗，請稍後再試');
  }
}
