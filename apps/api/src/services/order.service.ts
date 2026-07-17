// apps/api/src/services/order.service.ts
import { prisma, type Prisma } from '@havoice/database';
import {
  type CreateOrderDTO,
  type OrderEmailData,
  buildEcpayPayload,
  buildRepayMerchantTradeNo,
  resolveTaiwanPostalCode,
  resolveTaiwanPostalCodeFromAddress,
} from '@havoice/shared';
import { AppError } from '../utils/app-error';
import { sendOrderCreatedEmail } from '../utils/mailer';

interface EcpayRuntimeConfig {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  apiBaseUrl: string;
  webBaseUrl: string;
}

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

const isProduction = process.env.NODE_ENV === 'production';

function maskIdentifier(value: string | null | undefined): string {
  const text = String(value || '').trim();
  if (!text) return '[none]';
  if (text.length <= 6) return `${text.slice(0, 1)}***`;
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function getRuntimeEnv(name: string, devFallback?: string): string {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (!isProduction && devFallback) {
    return devFallback;
  }

  throw new AppError(500, `缺少必要環境變數：${name}`, 'ENV_MISSING');
}

function getEcpayRuntimeConfig(): EcpayRuntimeConfig {
  return {
    merchantId: getRuntimeEnv('ECPAY_MERCHANT_ID'),
    hashKey: getRuntimeEnv('ECPAY_HASH_KEY'),
    hashIV: getRuntimeEnv('ECPAY_HASH_IV'),
    apiBaseUrl: cleanBaseUrl(getRuntimeEnv('API_BASE_URL')),
    webBaseUrl: cleanBaseUrl(getRuntimeEnv('WEB_BASE_URL', 'http://localhost:3000')),
  };
}

function sanitizePaymentPayload(payload: Record<string, string>): Prisma.InputJsonObject {
  const { CheckMacValue: _checkMacValue, ...safePayload } = payload;
  return safePayload;
}

async function upsertPendingPaymentTransaction(params: {
  orderId: string;
  merchantTradeNo: string;
  amount: number;
  method: string | null;
  payload: Record<string, string>;
}) {
  await prisma.paymentTransaction.upsert({
    where: {
      merchantTradeNo: params.merchantTradeNo,
    },
    update: {
      orderId: params.orderId,
      amount: params.amount,
      method: params.method || '',
      rawPayload: sanitizePaymentPayload(params.payload),
    },
    create: {
      orderId: params.orderId,
      merchantTradeNo: params.merchantTradeNo,
      amount: params.amount,
      method: params.method || '',
      status: 'PENDING',
      rawPayload: sanitizePaymentPayload(params.payload),
    },
  });
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

async function notifyOrderCreated(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
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
        `[order.service] 找不到訂單，略過訂單成立信，orderId=${maskIdentifier(orderId)}`,
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
        `[order.service] 訂單 ${maskIdentifier(order.orderNumber)} 找不到收件信箱，略過訂單成立信`,
      );
      return;
    }

    const emailData: OrderEmailData = {
      orderNumber: order.orderNumber,
      customerName,
      totalAmount: Number(order.totalAmount),
      paymentMethod: order.paymentMethod,
      shippingAddress: order.recipient?.address || order.shippingAddress,
      items: order.items.map((item) => ({
        productName: item.productName,
        productPrice: Number(item.productPrice),
        quantity: item.quantity,
      })),
    };

    await sendOrderCreatedEmail(recipientEmail, emailData);
  } catch (err) {
    console.error('[order.service] 訂單成立信寄送失敗:', err);
  }
}

export class OrderService {
  /**
   * 生成訂單編號
   *
   * 格式：JY + YYYYMMDD + 6碼大寫英數
   *
   * 綠界 MerchantTradeNo 限制：
   * - 最多 20 碼
   * - 只能英文字母與數字
   */
  private static generateOrderNumber(): string {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let randomPart = '';
    for (let i = 0; i < 6; i += 1) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return `JY${datePart}${randomPart}`;
  }

  /**
   * 根據運送方式與商品小計計算運費。
   *
   * 注意：
   * 前端 checkout 頁面的運費規則也要保持一致：
   * - STANDARD：滿 1000 免運，否則 60
   * - EXPRESS：120
   * - STORE：滿 800 免運，否則 45
   */
  private static calculateShippingFee(
    shippingMethod: CreateOrderDTO['shippingMethod'],
    productSubtotal: number,
  ): number {
    if (shippingMethod === 'EXPRESS') return 120;
    if (shippingMethod === 'STORE') return productSubtotal >= 800 ? 0 : 45;
    return productSubtotal >= 1000 ? 0 : 60;
  }

  /**
   * 建立新訂單
   *
   * - COD：只建立訂單，不產生綠界 payload
   * - ATM / CREDIT_CARD：建立訂單後產生綠界 AIO payload
   */
  static async createOrder(dto: CreateOrderDTO, userId: string) {
    const {
      items,
      recipientName,
      recipientPhone,
      recipientEmail,
      shippingAddress,
      shippingMethod,
      paymentMethod,
      note,
      recipientCity,
      recipientDistrict,
      recipientPostalCode,
      recipientDetailAddress,
      cvsStoreId,
      cvsStoreName,
    } = dto;

    if (!isProduction) {
      console.log('========== ORDER SERVICE CREATE ==========');
      console.log('paymentMethod =', paymentMethod);
      console.log('shippingMethod =', shippingMethod);
      console.log('addressPresent =', Boolean(shippingAddress));
      console.log('storeCode =', maskIdentifier(cvsStoreId));
      console.log('==========================================');
    }

    /**
     * 超商取貨：推導物流子類型。
     *
     * 前端選店地圖回來時通常是：
     * - UNIMART
     * - FAMI
     * - HILIFE
     * - OK
     *
     * 後台 C2C 拋單需要：
     * - UNIMARTC2C
     * - FAMIC2C
     * - HILIFEC2C
     * - OKC2C
     */
    const resolveCvsSubType = (): string | null => {
      const anyDto = dto as Record<string, unknown>;
      const fromDto = typeof anyDto.cvsSubType === 'string' ? anyDto.cvsSubType : '';

      let subType = fromDto.toUpperCase();

      if (!subType) {
        const hint = `${cvsStoreName || ''}${shippingAddress || ''}`;

        if (/7-ELEVEN|7-11|統一|UNIMART/i.test(hint)) {
          subType = 'UNIMART';
        } else if (/全家|FamilyMart|FAMI/i.test(hint)) {
          subType = 'FAMI';
        } else if (/萊爾富|Hi-Life|HILIFE/i.test(hint)) {
          subType = 'HILIFE';
        } else if (/OK|OKMART/i.test(hint)) {
          subType = 'OK';
        }
      }

      if (!subType) return null;

      if (subType.endsWith('C2C')) return subType;
      return `${subType}C2C`;
    };

    const productIds = items.map((item) => item.productId);

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

      throw new AppError(
        400,
        `以下商品不存在或已下架：${missingIds.join(', ')}`,
        'PRODUCTS_NOT_FOUND',
      );
    }

    const productMap = new Map(products.map((product) => [product.id, product]));

    const insufficientStock: Array<{
      name: string;
      available: number;
      requested: number;
    }> = [];

    for (const item of items) {
      const product = productMap.get(item.productId)!;

      if (product.stock < item.quantity) {
        insufficientStock.push({
          name: product.name,
          available: product.stock,
          requested: item.quantity,
        });
      }
    }

    if (insufficientStock.length > 0) {
      const details = insufficientStock
        .map((item) => `「${item.name}」剩餘 ${item.available} 件，需求 ${item.requested} 件`)
        .join('；');

      throw new AppError(409, `庫存不足：${details}`, 'INSUFFICIENT_STOCK');
    }

    let productSubtotal = 0;

    const orderItemsData = items.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = product.price;
      const subtotal = Number(unitPrice) * item.quantity;

      productSubtotal += subtotal;

      return {
        productId: item.productId,
        productName: product.name,
        productPrice: unitPrice,
        quantity: item.quantity,
        vendorId: product.vendorId ?? null,
      };
    });

    const shippingFee = OrderService.calculateShippingFee(shippingMethod, productSubtotal);
    const totalAmount = productSubtotal + shippingFee;
    const resolvedRecipientPostalCode =
      shippingMethod === 'STORE'
        ? null
        : recipientPostalCode ||
          resolveTaiwanPostalCode(recipientCity, recipientDistrict) ||
          resolveTaiwanPostalCodeFromAddress(shippingAddress);

    const orderNumber = OrderService.generateOrderNumber();

    const order = await prisma.$transaction(async (tx) => {
      for (const item of items) {
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
          throw new AppError(
            409,
            `商品「${productSnapshot.name}」已被其他消費者搶先一步結帳，請刷新購物車`,
            'STOCK_RACE_CONDITION',
          );
        }
      }

      await tx.cartItem.deleteMany({
        where: {
          userId,
          productId: { in: productIds },
        },
      });

      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          totalAmount,
          shippingAddress,
          shippingMethod,
          paymentMethod,
          cvsStoreId: shippingMethod === 'STORE' ? cvsStoreId ?? null : null,
          cvsSubType: shippingMethod === 'STORE' ? resolveCvsSubType() : null,
          notes: JSON.stringify({
            recipientName,
            recipientPhone,
            recipientEmail: recipientEmail || '',
            shippingAddress,
            shippingMethod,
            paymentMethod,
            recipientCity: recipientCity || '',
            recipientDistrict: recipientDistrict || '',
            recipientPostalCode: resolvedRecipientPostalCode || '',
            recipientDetailAddress: recipientDetailAddress || '',
            productSubtotal,
            shippingFee,
            totalAmount,
            customerNote: note || '',
          }),
          recipient: {
            create: {
              name: recipientName,
              phone: recipientPhone,
              email: recipientEmail || null,
              address: shippingAddress,
              city: shippingMethod === 'STORE' ? null : recipientCity || null,
              district: shippingMethod === 'STORE' ? null : recipientDistrict || null,
              postalCode: resolvedRecipientPostalCode,
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
        createdOrder.items.map((orderItem) => [orderItem.productId, orderItem]),
      );

      for (const item of items) {
        if (item.quantity === 0) continue;

        const productSnapshot = productMap.get(item.productId)!;
        const orderItem = orderItemByProductId.get(item.productId);

        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            orderId: createdOrder.id,
            orderItemId: orderItem?.id ?? null,
            type: 'ORDER_DEDUCT',
            quantityChange: -item.quantity,
            beforeQuantity: productSnapshot.stock,
            afterQuantity: productSnapshot.stock - item.quantity,
            actorType: 'USER',
            actorId: userId,
            reason: 'order_created',
            metadata: {
              orderNumber: createdOrder.orderNumber,
              productName: productSnapshot.name,
            } satisfies Prisma.InputJsonObject,
          },
        });
      }

      return createdOrder;
    });

    let ecpayPayload: Record<string, string> | null = null;

    /**
     * ATM / CREDIT_CARD 都走綠界 AIO。
     *
     * 重要：
     * 不要在這個檔案手刻 CheckMacValue。
     * 統一交給 packages/shared/src/ecpay/checkout.ts 的 buildEcpayPayload。
     */
    if (paymentMethod === 'ATM' || paymentMethod === 'CREDIT_CARD') {
      const ecpayConfig = getEcpayRuntimeConfig();

      ecpayPayload = buildEcpayPayload({
        merchantTradeNo: order.orderNumber,
        orderNumber: order.orderNumber,
        totalAmount: Number(totalAmount),
        paymentMethod,
        items: order.items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
        })),
        merchantId: ecpayConfig.merchantId,
        hashKey: ecpayConfig.hashKey,
        hashIV: ecpayConfig.hashIV,
        apiBaseUrl: ecpayConfig.apiBaseUrl,
        webBaseUrl: ecpayConfig.webBaseUrl,
      });

      await upsertPendingPaymentTransaction({
        orderId: order.id,
        merchantTradeNo: order.orderNumber,
        amount: Number(totalAmount),
        method: paymentMethod,
        payload: ecpayPayload,
      });

      if (!isProduction) {
        console.log('========== ORDER SERVICE ECPAY RESULT ==========');
        console.log('orderNumber =', maskIdentifier(order.orderNumber));
        console.log('paymentMethod =', paymentMethod);
        console.log('totalAmount =', totalAmount);
        console.log('hasEcpayPayload =', Boolean(ecpayPayload));
        console.log('ReturnURL =', ecpayPayload.ReturnURL);
        console.log('ChoosePayment =', ecpayPayload.ChoosePayment);
        console.log('CustomField1 =', maskIdentifier(ecpayPayload.CustomField1));
        console.log('================================================');
      }
    }

    if (paymentMethod === 'COD') {
      void notifyOrderCreated(order.id);
    }

    return {
      order,
      ecpayPayload,
    };
  }

  /**
   * 重新產生付款 payload。
   *
   * 用於會員中心「立即付款」。
   *
   * 注意：
   * 重新付款時 MerchantTradeNo 會重新產生，避免綠界說交易編號重複。
   * 原始 orderNumber 會放在 CustomField1，讓 webhook 能正確找到原訂單。
   */
  static async buildRepayPayload(orderId: string, userId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new AppError(404, '訂單不存在', 'ORDER_NOT_FOUND');
    }

    if (order.userId !== userId) {
      throw new AppError(403, '無權操作此訂單', 'FORBIDDEN');
    }

    if (order.paymentMethod === 'COD') {
      throw new AppError(400, '貨到付款訂單無需線上付款', 'COD_NO_REPAY');
    }

    if (order.status === 'CANCELLED') {
      throw new AppError(400, '已取消的訂單無法付款', 'ORDER_CANCELLED');
    }

    if (order.paymentStatus === 'PAID') {
      throw new AppError(400, '此訂單已完成付款', 'ALREADY_PAID');
    }

    const ecpayConfig = getEcpayRuntimeConfig();
    const merchantTradeNo = buildRepayMerchantTradeNo(order.orderNumber);

    const ecpayPayload = buildEcpayPayload({
      merchantTradeNo,
      orderNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      paymentMethod: order.paymentMethod,
      items: order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
      })),
      merchantId: ecpayConfig.merchantId,
      hashKey: ecpayConfig.hashKey,
      hashIV: ecpayConfig.hashIV,
      apiBaseUrl: ecpayConfig.apiBaseUrl,
      webBaseUrl: ecpayConfig.webBaseUrl,
    });

    await upsertPendingPaymentTransaction({
      orderId: order.id,
      merchantTradeNo,
      amount: Number(order.totalAmount),
      method: order.paymentMethod,
      payload: ecpayPayload,
    });

    if (!isProduction) {
      console.log('========== ORDER SERVICE REPAY ECPAY RESULT ==========');
      console.log('orderNumber =', maskIdentifier(order.orderNumber));
      console.log('merchantTradeNo =', maskIdentifier(merchantTradeNo));
      console.log('paymentMethod =', order.paymentMethod);
      console.log('totalAmount =', order.totalAmount);
      console.log('ReturnURL =', ecpayPayload.ReturnURL);
      console.log('ChoosePayment =', ecpayPayload.ChoosePayment);
      console.log('CustomField1 =', maskIdentifier(ecpayPayload.CustomField1));
      console.log('=======================================================');
    }

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
      },
      ecpayPayload,
    };
  }

  static async findAllForAdmin() {
    return await prisma.order.findMany({
      select: {
        id: true,
        orderNumber: true,
        user: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  static async findById(orderId: string) {
    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
      },
    });

    if (!order) {
      throw new AppError(404, '訂單不存在', 'ORDER_NOT_FOUND');
    }

    return order;
  }

  static async findByUserId(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          userId,
        },
        include: {
          items: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.order.count({
        where: {
          userId,
        },
      }),
    ]);

    return {
      data: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
