import { NextRequest } from 'next/server';
import { z } from 'zod';

import { prisma, type Prisma } from '@havoice/database';

import { createAdminAuditLog } from '@/lib/admin-audit-log';
import { jsonError, jsonOk, toNumber } from '@/lib/api-helpers';
import { requireAdminSession } from '@/lib/auth/api-guard';

const optionalText = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(max).optional(),
  );

const optionalEmail = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().email('Email 格式不正確').max(120).optional(),
);

const CustomerInputSchema = z.object({
  name: z.string().trim().min(1, '請輸入客戶姓名').max(80, '客戶姓名不可超過 80 字'),
  phone: optionalText(30),
  email: optionalEmail,
  facebookName: optionalText(120),
  lineId: optionalText(80),
  remark: optionalText(1000),
});

const RecipientInputSchema = z.object({
  name: z.string().trim().min(1, '請輸入收件人姓名').max(80, '收件人姓名不可超過 80 字'),
  phone: z.string().trim().min(6, '請輸入收件人電話').max(30, '收件人電話不可超過 30 字'),
  email: optionalEmail,
  postalCode: z.string().trim().regex(/^\d{3,6}$/, '郵遞區號格式不正確'),
  city: optionalText(20),
  district: optionalText(20),
  address: z.string().trim().min(4, '請輸入收件地址').max(200, '收件地址不可超過 200 字'),
});

const LiveManualOrderItemSchema = z.object({
  productId: z.string().uuid('商品 ID 格式不正確'),
  quantity: z.number().int('數量必須為整數').min(1, '數量至少為 1').max(999, '單項商品數量不可超過 999'),
});

const LiveManualPaymentMethodSchema = z.enum([
  'BANK_TRANSFER',
  'CASH',
  'MONTHLY_SETTLEMENT',
  'POST_OFFICE_COD',
  'OTHER',
]);

const LiveManualOrderCreateSchema = z
  .object({
    customerId: optionalText(36),
    customer: CustomerInputSchema.optional(),
    recipient: RecipientInputSchema,
    items: z
      .array(LiveManualOrderItemSchema)
      .min(1, '訂單至少需要一項商品')
      .max(100, '單筆人工訂單最多 100 項商品'),
    paymentMethod: LiveManualPaymentMethodSchema.default('BANK_TRANSFER'),
    otherPaymentMethod: optionalText(120),
    notes: optionalText(1000),
  })
  .superRefine((data, ctx) => {
    if (!data.customerId && !data.customer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '請選擇既有客戶或提供新客戶資料',
        path: ['customerId'],
      });
    }

    if (data.customerId && data.customer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'customerId 與 customer 不可同時提供',
        path: ['customer'],
      });
    }

    const productIds = data.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '同一張訂單不可包含重複商品',
        path: ['items'],
      });
    }

    if (data.paymentMethod === 'OTHER' && !data.otherPaymentMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '請輸入其他付款方式',
        path: ['otherPaymentMethod'],
      });
    }
  });

type LiveManualOrderInput = z.infer<typeof LiveManualOrderCreateSchema>;

class LiveManualOrderError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function generateOrderNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let randomPart = '';
  for (let i = 0; i < 6; i += 1) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `JY${datePart}${randomPart}`;
}

async function generateUniqueOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = generateOrderNumber();
    const existing = await prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true },
    });

    if (!existing) return orderNumber;
  }

  throw new LiveManualOrderError(500, 'ORDER_NUMBER_GENERATE_FAILED', '無法產生訂單編號，請稍後再試');
}

function buildShippingAddress(recipient: LiveManualOrderInput['recipient']): string {
  const location = `${recipient.city ?? ''}${recipient.district ?? ''}`;
  return [recipient.postalCode, `${location}${recipient.address}`.trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function buildCustomerNote(input: LiveManualOrderInput): string {
  const lines = [input.notes ?? ''];
  if (input.paymentMethod === 'OTHER' && input.otherPaymentMethod) {
    lines.push(`其他付款方式：${input.otherPaymentMethod}`);
  }

  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonError(guard.status, guard.code, guard.message);

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', '請求格式錯誤');
    }

    const parsed = LiveManualOrderCreateSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', '直播人工訂單資料格式不正確', parsed.error.flatten());
    }

    const input = parsed.data;
    const productIds = input.items.map((item) => item.productId);

    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        vendorId: true,
        version: true,
      },
    });

    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((product) => product.id));
      const missingIds = productIds.filter((id) => !foundIds.has(id));
      return jsonError(400, 'PRODUCTS_NOT_FOUND', '部分商品不存在或已刪除', { productIds: missingIds });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const insufficientStock = input.items
      .map((item) => {
        const product = productMap.get(item.productId)!;
        return product.stock < item.quantity
          ? {
              productId: product.id,
              productName: product.name,
              available: product.stock,
              requested: item.quantity,
            }
          : null;
      })
      .filter(Boolean);

    if (insufficientStock.length > 0) {
      return jsonError(409, 'INSUFFICIENT_STOCK', '商品庫存不足', insufficientStock);
    }

    let productSubtotal = 0;
    const orderItemsData = input.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const subtotal = toNumber(product.price) * item.quantity;
      productSubtotal += subtotal;

      return {
        productId: product.id,
        productName: product.name,
        productPrice: product.price,
        vendorId: product.vendorId ?? null,
        quantity: item.quantity,
      };
    });

    const totalAmount = Math.round(productSubtotal * 100) / 100;
    const shippingAddress = buildShippingAddress(input.recipient);
    const orderNumber = await generateUniqueOrderNumber();
    const customerNote = buildCustomerNote(input);

    const created = await prisma.$transaction(async (tx) => {
      const customer = input.customerId
        ? await tx.customer.findFirst({
            where: { id: input.customerId, deletedAt: null },
            select: { id: true, name: true, phone: true, email: true },
          })
        : await tx.customer.create({
            data: {
              name: input.customer!.name,
              phone: input.customer!.phone ?? null,
              email: input.customer!.email ?? null,
              facebookName: input.customer!.facebookName ?? null,
              lineId: input.customer!.lineId ?? null,
              remark: input.customer!.remark ?? null,
              source: 'LIVE_MANUAL',
            },
            select: { id: true, name: true, phone: true, email: true },
          });

      if (!customer) {
        throw new LiveManualOrderError(404, 'CUSTOMER_NOT_FOUND', '找不到指定客戶');
      }

      for (const item of input.items) {
        const productSnapshot = productMap.get(item.productId)!;
        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            version: productSnapshot.version,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
            version: { increment: 1 },
          },
        });

        if (updated.count === 0) {
          throw new LiveManualOrderError(
            409,
            'STOCK_RACE_CONDITION',
            `商品「${productSnapshot.name}」庫存已變更，請重新確認後再建單`,
          );
        }
      }

      const order = await tx.order.create({
        data: {
          orderNumber,
          source: 'LIVE_MANUAL',
          userId: null,
          customerId: customer.id,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          paymentMethod: input.paymentMethod,
          shippingMethod: 'EC_PAY_POST_OFFICE',
          totalAmount,
          shippingAddress,
          notes: JSON.stringify({
            source: 'LIVE_MANUAL',
            customerNote,
            paymentMethod: input.paymentMethod,
            otherPaymentMethod: input.paymentMethod === 'OTHER' ? input.otherPaymentMethod ?? '' : '',
            shippingMethod: 'EC_PAY_POST_OFFICE',
            productSubtotal: totalAmount,
            totalAmount,
            createdByAdminId: guard.user.id,
          }),
          recipient: {
            create: {
              name: input.recipient.name,
              phone: input.recipient.phone,
              email: input.recipient.email ?? null,
              address: shippingAddress,
              city: input.recipient.city ?? null,
              district: input.recipient.district ?? null,
              postalCode: input.recipient.postalCode,
              country: 'TW',
            },
          },
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: true,
        },
      });

      const orderItemByProductId = new Map(
        order.items.map((orderItem) => [orderItem.productId, orderItem]),
      );

      for (const item of input.items) {
        const productSnapshot = productMap.get(item.productId)!;
        const orderItem = orderItemByProductId.get(item.productId);

        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            orderId: order.id,
            orderItemId: orderItem?.id ?? null,
            type: 'ORDER_DEDUCT',
            quantityChange: -item.quantity,
            beforeQuantity: productSnapshot.stock,
            afterQuantity: productSnapshot.stock - item.quantity,
            actorType: 'ADMIN',
            actorId: guard.user.id,
            reason: 'live_manual_order_created',
            metadata: {
              orderNumber: order.orderNumber,
              productName: productSnapshot.name,
              source: 'LIVE_MANUAL',
            } satisfies Prisma.InputJsonObject,
          },
        });
      }

      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: 'NONE',
          toStatus: 'PENDING',
          actorType: 'ADMIN',
          actorId: guard.user.id,
          reason: 'LIVE_MANUAL_ORDER_CREATED',
          metadata: {
            orderNumber: order.orderNumber,
            source: 'LIVE_MANUAL',
            customerId: customer.id,
          } satisfies Prisma.InputJsonObject,
        },
      });

      await createAdminAuditLog({
        client: tx,
        req,
        actor: guard.user,
        action: 'ORDER_LIVE_MANUAL_CREATE',
        resourceType: 'ORDER',
        resourceId: order.id,
        description: `建立直播人工訂單 ${order.orderNumber}`,
        afterData: {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod ?? '',
          shippingMethod: order.shippingMethod ?? '',
          totalAmount,
          source: 'LIVE_MANUAL',
          customerId: customer.id,
        },
        metadata: {
          itemCount: order.items.length,
          recipientPostalCode: input.recipient.postalCode,
          source: 'live_manual_order_api',
        },
      });

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        totalAmount: toNumber(order.totalAmount),
        customerId: customer.id,
      };
    });

    return jsonOk(created, { status: 201 });
  } catch (err) {
    if (err instanceof LiveManualOrderError) {
      return jsonError(err.status, err.code, err.message, err.details);
    }

    console.error('[POST /api/orders/live-manual] error:', err);
    return jsonError(500, 'INTERNAL_ERROR', '建立直播人工訂單失敗，請稍後再試');
  }
}
