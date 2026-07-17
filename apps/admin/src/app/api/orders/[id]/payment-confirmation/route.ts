import { NextRequest } from 'next/server';

import { prisma, type Prisma } from '@havoice/database';

import { jsonError, jsonOk, toNumber } from '@/lib/api-helpers';
import { createAdminAuditLog } from '@/lib/admin-audit-log';
import { requireAdminSession } from '@/lib/auth/api-guard';

const PAYMENT_METHODS = new Set(['BANK_TRANSFER', 'CASH', 'MONTHLY_SETTLEMENT', 'POST_OFFICE_COD', 'OTHER']);

function normalizeDate(value: unknown): Date {
  if (typeof value !== 'string' || !value.trim()) return new Date();

  const trimmed = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T12:00:00+08:00`)
    : new Date(trimmed);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildManualMerchantTradeNo(orderNumber: string): string {
  const safeOrderNumber = orderNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'ORDER';
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MANUAL-${safeOrderNumber}-${timestamp}-${suffix}`;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const input = body as {
      amount?: unknown;
      paidAt?: unknown;
      method?: unknown;
      transactionNote?: unknown;
      adminNote?: unknown;
    };

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonError(400, 'INVALID_AMOUNT', '請輸入有效的收款金額');
    }

    const method = typeof input.method === 'string' ? input.method.trim() : '';
    if (!PAYMENT_METHODS.has(method)) {
      return jsonError(400, 'INVALID_PAYMENT_METHOD', '請選擇有效的收款方式');
    }

    const transactionNote =
      typeof input.transactionNote === 'string' && input.transactionNote.trim()
        ? input.transactionNote.trim().slice(0, 500)
        : null;
    const adminNote =
      typeof input.adminNote === 'string' && input.adminNote.trim()
        ? input.adminNote.trim().slice(0, 1000)
        : null;
    const paidAt = normalizeDate(input.paidAt);

    const order = await prisma.order.findFirst({
      where: { id: params.id, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        paymentStatus: true,
        paymentMethod: true,
        paymentTransactions: {
          where: { status: 'PAID' },
          select: { amount: true },
        },
      },
    });

    if (!order) {
      return jsonError(404, 'ORDER_NOT_FOUND', '找不到此訂單');
    }

    const orderTotalAmount = toNumber(order.totalAmount);
    const previousPaidAmount = order.paymentTransactions.reduce((sum, transaction) => {
      return sum + toNumber(transaction.amount);
    }, 0);
    const paidAmountAfter = Math.round((previousPaidAmount + amount) * 100) / 100;
    const nextPaymentStatus =
      paidAmountAfter >= orderTotalAmount
        ? 'PAID'
        : order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED'
          ? order.paymentStatus
          : 'UNPAID';
    const merchantTradeNo = buildManualMerchantTradeNo(order.orderNumber);

    const result = await prisma.$transaction(async (tx) => {
      const paymentTransaction = await tx.paymentTransaction.create({
        data: {
          orderId: order.id,
          merchantTradeNo,
          amount,
          method,
          status: 'PAID',
          paidAt,
          rawPayload: {
            source: 'admin_payment_confirmation',
            orderNumber: order.orderNumber,
            transactionNote,
            adminNote,
            previousPaidAmount,
            collectedAmount: amount,
            paidAmountAfter,
            orderTotalAmount,
            paymentStatusBefore: order.paymentStatus,
            paymentStatusAfter: nextPaymentStatus,
            actorId: guard.user.id,
          } satisfies Prisma.InputJsonObject,
        },
        select: {
          id: true,
          merchantTradeNo: true,
          amount: true,
          method: true,
          status: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (nextPaymentStatus !== order.paymentStatus) {
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: nextPaymentStatus as never },
          select: { id: true },
        });
      }

      await createAdminAuditLog({
        client: tx,
        req,
        actor: guard.user,
        action: 'ORDER_PAYMENT_CONFIRMATION_CREATE',
        resourceType: 'ORDER',
        resourceId: order.id,
        description: `新增訂單 ${order.orderNumber} 收款紀錄：${amount}`,
        beforeData: {
          paymentStatus: order.paymentStatus,
          paidAmount: previousPaidAmount,
        },
        afterData: {
          paymentStatus: nextPaymentStatus,
          paidAmount: paidAmountAfter,
        },
        metadata: {
          source: 'admin_payment_confirmation',
          orderNumber: order.orderNumber,
          paymentMethod: order.paymentMethod,
          collectionMethod: method,
          amount,
          transactionNote,
          adminNote,
          paymentTransactionId: paymentTransaction.id,
        },
      });

      return paymentTransaction;
    });

    return jsonOk({
      paymentTransaction: {
        ...result,
        amount: toNumber(result.amount),
      },
      paymentStatus: nextPaymentStatus,
      paidAmount: paidAmountAfter,
      unpaidAmount: Math.max(0, Math.round((orderTotalAmount - paidAmountAfter) * 100) / 100),
    });
  } catch (err) {
    console.error('[POST /api/orders/[id]/payment-confirmation] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '新增收款紀錄失敗，請稍後再試');
  }
}
