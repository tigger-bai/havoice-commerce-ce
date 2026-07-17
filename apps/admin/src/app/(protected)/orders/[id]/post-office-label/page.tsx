import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { prisma } from '@havoice/database';

import { authOptions } from '@/lib/auth/auth-options';
import { PostOfficeLabelActions } from './PostOfficeLabelActions';

type PageProps = {
  params: {
    id: string;
  };
};

type SenderInfo = {
  configured: boolean;
  message: string | null;
  name: string;
  phone: string;
  address: string;
};

const ALLOWED_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VENDOR']);

function safeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value: unknown): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(safeNumber(value));
}

function formatDateTime(value: unknown): string {
  if (!value) return '—';
  const date = new Date(value as string | Date);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function readEnv(name: string): string {
  return process.env[name]?.trim() || '';
}

function getSenderInfo(): SenderInfo {
  const name = readEnv('POST_OFFICE_SENDER_NAME');
  const phone = readEnv('POST_OFFICE_SENDER_PHONE');
  const address = readEnv('POST_OFFICE_SENDER_ADDRESS');
  const configured = Boolean(name && phone && address);

  if (configured) {
    return {
      configured: true,
      message: null,
      name,
      phone,
      address,
    };
  }

  return {
    configured: false,
    message:
      process.env.NODE_ENV === 'production'
        ? '正式環境缺少寄件人 env 設定'
        : '尚未設定寄件人資料',
    name: name || '—',
    phone: phone || '—',
    address: address || '—',
  };
}

function getShippingMethodLabel(method: string | null): string {
  if (method === 'STANDARD') return '標準配送';
  if (method === 'EXPRESS') return '快速配送';
  if (method === 'STORE') return '超商取貨';
  return method || '—';
}

export default async function PostOfficeLabelPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/auth/login');
  }

  const sessionUser = session.user as { id?: string; role?: string };
  const role = sessionUser.role || '';

  if (!ALLOWED_ROLES.has(role)) {
    redirect('/auth/forbidden');
  }

  const order = await prisma.order.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
    },
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
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
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
          id: true,
          vendorId: true,
          productName: true,
          productPrice: true,
          quantity: true,
        },
      },
      shipments: {
        where: {
          provider: 'POST_OFFICE',
        },
        select: {
          id: true,
          provider: true,
          shippingMethod: true,
          status: true,
          trackingNumber: true,
          providerShipmentNo: true,
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
        take: 1,
      },
    },
  });

  if (!order) {
    notFound();
  }

  const visibleItems =
    role === 'VENDOR' ? order.items.filter((item) => item.vendorId === sessionUser.id) : order.items;

  if (role === 'VENDOR' && visibleItems.length === 0) {
    notFound();
  }

  const sender = getSenderInfo();
  const shipment = order.shipments[0] ?? null;

  if (!shipment) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-6">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-bold text-gray-900">郵局寄件摘要單</h1>
          <p className="mt-3 text-sm text-gray-500">此訂單尚未建立郵局出貨單。</p>
          <a
            href={`/orders/${order.id}`}
            className="mt-6 inline-flex rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            返回訂單
          </a>
        </div>
      </main>
    );
  }

  const recipientName = shipment.recipientName || order.recipient?.name || order.user?.name || '—';
  const recipientPhone = shipment.recipientPhone || order.recipient?.phone || order.user?.phone || '—';
  const recipientEmail = shipment.recipientEmail || order.recipient?.email || order.user?.email || '—';
  const recipientAddress = shipment.recipientAddress || order.recipient?.address || order.shippingAddress || '—';
  const itemsSubtotal = visibleItems.reduce(
    (sum, item) => sum + safeNumber(item.productPrice) * safeNumber(item.quantity),
    0,
  );
  const shippingFee = Math.max(0, safeNumber(order.totalAmount) - itemsSubtotal);

  return (
    <main className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @page {
          size: A4;
          margin: 12mm;
        }

        @media print {
          body {
            background: white !important;
            color: black !important;
          }

          aside,
          nav,
          header:not(.print-label-header),
          .no-print {
            display: none !important;
          }

          .print-sheet {
            width: 100% !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }

          .print-card {
            border-color: #000 !important;
            background: #fff !important;
          }
        }
      `,
        }}
      />

      <PostOfficeLabelActions orderId={order.id} />

      <section className="print-sheet mx-auto min-h-[297mm] w-[210mm] max-w-full border border-gray-300 bg-white p-10 shadow-sm">
        <header className="print-label-header border-b-2 border-black pb-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold tracking-wide text-gray-950">郵局寄件摘要單</h1>
              <p className="mt-2 text-sm font-medium text-gray-600">此文件不是正式郵局託運單，亦未產生正式郵局條碼。</p>
            </div>
            <div className="text-right text-sm text-gray-700">
              <p className="font-semibold text-gray-900">訂單編號</p>
              <p className="mt-1 font-mono text-lg font-bold text-gray-950">{order.orderNumber}</p>
            </div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div className="print-card rounded-lg border border-gray-300 p-4">
            <h2 className="text-base font-bold text-gray-950">Shipment</h2>
            <dl className="mt-3 space-y-2">
              <div className="grid grid-cols-[130px_1fr] gap-3">
                <dt className="text-gray-500">provider</dt>
                <dd className="font-medium text-gray-900">{shipment.provider || 'POST_OFFICE'}</dd>
              </div>
              <div className="grid grid-cols-[130px_1fr] gap-3">
                <dt className="text-gray-500">status</dt>
                <dd className="font-medium text-gray-900">{shipment.status || '—'}</dd>
              </div>
              <div className="grid grid-cols-[130px_1fr] gap-3">
                <dt className="text-gray-500">trackingNumber</dt>
                <dd className="break-all font-mono text-gray-900">{shipment.trackingNumber || '尚未產生追蹤碼'}</dd>
              </div>
              <div className="grid grid-cols-[130px_1fr] gap-3">
                <dt className="text-gray-500">providerShipmentNo</dt>
                <dd className="break-all font-mono text-gray-900">{shipment.providerShipmentNo || '—'}</dd>
              </div>
              <div className="grid grid-cols-[130px_1fr] gap-3">
                <dt className="text-gray-500">建立時間</dt>
                <dd className="text-gray-900">{formatDateTime(shipment.createdAt)}</dd>
              </div>
              <div className="grid grid-cols-[130px_1fr] gap-3">
                <dt className="text-gray-500">更新時間</dt>
                <dd className="text-gray-900">{formatDateTime(shipment.updatedAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="print-card rounded-lg border border-gray-300 p-4">
            <h2 className="text-base font-bold text-gray-950">訂單資訊</h2>
            <dl className="mt-3 space-y-2">
              <div className="grid grid-cols-[96px_1fr] gap-3">
                <dt className="text-gray-500">訂單狀態</dt>
                <dd className="font-medium text-gray-900">{order.status}</dd>
              </div>
              <div className="grid grid-cols-[96px_1fr] gap-3">
                <dt className="text-gray-500">付款狀態</dt>
                <dd className="font-medium text-gray-900">{order.paymentStatus}</dd>
              </div>
              <div className="grid grid-cols-[96px_1fr] gap-3">
                <dt className="text-gray-500">付款方式</dt>
                <dd className="font-medium text-gray-900">{order.paymentMethod || '—'}</dd>
              </div>
              <div className="grid grid-cols-[96px_1fr] gap-3">
                <dt className="text-gray-500">配送方式</dt>
                <dd className="font-medium text-gray-900">{getShippingMethodLabel(order.shippingMethod)}</dd>
              </div>
              <div className="grid grid-cols-[96px_1fr] gap-3">
                <dt className="text-gray-500">建立時間</dt>
                <dd className="text-gray-900">{formatDateTime(order.createdAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div className="print-card rounded-lg border border-gray-300 p-4">
            <h2 className="text-base font-bold text-gray-950">寄件人資訊</h2>
            {!sender.configured && <p className="mt-2 text-xs font-medium text-amber-700">{sender.message}</p>}
            <dl className="mt-3 space-y-2">
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <dt className="text-gray-500">姓名</dt>
                <dd className="font-medium text-gray-900">{sender.name}</dd>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <dt className="text-gray-500">電話</dt>
                <dd className="font-medium text-gray-900">{sender.phone}</dd>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <dt className="text-gray-500">地址</dt>
                <dd className="font-medium text-gray-900">{sender.address}</dd>
              </div>
            </dl>
          </div>

          <div className="print-card rounded-lg border border-gray-300 p-4">
            <h2 className="text-base font-bold text-gray-950">收件人資訊</h2>
            <dl className="mt-3 space-y-2">
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <dt className="text-gray-500">姓名</dt>
                <dd className="font-medium text-gray-900">{recipientName}</dd>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <dt className="text-gray-500">電話</dt>
                <dd className="font-medium text-gray-900">{recipientPhone}</dd>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <dt className="text-gray-500">Email</dt>
                <dd className="break-all font-medium text-gray-900">{recipientEmail}</dd>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <dt className="text-gray-500">地址</dt>
                <dd className="font-medium text-gray-900">{recipientAddress}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-base font-bold text-gray-950">商品明細</h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-y-2 border-black">
                <th className="w-14 px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">商品名稱</th>
                <th className="w-20 px-2 py-2 text-right">數量</th>
                <th className="w-28 px-2 py-2 text-right">單價</th>
                <th className="w-28 px-2 py-2 text-right">小計</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, index) => {
                const subtotal = safeNumber(item.productPrice) * safeNumber(item.quantity);

                return (
                  <tr key={item.id} className="border-b border-gray-300">
                    <td className="px-2 py-3">{index + 1}</td>
                    <td className="px-2 py-3">{item.productName}</td>
                    <td className="px-2 py-3 text-right">{item.quantity}</td>
                    <td className="px-2 py-3 text-right">{formatCurrency(item.productPrice)}</td>
                    <td className="px-2 py-3 text-right">{formatCurrency(subtotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <div className="w-[280px] text-sm">
              <div className="flex justify-between border-t border-gray-400 py-2">
                <span className="font-bold">商品小計</span>
                <span>{formatCurrency(itemsSubtotal)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-300 py-2">
                <span className="font-bold">運費</span>
                <span>{formatCurrency(shippingFee)}</span>
              </div>
              <div className="flex justify-between border-y-2 border-black py-2 text-base font-bold">
                <span>訂單總計</span>
                <span>{formatCurrency(order.totalAmount)}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div className="print-card min-h-[120px] rounded-lg border border-gray-300 p-4">
            <h2 className="text-base font-bold text-gray-950">物流事件摘要</h2>
            {shipment.events.length === 0 ? (
              <p className="mt-3 text-gray-500">尚無物流事件</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {shipment.events.map((event) => (
                  <li key={event.id} className="border-b border-gray-200 pb-2 last:border-0">
                    <p className="font-mono text-xs text-gray-600">{formatDateTime(event.createdAt)}</p>
                    <p className="font-medium text-gray-900">
                      {event.eventType} / {event.status || '—'}
                    </p>
                    <p className="text-gray-600">{event.message || '—'}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="print-card min-h-[120px] rounded-lg border border-gray-300 p-4">
            <h2 className="text-base font-bold text-gray-950">備註 / 注意事項</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-700">
              <li>本文件為內部寄件摘要單，不是正式郵局託運單。</li>
              <li>目前未產生正式郵局條碼；請依郵局正式系統或窗口要求另行處理託運資料。</li>
              <li>交寄前請再次核對收件人電話、地址與商品內容。</li>
              {shipment.trackingNumber ? null : <li>此 shipment 尚未產生追蹤碼。</li>}
            </ul>
          </div>
        </section>
      </section>
    </main>
  );
}
