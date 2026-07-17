// apps/web/src/app/api/user/orders/[id]/repay/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma, type Prisma } from '@havoice/database';
import { buildEcpayPayload, buildRepayMerchantTradeNo } from '@havoice/shared';

/**
 * 繼續付款（重新產單）BFF
 *
 * POST /api/user/orders/:id/repay
 *
 * 功能：
 * - 驗證會員 session
 * - 驗證訂單擁有權，避免越權付款
 * - 僅允許非 COD、未付款、未取消訂單重新付款
 * - 產生符合綠界規則的 MerchantTradeNo
 * - 回傳 actionUrl 與 ecpayPayload，讓前端建立 form 導向綠界付款頁
 */

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

const isProduction = process.env.NODE_ENV === 'production';

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getEnvWithDevFallback(name: string, devFallback: string): string {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (!isProduction) {
    return devFallback;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

function getEcpayActionUrl(): string {
  const value = process.env.ECPAY_ACTION_URL?.trim() || process.env.ECPAY_AIO_CHECKOUT_URL?.trim();

  if (value) {
    return value;
  }

  if (!isProduction) {
    return 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
  }

  throw new Error('Missing required environment variable: ECPAY_ACTION_URL or ECPAY_AIO_CHECKOUT_URL');
}

function sanitizePaymentPayload(payload: Record<string, string>): Prisma.InputJsonObject {
  const { CheckMacValue: _checkMacValue, ...safePayload } = payload;
  return safePayload;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          message: '請先登入',
        },
        {
          status: 401,
        },
      );
    }

    const order = await prisma.order.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
        deletedAt: null,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          message: '訂單不存在',
        },
        {
          status: 404,
        },
      );
    }

    if (order.paymentMethod === 'COD') {
      return NextResponse.json(
        {
          success: false,
          message: '貨到付款訂單無需線上付款',
        },
        {
          status: 400,
        },
      );
    }

    if (order.status === 'CANCELLED') {
      return NextResponse.json(
        {
          success: false,
          message: '已取消的訂單無法付款',
        },
        {
          status: 400,
        },
      );
    }

    if (order.paymentStatus === 'PAID') {
      return NextResponse.json(
        {
          success: false,
          message: '此訂單已完成付款',
        },
        {
          status: 400,
        },
      );
    }

    const merchantId = getRequiredEnv('ECPAY_MERCHANT_ID');
    const hashKey = getRequiredEnv('ECPAY_HASH_KEY');
    const hashIV = getRequiredEnv('ECPAY_HASH_IV');
    const apiBaseUrl = cleanBaseUrl(getRequiredEnv('API_BASE_URL'));
    const webBaseUrl = cleanBaseUrl(getEnvWithDevFallback('WEB_BASE_URL', 'http://localhost:3000'));
    const actionUrl = getEcpayActionUrl();

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
      merchantId,
      hashKey,
      hashIV,
      apiBaseUrl,
      webBaseUrl,
    });

    await prisma.paymentTransaction.upsert({
      where: {
        merchantTradeNo,
      },
      update: {
        orderId: order.id,
        amount: Number(order.totalAmount),
        method: order.paymentMethod || '',
        rawPayload: sanitizePaymentPayload(ecpayPayload),
      },
      create: {
        orderId: order.id,
        merchantTradeNo,
        amount: Number(order.totalAmount),
        method: order.paymentMethod || '',
        status: 'PENDING',
        rawPayload: sanitizePaymentPayload(ecpayPayload),
      },
    });

    if (!isProduction) {
      console.log('========== WEB REPAY ECPAY RESULT ==========');
      console.log('orderNumber =', order.orderNumber);
      console.log('merchantTradeNo =', merchantTradeNo);
      console.log('paymentMethod =', order.paymentMethod);
      console.log('totalAmount =', order.totalAmount);
      console.log('ReturnURL =', ecpayPayload.ReturnURL);
      console.log('ChoosePayment =', ecpayPayload.ChoosePayment);
      console.log('CustomField1 =', ecpayPayload.CustomField1);
      console.log('============================================');
    }

    return NextResponse.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        merchantTradeNo,
        actionUrl,
        ecpayPayload,
      },
      message: '已重新產生付款連結',
    });
  } catch (error) {
    console.error('[POST /api/user/orders/:id/repay] Error:', error);

    return NextResponse.json(
      {
        success: false,
        message: '重新產生付款連結失敗，請檢查綠界環境變數設定',
      },
      {
        status: 500,
      },
    );
  }
}
