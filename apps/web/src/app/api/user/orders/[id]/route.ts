import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@havoice/database';

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
 * 單筆訂單詳情 API Route
 *
 * GET /api/user/orders/:id
 * - 驗證該訂單屬於當前登入使用者（防止越權存取）
 * - 回傳完整訂單資訊 + 商品明細
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: '請先登入' },
        { status: 401 }
      );
    }

    const order = await prisma.order.findFirst({
      where: {
        id: params.id,
        userId: session.user.id, // 確保只能查看自己的訂單
        deletedAt: null,
      },
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
        items: {
          include: {
            product: {
              select: {
                id: true,
                slug: true,
                coverImage: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: '訂單不存在' },
        { status: 404 }
      );
    }

    const parsedNotes = parseOrderNotes(order.notes);
    const recipient = resolveOrderRecipient({
      recipient: order.recipient,
      notes: parsedNotes,
      user: order.user,
      shippingAddress: order.shippingAddress,
    });

    // 格式化回傳資料
    const formattedOrder = {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: Number(order.totalAmount),
      shippingAddress: recipient.address || order.shippingAddress,
      billingAddress: order.billingAddress ?? null,
      shippingMethod: order.shippingMethod ?? null,
      paymentMethod: order.paymentMethod ?? null,
      trackingNumber: order.trackingNumber ?? null,
      notes: parsedNotes.customerNote || null,
      recipient: {
        name: recipient.name || null,
        phone: recipient.phone || null,
        email: recipient.email || null,
        address: recipient.address || null,
        city: recipient.city,
        district: recipient.district,
        postalCode: recipient.postalCode,
        country: recipient.country,
      },
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productPrice: Number(item.productPrice),
        quantity: item.quantity,
        subtotal: Number(item.productPrice) * item.quantity,
        coverImage: item.product?.coverImage || null,
        slug: item.product?.slug || null,
      })),
    };

    return NextResponse.json({
      success: true,
      data: formattedOrder,
    });
  } catch (error) {
    console.error('[GET /api/user/orders/:id] Error:', error);
    return NextResponse.json(
      { success: false, message: '取得訂單詳情失敗' },
      { status: 500 }
    );
  }
}
