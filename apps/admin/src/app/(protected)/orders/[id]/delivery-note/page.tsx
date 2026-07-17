//apps/admin/src/app/%28protected%29/orders/%5Bid%5D/delivery-note/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface OrderItem {
  id: string;
  productName: string;
  productPrice: number;
  quantity: number;
  subtotal: number;
  sku: string | null;
  slug?: string | null;
  coverImage?: string | null;
}

interface OrderRecipient {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  country: string;
}

interface OrderCustomer {
  id: string | null;
  name: string;
  email: string;
  phone: string;
  facebookName: string | null;
  lineId: string | null;
  remark: string | null;
  type: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  source: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  shippingMethod: string | null;
  shippingAddress: string | null;
  trackingNumber: string | null;
  notes: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  customer: OrderCustomer;
  recipient: OrderRecipient | null;
  items: OrderItem[];
}

interface ParsedNotes {
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  shippingAddress?: string;
  customerNote?: string;
  productSubtotal?: number;
  shippingFee?: number;
  totalAmount?: number;
}

const CHECKLIST_ITEMS = [
  '已確認電話',
  '已確認地址',
  '已撿貨',
  '已包裝',
  '已填寫郵局代收單',
  '已寄出',
  '已回填追蹤號碼',
];

function safeNumber(value: unknown): number {
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

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}


function parseNotes(notes: string | null): ParsedNotes {
  if (!notes) return {};

  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === 'object') {
      return parsed as ParsedNotes;
    }
    return { customerNote: notes };
  } catch {
    return {
      customerNote: notes,
    };
  }
}

function getOrderSourceLabel(source: string | null | undefined): string {
  if (source === 'LIVE_MANUAL') return '直播人工建單';
  if (source === 'ADMIN_MANUAL') return '後台人工建單';
  if (source === 'WEB_CHECKOUT') return '前台商城結帳';
  return source || '—';
}

function getShippingMethodLabel(method: string | null, paymentMethod?: string | null): string {
  if (method === 'EC_PAY_POST_OFFICE' && paymentMethod === 'POST_OFFICE_COD') {
    return '綠界郵局宅配 / 人工郵局貨到付款作業';
  }
  if (method === 'EC_PAY_POST_OFFICE') return '綠界郵局宅配';
  if (method === 'STANDARD') return '宅配 · 標準配送';
  if (method === 'EXPRESS') return '宅配 · 快速配送';
  if (method === 'STORE') return '超商取貨';
  return method || '—';
}

function getPaymentMethodLabel(method: string | null): string {
  if (method === 'CREDIT_CARD') return '信用卡付款';
  if (method === 'ATM') return 'ATM 轉帳';
  if (method === 'COD') return '貨到付款';
  if (method === 'POST_OFFICE_COD') return '郵局貨到付款';
  return method || '—';
}

function buildFullAddress(recipient: OrderRecipient | null, fallbackAddress: string): string {
  const postalCode = recipient?.postalCode?.trim() || '';
  const city = recipient?.city?.trim() || '';
  const district = recipient?.district?.trim() || '';
  const detailAddress = recipient?.address?.trim() || fallbackAddress.trim();

  if (!postalCode && !city && !district) return detailAddress || '—';

  const hasStructuredPrefix =
    detailAddress && city && district && detailAddress.includes(city) && detailAddress.includes(district);

  if (hasStructuredPrefix) {
    return [postalCode, detailAddress].filter(Boolean).join(' ');
  }

  return [postalCode, city, district, detailAddress].filter(Boolean).join(' ');
}

function canPrintDeliveryNote(order: OrderDetail): boolean {
  return (
    order.paymentStatus === 'PAID' ||
    order.paymentMethod === 'COD' ||
    order.paymentMethod === 'POST_OFFICE_COD' ||
    order.source === 'LIVE_MANUAL'
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 border-b border-gray-200 py-2 last:border-b-0">
      <dt className="font-semibold text-gray-700">{label}</dt>
      <dd className="break-words text-gray-950">{value || '—'}</dd>
    </div>
  );
}

export default function DeliveryNotePage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        cache: 'no-store',
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入訂單資料失敗');
      }

      setOrder(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入訂單資料失敗');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const notes = useMemo(() => parseNotes(order?.notes ?? null), [order?.notes]);

  const itemsSubtotal = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((sum, item) => sum + safeNumber(item.subtotal), 0);
  }, [order]);

  const shippingFee = useMemo(() => {
    if (!order) return 0;

    if (typeof notes.shippingFee === 'number') {
      return notes.shippingFee;
    }

    return Math.max(0, safeNumber(order.totalAmount) - itemsSubtotal);
  }, [order, notes.shippingFee, itemsSubtotal]);

  useEffect(() => {
    if (!order) return;

    if (!canPrintDeliveryNote(order)) {
      setError('此訂單尚未付款，無法列印內部出貨單。');
    }
  }, [order]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-500">載入內部出貨單中...</p>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-6">
        <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-bold text-red-600">無法列印內部出貨單</h1>
          <p className="mt-2 text-sm text-gray-500">{error || '找不到此訂單'}</p>
          <Link
            href={orderId ? `/orders/${orderId}` : '/orders'}
            className="mt-5 inline-flex rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            返回訂單
          </Link>
        </div>
      </main>
    );
  }

  const recipientName = order.recipient?.name || notes.recipientName || order.customer.name || '—';
  const recipientPhone = order.recipient?.phone || notes.recipientPhone || order.customer.phone || '—';
  const recipientEmail = order.recipient?.email || notes.recipientEmail || order.customer.email || '—';
  const detailAddress = order.recipient?.address || notes.shippingAddress || order.shippingAddress || '—';
  const fullAddress = buildFullAddress(order.recipient, notes.shippingAddress || order.shippingAddress || '');
  const orderNote = notes.customerNote || order.notes || '';
  const customerRemark = order.customer.remark || '';
  const isCodLike = order.paymentMethod === 'COD' || order.paymentMethod === 'POST_OFFICE_COD';

  return (
    <main className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media print {
          html,
          body {
            background: #fff !important;
            color: #000 !important;
          }

          .no-print,
          aside,
          nav,
          header[role='banner'] {
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

          .print-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between px-2">
        <Link href={`/orders/${order.id}`} className="text-sm text-gray-500 hover:text-gray-800">
          ← 返回訂單
        </Link>

        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          列印
        </button>
      </div>

      <section className="print-sheet mx-auto min-h-[297mm] w-[210mm] max-w-full border border-gray-300 bg-white p-10 shadow-sm">
        <header className="border-b-2 border-black pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold tracking-wide text-gray-600">Havoice 後台作業單</p>
              <h1 className="mt-1 text-3xl font-bold text-gray-950">內部出貨單 / 撿貨單</h1>
              <p className="mt-2 text-sm text-gray-700">
                {order.paymentMethod === 'POST_OFFICE_COD'
                  ? '郵局貨到付款為人工作業流程，請依紙本勾選欄逐項確認。'
                  : '請依訂單資料撿貨、包裝並回填出貨資訊。'}
              </p>
            </div>

            <div className="border-2 border-black px-5 py-4 text-right">
              <p className="text-xs text-gray-600">訂單編號</p>
              <p className="mt-1 text-xl font-bold text-gray-950">{order.orderNumber}</p>
              <p className="mt-3 text-xs text-gray-600">列印時間</p>
              <p className="mt-1 text-sm font-semibold text-gray-950">{formatDateTime(new Date().toISOString())}</p>
            </div>
          </div>
        </header>

        <section className="print-section mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="border-2 border-black p-4">
            <h2 className="border-b border-black pb-2 text-lg font-bold text-gray-950">訂單資訊</h2>
            <dl className="mt-3 text-sm">
              <InfoRow label="訂單編號" value={order.orderNumber} />
              <InfoRow label="訂單來源" value={getOrderSourceLabel(order.source)} />
              <InfoRow label="建立時間" value={formatDateTime(order.createdAt)} />
              <InfoRow label="訂單狀態" value={order.status} />
              <InfoRow label="付款狀態" value={order.paymentStatus} />
              <InfoRow label="付款方式" value={getPaymentMethodLabel(order.paymentMethod)} />
              <InfoRow label="物流方式" value={getShippingMethodLabel(order.shippingMethod, order.paymentMethod)} />
              <InfoRow label="代收金額" value={isCodLike ? formatCurrency(order.totalAmount) : '非貨到付款'} />
            </dl>
          </div>

          <div className="border-2 border-black p-4">
            <h2 className="border-b border-black pb-2 text-lg font-bold text-gray-950">客戶資料</h2>
            <dl className="mt-3 text-sm">
              <InfoRow label="客戶姓名" value={order.customer.name} />
              <InfoRow label="電話" value={order.customer.phone} />
              <InfoRow label="Email" value={order.customer.email} />
              <InfoRow label="Facebook" value={order.customer.facebookName || '—'} />
              <InfoRow label="LINE ID" value={order.customer.lineId || '—'} />
              <InfoRow label="客戶備註" value={<span className="whitespace-pre-wrap">{customerRemark || '—'}</span>} />
            </dl>
          </div>
        </section>

        <section className="print-section mt-5 border-2 border-black p-4">
          <h2 className="border-b border-black pb-2 text-lg font-bold text-gray-950">收件資料</h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 text-sm sm:grid-cols-2">
            <InfoRow label="收件人" value={recipientName} />
            <InfoRow label="電話" value={recipientPhone} />
            <InfoRow label="Email" value={recipientEmail} />
            <InfoRow label="郵遞區號" value={order.recipient?.postalCode || '—'} />
            <InfoRow label="縣市" value={order.recipient?.city || '—'} />
            <InfoRow label="行政區" value={order.recipient?.district || '—'} />
            <InfoRow label="詳細地址" value={detailAddress} />
            <InfoRow label="完整地址" value={fullAddress} />
          </dl>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-bold text-gray-950">商品明細</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y-2 border-black">
                <th className="w-[56px] px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">商品名稱</th>
                <th className="w-[130px] px-2 py-2 text-left">SKU</th>
                <th className="w-[92px] px-2 py-2 text-right">單價</th>
                <th className="w-[70px] px-2 py-2 text-right">數量</th>
                <th className="w-[110px] px-2 py-2 text-right">小計</th>
              </tr>
            </thead>

            <tbody>
              {order.items.map((item, index) => (
                <tr key={item.id} className="border-b border-gray-400">
                  <td className="px-2 py-3">{index + 1}</td>
                  <td className="px-2 py-3 font-medium">{item.productName}</td>
                  <td className="px-2 py-3 font-mono text-xs">{item.sku || '—'}</td>
                  <td className="px-2 py-3 text-right">{formatCurrency(item.productPrice)}</td>
                  <td className="px-2 py-3 text-right font-bold">{item.quantity}</td>
                  <td className="px-2 py-3 text-right">{formatCurrency(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto mt-5 w-[320px] text-sm">
            <div className="flex justify-between border-t-2 border-black py-2">
              <span className="font-bold">商品小計</span>
              <span>{formatCurrency(itemsSubtotal)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-400 py-2">
              <span className="font-bold">運費</span>
              <span>{formatCurrency(shippingFee)}</span>
            </div>
            <div className="flex justify-between border-y-2 border-black py-2 text-base font-bold">
              <span>訂單總額</span>
              <span>{formatCurrency(order.totalAmount)}</span>
            </div>
            <div className="flex justify-between border-b-2 border-black py-2 text-base font-bold">
              <span>代收金額</span>
              <span>{isCodLike ? formatCurrency(order.totalAmount) : '—'}</span>
            </div>
          </div>
        </section>

        <section className="print-section mt-7 border-2 border-black p-4">
          <h2 className="text-lg font-bold text-gray-950">作業勾選欄</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 text-base sm:grid-cols-2 lg:grid-cols-3">
            {CHECKLIST_ITEMS.map((item) => (
              <label key={item} className="flex items-center gap-3">
                <span className="inline-flex h-5 w-5 shrink-0 border-2 border-black" aria-hidden />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="print-section mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="border-2 border-black p-4">
            <h2 className="text-base font-bold text-gray-950">訂單備註</h2>
            <div className="mt-3 min-h-[100px] whitespace-pre-wrap text-sm">{orderNote || ' '}</div>
          </div>

          <div className="border-2 border-black p-4">
            <h2 className="text-base font-bold text-gray-950">客戶備註</h2>
            <div className="mt-3 min-h-[100px] whitespace-pre-wrap text-sm">{customerRemark || ' '}</div>
          </div>

          <div className="border-2 border-black p-4">
            <h2 className="text-base font-bold text-gray-950">出貨備註</h2>
            <div className="mt-3 min-h-[100px] whitespace-pre-wrap text-sm"> </div>
          </div>
        </section>
      </section>
    </main>
  );
}
