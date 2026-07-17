'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ErrorAlert, LoadingSpinner } from '@/components/ui/LoadingAndError';
import { OrderStatusBadge, PaymentStatusBadge, ORDER_STATUS_MAP } from '@/components/ui/OrderBadges';
import { useToast } from '@/components/ui/Toast';
import { getShipmentProviderLabel } from '@/lib/shipment-provider-labels';
import {
  getPostOfficeTrackingUrl,
  isPostOfficeTrackingNumber,
  parsePostOfficeTrackingInput,
} from '@/lib/post-office-tracking';
import { formatCurrency, formatDateTime, safeNumber } from '@/lib/utils';

interface OrderItem {
  id: string;
  productName: string;
  productPrice: number;
  quantity: number;
  subtotal: number;
  sku: string | null;
  slug: string | null;
  coverImage: string | null;
}

interface PaymentTransaction {
  id: string;
  merchantTradeNo: string;
  providerTradeNo: string | null;
  amount: number;
  method: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaymentEvent {
  id: string;
  merchantTradeNo: string | null;
  providerTradeNo: string | null;
  rtnCode: string | null;
  rtnMsg: string | null;
  checkMacMatched: boolean;
  processed: boolean;
  errorMessage: string | null;
  createdAt: string;
}

interface RefundEvent {
  id: string;
  eventType: string;
  status: string | null;
  message: string | null;
  createdAt: string;
}

interface Refund {
  id: string;
  provider: string;
  amount: number;
  status: string;
  reason: string | null;
  providerRefundNo: string | null;
  createdAt: string;
  updatedAt: string;
  events: RefundEvent[];
}

interface OrderStatusLog {
  id: string;
  fromStatus: string;
  toStatus: string;
  actorType: string;
  reason: string | null;
  createdAt: string;
}

interface AdminAuditLog {
  id: string;
  action: string;
  actorEmail: string | null;
  actorName: string | null;
  description: string | null;
  createdAt: string;
}

interface ShipmentEvent {
  id: string;
  eventType: string;
  status: string | null;
  message: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

interface Shipment {
  id: string;
  provider: string | null;
  shippingMethod: string | null;
  status: string;
  trackingNumber: string | null;
  providerShipmentNo: string | null;
  paymentNo: string | null;
  validationNo: string | null;
  cvsStoreId: string | null;
  cvsStoreName: string | null;
  cvsAddress: string | null;
  cvsSubType: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  recipientAddress: string | null;
  createdAt: string;
  updatedAt: string;
  events: ShipmentEvent[];
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
  cvsStoreId: string | null;
  shippingTrackingNumber: string | null;
  shippingPaymentNo: string | null;
  shippingValidationNo: string | null;
  notes: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string | null;
    name: string;
    email: string;
    phone: string;
    facebookName: string | null;
    lineId: string | null;
    remark: string | null;
    type: string;
  };
  recipient: OrderRecipient | null;
  items: OrderItem[];
  paymentTransactions: PaymentTransaction[];
  paymentEvents: PaymentEvent[];
  refunds: Refund[];
  orderStatusLogs: OrderStatusLog[];
  adminAuditLogs: AdminAuditLog[];
  shipments: Shipment[];
  allowedTransitions: string[];
}

function getOrderSourceLabel(source: string | null | undefined): string {
  if (source === 'LIVE_MANUAL') return '直播人工建單';
  if (source === 'ADMIN_MANUAL') return '後台人工建單';
  if (source === 'WEB_CHECKOUT') return '前台商城結帳';
  return source || '—';
}

function getOtherPaymentMethodFromNotes(notes: string | null | undefined): string {
  if (!notes) return '';

  try {
    const parsed = JSON.parse(notes) as { otherPaymentMethod?: unknown; customerNote?: unknown };
    if (typeof parsed.otherPaymentMethod === 'string' && parsed.otherPaymentMethod.trim()) {
      return parsed.otherPaymentMethod.trim();
    }

    if (typeof parsed.customerNote === 'string') {
      const match = parsed.customerNote.match(/(?:^|\n)其他付款方式：(.+)/);
      return match?.[1]?.trim() || '';
    }
  } catch {
    const match = notes.match(/(?:^|\n)其他付款方式：(.+)/);
    return match?.[1]?.trim() || '';
  }

  return '';
}

function getPaymentMethodLabel(method: string | null | undefined, notes?: string | null): string {
  if (method === 'CREDIT_CARD') return '信用卡付款';
  if (method === 'ATM') return 'ATM 轉帳';
  if (method === 'COD') return '貨到付款';
  if (method === 'BANK_TRANSFER') return '匯款';
  if (method === 'CASH') return '現金';
  if (method === 'MONTHLY_SETTLEMENT') return '月結';
  if (method === 'POST_OFFICE_COD') return '貨到付款';
  if (method === 'OTHER') {
    const otherPaymentMethod = getOtherPaymentMethodFromNotes(notes);
    return otherPaymentMethod ? `其他：${otherPaymentMethod}` : '其他';
  }
  return method || '—';
}

function getShippingMethodLabel(method: string | null | undefined): string {
  if (method === 'EC_PAY_POST_OFFICE') return '綠界中華郵政一般宅配';
  if (method === 'STANDARD') return '宅配';
  if (method === 'EXPRESS') return '快速宅配';
  if (method === 'STORE') return '超商取貨';
  return method || '—';
}

const ECPAY_POST_OFFICE_CREATED_MESSAGE = '綠界中華郵政一般宅配物流單已建立';
const ECPAY_POST_OFFICE_CREATED_DISPLAY_MESSAGE = '（綠界物流）已建立中華郵政託運單';

function getShipmentProviderDisplayLabel(provider: string | null | undefined): string {
  if (provider === 'EC_PAY_POST_OFFICE') return '中華郵政';
  return getShipmentProviderLabel(provider);
}

function getShipmentShippingMethodDisplayLabel(method: string | null | undefined): string {
  if (method === 'EC_PAY_POST_OFFICE') return '綠界科技－中華郵政宅配';
  return getShippingMethodLabel(method);
}

function mapShipmentDisplayMessage(message: string | null | undefined): string {
  const trimmedMessage = message?.trim() || '';
  if (trimmedMessage === ECPAY_POST_OFFICE_CREATED_MESSAGE) {
    return ECPAY_POST_OFFICE_CREATED_DISPLAY_MESSAGE;
  }
  return trimmedMessage;
}

function getShipmentStatusLabel(status: string | null | undefined): string {
  if (status === 'PENDING') return '待建立';
  if (status === 'CREATED') return '已建立';
  if (status === 'ACCEPTED') return '已收件';
  if (status === 'SHIPPED') return '已出貨';
  if (status === 'IN_TRANSIT') return '配送中';
  if (status === 'DELIVERED') return '已送達';
  if (status === 'FAILED') return '配送失敗';
  if (status === 'CANCELLED') return '已取消';
  return status || '—';
}

function getShipmentProgressBadgeClass(activeStepIndex: number): string {
  if (activeStepIndex >= 6) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (activeStepIndex >= 4) return 'border-blue-200 bg-blue-50 text-blue-700';
  if (activeStepIndex >= 2) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (activeStepIndex >= 1) return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-gray-200 bg-gray-50 text-gray-700';
}

const SHIPMENT_PROGRESS_STEPS = [
  '已建立物流單',
  '訂單處理中',
  '郵局確認 / 可列印',
  '郵局已收件',
  '轉運 / 運輸途中',
  '投遞中',
  '已送達',
] as const;

type ShipmentProgressInfo = {
  activeStepIndex: number;
  displayStatus: string;
};

function shipmentEventText(event: ShipmentEvent): string {
  return [event.status, event.message, event.eventType].filter(Boolean).join(' ');
}

function hasShipmentEventMatch(shipment: Shipment, patterns: Array<string | RegExp>): boolean {
  return shipment.events.some((event) => {
    const text = shipmentEventText(event);
    return patterns.some((pattern) => (typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)));
  });
}

function getShipmentProgressInfo(shipment: Shipment): ShipmentProgressInfo {
  const latestEvent = shipment.events[0] ?? null;

  const isDelivered = hasShipmentEventMatch(shipment, ['投遞成功', '已送達', '配送完成', '已完成']);
  const isDelivering = hasShipmentEventMatch(shipment, ['郵件投遞中', '投遞中', '配達中']);
  const isInTransit = hasShipmentEventMatch(shipment, ['郵件轉運中', '運輸途中', '轉運中', '寄送中', '配送中']);
  const isAccepted = hasShipmentEventMatch(shipment, ['交寄郵件', '郵局已收件', '已收件']);
  const isConfirmed = hasShipmentEventMatch(shipment, [/\b320\b/, '郵局已確認資料', '可列印']);
  const isUploading = hasShipmentEventMatch(shipment, [/\b310\b/, '訂單上傳物流中', '上傳物流中']);
  const isProcessing = hasShipmentEventMatch(shipment, [/\b300\b/, '訂單處理中']);

  let activeStepIndex = 0;
  if (isProcessing || isUploading) activeStepIndex = 1;
  if (isConfirmed) activeStepIndex = 2;
  if (isAccepted) activeStepIndex = 3;
  if (isInTransit) activeStepIndex = 4;
  if (isDelivering) activeStepIndex = 5;
  if (isDelivered) activeStepIndex = 6;

  let displayStatus = mapShipmentDisplayMessage(latestEvent?.message) || latestEvent?.status || '';
  if (!displayStatus) {
    if (isDelivered) displayStatus = '已送達';
    else if (isDelivering) displayStatus = '投遞中';
    else if (isInTransit) displayStatus = '轉運 / 運輸途中';
    else if (isAccepted) displayStatus = '郵局已收件';
    else if (isConfirmed) displayStatus = '郵局已確認資料，可列印';
    else if (isUploading) displayStatus = '訂單上傳物流中';
    else if (isProcessing) displayStatus = '訂單處理中';
    else displayStatus = getShipmentStatusLabel(shipment.status);
  }

  return { activeStepIndex, displayStatus };
}

function getShipmentEventMetadataText(event: ShipmentEvent, keys: string[]): string {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object') return '';

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }

  return '';
}

function getShipmentEventDisplayTime(event: ShipmentEvent): string {
  return (
    getShipmentEventMetadataText(event, ['statusDate', 'StatusDate', 'processingTime', '處理日期時間']) ||
    event.createdAt
  );
}

type PostOfficeSyncState = {
  type: 'idle' | 'syncing' | 'success' | 'error' | 'skipped';
  message: string;
  syncedCount?: number;
};

type PaymentConfirmationForm = {
  amount: string;
  paidAt: string;
  method: string;
  transactionNote: string;
  adminNote: string;
};

const PAYMENT_CONFIRMATION_METHODS = [
  { value: 'BANK_TRANSFER', label: '匯款' },
  { value: 'CASH', label: '現金' },
  { value: 'MONTHLY_SETTLEMENT', label: '月結' },
  { value: 'POST_OFFICE_COD', label: '貨到付款' },
  { value: 'OTHER', label: '其他' },
];

function getTodayInputDate(): string {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function getOrderTrackingCandidates(order: Pick<OrderDetail, 'trackingNumber' | 'shippingTrackingNumber' | 'shipments'>): string[] {
  return [
    order.trackingNumber,
    order.shippingTrackingNumber,
    ...order.shipments.flatMap((shipment) => [shipment.trackingNumber, shipment.providerShipmentNo]),
  ].filter((value): value is string => Boolean(value));
}

function getPrimaryTrackingNumber(order: Pick<OrderDetail, 'trackingNumber' | 'shippingTrackingNumber' | 'shipments'>): string {
  return getOrderTrackingCandidates(order)[0] || '';
}

function getValidPostOfficeTrackingNumber(order: Pick<OrderDetail, 'trackingNumber' | 'shippingTrackingNumber' | 'shipments'>): string {
  return getOrderTrackingCandidates(order).find((value) => isPostOfficeTrackingNumber(value)) || '';
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id;
  const { toast } = useToast();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [trackingInput, setTrackingInput] = useState('');
  const [savingTracking, setSavingTracking] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentConfirmationForm>({
    amount: '',
    paidAt: getTodayInputDate(),
    method: 'BANK_TRANSFER',
    transactionNote: '',
    adminNote: '',
  });
  const [creatingLogistics, setCreatingLogistics] = useState(false);
  const [creatingEcpayPostOffice, setCreatingEcpayPostOffice] = useState(false);
  const [syncingPostOfficeTracking, setSyncingPostOfficeTracking] = useState(false);
  const [postOfficeSyncState, setPostOfficeSyncState] = useState<PostOfficeSyncState>({
    type: 'idle',
    message: '',
  });

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${orderId}`, { cache: 'no-store' });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '載入訂單詳情失敗');
      }

      setOrder(json.data);
      setTrackingInput(json.data?.trackingNumber ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const saveTracking = async (inputOverride?: string) => {
    if (!orderId) return;

    const inputToParse = inputOverride ?? trackingInput;
    const parsedTracking = parsePostOfficeTrackingInput(inputToParse);
    if (inputToParse.trim() && !parsedTracking.trackingNumber) {
      toast.error(parsedTracking.error || '無法從輸入內容解析郵局郵件號碼，請確認後再儲存');
      return;
    }

    const trackingNumberToSave = parsedTracking.trackingNumber;
    setSavingTracking(true);

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: trackingNumberToSave }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '儲存物流單號失敗');
      }

      if (!trackingNumberToSave) {
        toast.success('物流單號已清除');
      } else if (isPostOfficeTrackingNumber(trackingNumberToSave)) {
        toast.success(`已儲存郵局追蹤號：${trackingNumberToSave}`);
      } else {
        toast.success('物流單號已儲存，符合出貨條件的訂單會自動標記為已出貨');
      }

      setTrackingInput(json.data?.trackingNumber ?? trackingNumberToSave);
      await fetchOrder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '儲存物流單號失敗');
    } finally {
      setSavingTracking(false);
    }
  };

  const submitPaymentConfirmation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!orderId) return;

    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('請輸入有效的收款金額');
      return;
    }

    setSubmittingPayment(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/payment-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paidAt: paymentForm.paidAt,
          method: paymentForm.method,
          transactionNote: paymentForm.transactionNote,
          adminNote: paymentForm.adminNote,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '新增收款紀錄失敗');
      }

      toast.success(
        json.data?.paymentStatus === 'PAID'
          ? '收款紀錄已新增，訂單已標記為已付款'
          : '收款紀錄已新增',
      );
      setPaymentForm((prev) => ({
        ...prev,
        amount: '',
        paidAt: getTodayInputDate(),
        transactionNote: '',
        adminNote: '',
      }));
      await fetchOrder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '新增收款紀錄失敗');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const syncPostOfficeTracking = useCallback(
    async () => {
      if (!orderId || !order) return;

      const trackingNumber = getValidPostOfficeTrackingNumber(order);
      if (!trackingNumber) {
        toast.error('此訂單沒有有效的郵局追蹤號碼');
        return;
      }

      setSyncingPostOfficeTracking(true);
      setPostOfficeSyncState({
        type: 'syncing',
        message: '同步中...',
      });

      try {
        const res = await fetch(`/api/orders/${orderId}/post-office-tracking/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'manual' }),
        });

        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message || '同步郵局物流狀態失敗');
        }

        const syncedCount = safeNumber(json.data?.syncedCount);
        const eventCount = safeNumber(json.data?.eventCount);
        const message =
          eventCount === 0
            ? '目前無法透過非官方介面取得物流紀錄，請使用官方查詢頁確認。'
            : json.data?.message || '已取得郵局物流狀態';
        setPostOfficeSyncState({ type: eventCount === 0 ? 'error' : 'success', message, syncedCount });
        if (eventCount === 0) {
          toast.error(message);
        } else {
          toast.success(message);
        }
        await fetchOrder();
      } catch (err) {
        const message = err instanceof Error ? err.message : '同步郵局物流狀態失敗';
        setPostOfficeSyncState({ type: 'error', message });
        toast.error(message);
      } finally {
        setSyncingPostOfficeTracking(false);
      }
    },
    [fetchOrder, order, orderId, toast],
  );

  const createLogistics = async () => {
    if (!orderId) return;

    setCreatingLogistics(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/logistics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '申請交貨便寄件代碼失敗');
      }

      toast.success('交貨便寄件代碼已產生，訂單已標記為已出貨');
      await fetchOrder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '申請交貨便寄件代碼失敗');
    } finally {
      setCreatingLogistics(false);
    }
  };

  const createEcpayPostOfficeShipment = async () => {
    if (!orderId) return;

    setCreatingEcpayPostOffice(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/ecpay-post-office`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '建立綠界郵局一般宅配物流單失敗');
      }

      toast.success(json.data?.mock ? '綠界郵局一般宅配物流單 mock 已建立' : '綠界郵局一般宅配物流單已建立');
      await fetchOrder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '建立綠界郵局一般宅配物流單失敗');
    } finally {
      setCreatingEcpayPostOffice(false);
    }
  };

  const changeStatus = async (next: string) => {
    if (!orderId) return;

    setSubmitting(true);

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || '更新失敗');
      }

      toast.success(`已更新為「${ORDER_STATUS_MAP[next]?.label ?? next}」`);
      await fetchOrder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新訂單狀態失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <LoadingSpinner message="載入訂單詳情中..." />;
  if (error) return <ErrorAlert message={error} onRetry={fetchOrder} />;
  if (!order) return <ErrorAlert message="找不到此訂單" />;

  const itemsSubtotal = order.items.reduce((sum, it) => sum + safeNumber(it.subtotal), 0);
  const shippingFee = safeNumber(order.totalAmount) - itemsSubtotal;
  const paidAmount = Math.round(
    order.paymentTransactions
      .filter((transaction) => transaction.status === 'PAID')
      .reduce((sum, transaction) => sum + safeNumber(transaction.amount), 0) * 100,
  ) / 100;
  const unpaidAmount = Math.max(0, Math.round((safeNumber(order.totalAmount) - paidAmount) * 100) / 100);
  const recipientName = order.recipient?.name || order.customer.name || '—';
  const recipientPhone = order.recipient?.phone || '—';
  const recipientEmail = order.recipient?.email || order.customer.email || '—';
  const recipientAddress = order.recipient?.address || order.shippingAddress || '—';

  const isCancelled = order.status === 'CANCELLED';
  const isLiveManualOrder = order.source === 'LIVE_MANUAL';
  const isPostOfficeCod = order.paymentMethod === 'POST_OFFICE_COD';

  /**
   * 正式出貨/正式物流判斷規則：
   * 1. 既有貨到付款 COD：可以出貨
   * 2. 已付款 PAID：可以出貨
   *
   * 付款方式與出貨方式分開管理；POST_OFFICE_COD 不代表已完成綠界/郵局代收串接。
   */
  const canFulfill = order.paymentMethod === 'COD' || order.paymentStatus === 'PAID';
  const canPrintDeliveryNote = canFulfill || isPostOfficeCod || isLiveManualOrder;

  const FULFILL_STATUSES = new Set(['SHIPPED', 'DELIVERED']);

  const fulfillTooltip = canFulfill
    ? ''
    : '此訂單尚未付款。若已收到款項，請先標記為已付款；若需先出貨，請確認付款方式或內部授權。';
  const printTooltip = canPrintDeliveryNote
    ? ''
    : '此訂單尚未付款，無法列印出貨單（限已付款、既有 COD 或直播人工訂單）';

  /**
   * 綠界 C2C 交貨便只適用超商取貨訂單。
   * 這跟「列印出貨單」不同：
   * - 列印出貨單：所有可出貨訂單都可以
   * - 申請交貨便寄件代碼：只有 STORE 超商取貨訂單可以
   */
  const isCvsOrder = order.shippingMethod === 'STORE';
  const hasShippingCode = !!order.shippingTrackingNumber;
  const canCreateLogistics = isCvsOrder && !hasShippingCode && canFulfill && !isCancelled;

  const ecpayPostOfficeShipment =
    order.shipments.find((shipment) => shipment.provider === 'EC_PAY_POST_OFFICE') ?? null;
  const hasEcpayPostOfficeShipment = Boolean(ecpayPostOfficeShipment);

  let ecpayPostOfficeBlockedReason = '';
  if (hasEcpayPostOfficeShipment) {
    ecpayPostOfficeBlockedReason = '已建立綠界郵局一般宅配物流單';
  }

  const canCreateEcpayPostOfficeShipment = !ecpayPostOfficeBlockedReason;
  const primaryTrackingNumber = getPrimaryTrackingNumber(order);
  const validPostOfficeTrackingNumber = getValidPostOfficeTrackingNumber(order);
  const parsedTrackingInput = parsePostOfficeTrackingInput(trackingInput);
  const trackingUrlFromCurrentInput =
    parsedTrackingInput.trackingNumber === primaryTrackingNumber ? parsedTrackingInput.trackingUrl : undefined;
  const parsedTrackingPreview =
    trackingInput.trim() && parsedTrackingInput.trackingNumber !== trackingInput.trim()
      ? parsedTrackingInput.trackingNumber
      : '';

  const openPostOfficeTracking = (trackingNumber = primaryTrackingNumber) => {
    if (!trackingNumber) {
      toast.error('尚未有可查詢的追蹤號碼');
      return;
    }

    const trackingUrl = getPostOfficeTrackingUrl(
      trackingNumber === primaryTrackingNumber ? trackingUrlFromCurrentInput : undefined,
    );
    window.open(trackingUrl, '_blank', 'noopener,noreferrer');

    if (!(trackingNumber === primaryTrackingNumber && trackingUrlFromCurrentInput)) {
      toast.success('已開啟中華郵政查詢頁，請貼上追蹤號並完成圖形驗證碼');
    }
  };

  const copyTrackingNumber = async (trackingNumber = primaryTrackingNumber) => {
    if (!trackingNumber) {
      toast.error('尚未有可複製的追蹤號碼');
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(trackingNumber);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = trackingNumber;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      toast.success(`已複製追蹤號：${trackingNumber}`);
    } catch {
      toast.error(`無法自動複製，請手動複製：${trackingNumber}`);
    }
  };

  return (
    <div className="order-detail-root space-y-6">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }

          .order-detail-root,
          .order-detail-root * {
            visibility: visible;
          }

          .order-detail-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 24px;
          }

          .no-print {
            display: none !important;
          }

          aside,
          nav,
          header {
            display: none !important;
          }
        }
      `}</style>

      <Link href="/orders" className="no-print inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        返回訂單列表
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{order.orderNumber}</h1>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>

          <p className="mt-2 text-sm text-gray-500">
            建立於 {formatDateTime(order.createdAt)}．最後更新 {formatDateTime(order.updatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4">
          <div className="text-right">
            <p className="text-sm text-gray-500">訂單總金額</p>
            <p className="text-2xl font-bold text-brand-700">{formatCurrency(order.totalAmount)}</p>
          </div>

          {!isCancelled && canPrintDeliveryNote && (
            <Link
              href={`/orders/${order.id}/delivery-note`}
              target="_blank"
              className="no-print inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"
                />
              </svg>
              列印內部出貨單 / 撿貨單
            </Link>
          )}

          {!isCancelled && !canPrintDeliveryNote && (
            <button
              type="button"
              disabled
              title={printTooltip}
              className="no-print inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-400 opacity-60"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"
                />
              </svg>
              列印內部出貨單 / 撿貨單
            </button>
          )}
        </div>
      </div>

      {(isLiveManualOrder || isPostOfficeCod) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-amber-900">
                {isPostOfficeCod ? '貨到付款注意事項' : '直播人工訂單出貨資訊'}
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                {isPostOfficeCod
                  ? '目前付款方式為貨到付款。綠界中華郵政一般宅配託運單僅用於寄送，不會自動代收貨款；若需要郵局代收貨款，請改走人工郵局代收流程。'
                  : '此直播訂單可依實際收款方式安排出貨，並可建立綠界中華郵政一般宅配託運單。'}
              </p>
            </div>
            <div className="rounded-lg bg-white/70 px-4 py-3 text-sm text-amber-900">
              {isPostOfficeCod ? '代收金額' : '訂單金額'}：
              <span className="font-bold">{formatCurrency(order.totalAmount)}</span>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-amber-700">訂單來源</dt>
              <dd className="mt-0.5 font-semibold text-amber-950">{getOrderSourceLabel(order.source)}</dd>
            </div>
            <div>
              <dt className="text-amber-700">付款方式</dt>
              <dd className="mt-0.5 font-semibold text-amber-950">
                {getPaymentMethodLabel(order.paymentMethod, order.notes)}
              </dd>
            </div>
            <div>
              <dt className="text-amber-700">物流方向</dt>
              <dd className="mt-0.5 font-semibold text-amber-950">
                {getShippingMethodLabel(order.shippingMethod)}
              </dd>
            </div>
            <div>
              <dt className="text-amber-700">付款狀態</dt>
              <dd className="mt-0.5 font-semibold text-amber-950">{order.paymentStatus}</dd>
            </div>
          </dl>

          <div className="mt-4 grid grid-cols-1 gap-4 text-sm lg:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-white p-4">
              <h3 className="font-semibold text-gray-900">客戶資料</h3>
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">姓名</dt>
                  <dd className="font-medium text-gray-900">{order.customer.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">電話</dt>
                  <dd className="font-medium text-gray-900">{order.customer.phone || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="break-all font-medium text-gray-900">{order.customer.email || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Facebook / LINE</dt>
                  <dd className="font-medium text-gray-900">
                    {[order.customer.facebookName, order.customer.lineId].filter(Boolean).join(' / ') || '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-amber-200 bg-white p-4">
              <h3 className="font-semibold text-gray-900">收件資料</h3>
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">收件人</dt>
                  <dd className="font-medium text-gray-900">{recipientName}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">電話</dt>
                  <dd className="font-medium text-gray-900">{recipientPhone}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="break-all font-medium text-gray-900">{recipientEmail}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">地址</dt>
                  <dd className="font-medium text-gray-900">{recipientAddress}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      <div className="no-print rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">收款管理</h2>
            <p className="mt-1 text-xs text-gray-400">
              用於記錄直播人工訂單或後台確認的實際收款，不新增複雜訂單流程。
            </p>
          </div>
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <dt className="text-xs text-gray-500">訂單總金額</dt>
            <dd className="mt-1 font-semibold text-gray-900">{formatCurrency(order.totalAmount)}</dd>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <dt className="text-xs text-gray-500">付款方式</dt>
            <dd className="mt-1 font-semibold text-gray-900">
              {getPaymentMethodLabel(order.paymentMethod, order.notes)}
            </dd>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <dt className="text-xs text-gray-500">目前付款狀態</dt>
            <dd className="mt-1 font-semibold text-gray-900">{order.paymentStatus}</dd>
          </div>
          <div className="rounded-lg bg-emerald-50 px-4 py-3">
            <dt className="text-xs text-emerald-700">已收款金額</dt>
            <dd className="mt-1 font-semibold text-emerald-800">{formatCurrency(paidAmount)}</dd>
          </div>
          <div className="rounded-lg bg-amber-50 px-4 py-3">
            <dt className="text-xs text-amber-700">尚未收款金額</dt>
            <dd className="mt-1 font-semibold text-amber-800">{formatCurrency(unpaidAmount)}</dd>
          </div>
        </dl>

        <form onSubmit={submitPaymentConfirmation} className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">收款金額</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={paymentForm.amount}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))}
                  placeholder={unpaidAmount > 0 ? String(unpaidAmount) : '0'}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                {unpaidAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => setPaymentForm((prev) => ({ ...prev, amount: String(unpaidAmount) }))}
                    className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    帶入
                  </button>
                )}
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-600">收款日期</span>
              <input
                type="date"
                value={paymentForm.paidAt}
                onChange={(event) => setPaymentForm((prev) => ({ ...prev, paidAt: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-600">收款方式</span>
              <select
                value={paymentForm.method}
                onChange={(event) => setPaymentForm((prev) => ({ ...prev, method: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {PAYMENT_CONFIRMATION_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-600">匯款後五碼 / 交易備註</span>
              <input
                type="text"
                value={paymentForm.transactionNote}
                onChange={(event) => setPaymentForm((prev) => ({ ...prev, transactionNote: event.target.value }))}
                placeholder="例如：12345、現金收訖"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-gray-600">管理備註</span>
            <textarea
              value={paymentForm.adminNote}
              onChange={(event) => setPaymentForm((prev) => ({ ...prev, adminNote: event.target.value }))}
              rows={3}
              placeholder="可記錄確認人、對帳備註、月結說明等"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              累計收款達訂單總金額時，系統會將付款狀態更新為 PAID；未達總額時仍保留目前付款狀態。
            </p>
            <button
              type="submit"
              disabled={submittingPayment || !paymentForm.amount}
              className="inline-flex justify-center rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submittingPayment ? '新增中...' : '新增收款紀錄'}
            </button>
          </div>
        </form>
      </div>

      {!isCancelled && order.allowedTransitions.length > 0 && (
        <div className="no-print rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">變更訂單狀態</h2>

          {!canFulfill && <p className="mt-1 text-xs text-amber-600">⚠️ {fulfillTooltip}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            {order.allowedTransitions.map((s) => {
              const locked = FULFILL_STATUSES.has(s) && !canFulfill;

              return (
                <button
                  key={s}
                  type="button"
                  disabled={submitting || locked}
                  title={locked ? fulfillTooltip : undefined}
                  onClick={() => changeStatus(s)}
                  className="rounded-lg border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-50"
                >
                  標記為「{ORDER_STATUS_MAP[s]?.label ?? s}」
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isCancelled && (
        <div className="no-print rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">物流單號</h2>

          <p className="mt-1 text-xs text-gray-400">
            可輸入或掃描郵局收據 QR Code / 郵件號碼；系統會自動整理為可追蹤的郵件號碼。
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void saveTracking(e.currentTarget.value);
              }}
              placeholder="例如：97495522007170235000，或直接掃描郵局收據 QR Code"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            <button
              type="button"
              disabled={savingTracking || trackingInput.trim() === (order.trackingNumber ?? '')}
              onClick={() => saveTracking()}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {savingTracking ? '儲存中...' : '儲存單號'}
            </button>
          </div>

          {parsedTrackingPreview && (
            <p className="mt-2 text-xs text-emerald-700">儲存時會整理為：{parsedTrackingPreview}</p>
          )}

          {trackingInput.trim() && parsedTrackingInput.error && (
            <p className="mt-2 text-xs text-amber-600">{parsedTrackingInput.error}</p>
          )}

          {primaryTrackingNumber && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-gray-500">目前追蹤號</p>
                <p className="mt-0.5 break-all font-mono text-sm font-semibold text-gray-900">
                  {primaryTrackingNumber}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  中華郵政查詢頁仍需人工輸入圖形驗證碼；系統不會自動查詢或繞過驗證。
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openPostOfficeTracking()}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  追蹤郵件進度
                </button>

                <button
                  type="button"
                  onClick={() => copyTrackingNumber()}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  複製追蹤號
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="no-print rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">綠界中華郵政一般宅配流程</h2>
            <p className="mt-1 text-xs text-gray-500">
              付款方式與出貨方式分開管理。綠界中華郵政一般宅配託運單僅用於寄送，不會自動代收貨款。
            </p>
          </div>

          {hasEcpayPostOfficeShipment ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                已建立綠界郵局一般宅配物流單
              </span>
              <Link
                href={`/api/orders/${order.id}/ecpay-post-office/print-label?printMode=A4`}
                target="_blank"
                className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                列印綠界郵局託運單
              </Link>
            </div>
          ) : (
            <button
              type="button"
              disabled={!canCreateEcpayPostOfficeShipment || creatingEcpayPostOffice}
              title={ecpayPostOfficeBlockedReason || undefined}
              onClick={createEcpayPostOfficeShipment}
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingEcpayPostOffice ? '建立中...' : '建立綠界郵局一般宅配物流單'}
            </button>
          )}
        </div>

        {isPostOfficeCod && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            目前付款方式為貨到付款。請注意：綠界中華郵政一般宅配託運單不會替你代收貨款；若需要郵局代收貨款，請改走人工郵局代收流程。
          </div>
        )}

        {hasEcpayPostOfficeShipment && ecpayPostOfficeShipment ? (
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-gray-50 px-4 py-3">
              <dt className="text-xs text-gray-500">AllPayLogisticsID</dt>
              <dd className="mt-1 break-all font-mono text-gray-900">
                {ecpayPostOfficeShipment.providerShipmentNo || '—'}
              </dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-4 py-3">
              <dt className="text-xs text-gray-500">BookingNote / trackingNumber</dt>
              <dd className="mt-1 break-all font-mono text-gray-900">
                {ecpayPostOfficeShipment.trackingNumber || '—'}
              </dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-4 py-3">
              <dt className="text-xs text-gray-500">Shipment status</dt>
              <dd className="mt-1 font-medium text-gray-900">{ecpayPostOfficeShipment.status}</dd>
            </div>
          </dl>
        ) : ecpayPostOfficeBlockedReason ? (
          <p className="mt-3 text-xs text-amber-600">⚠️ {ecpayPostOfficeBlockedReason}</p>
        ) : (
          <p className="mt-3 text-xs text-emerald-700">可建立綠界中華郵政一般宅配物流單。</p>
        )}
      </div>

      {isCvsOrder && !isCancelled && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">超商交貨便（C2C）寄件代碼</h2>

          {hasShippingCode ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-emerald-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <span className="text-sm font-semibold">
                  已取得交貨便寄件代碼，請出貨人員至超商 ibon / FamiPort 列印標籤出貨
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-white px-4 py-3 shadow-sm">
                  <dt className="text-xs text-gray-500">交貨便代碼／寄件編號</dt>
                  <dd className="mt-1 break-all text-lg font-bold tracking-wide text-gray-900">
                    {order.shippingTrackingNumber || '—'}
                  </dd>
                </div>

                <div className="rounded-lg bg-white px-4 py-3 shadow-sm">
                  <dt className="text-xs text-gray-500">交貨便代碼（CVSPaymentNo）</dt>
                  <dd className="mt-1 break-all text-lg font-bold tracking-wide text-gray-900">
                    {order.shippingPaymentNo || '—'}
                  </dd>
                </div>

                <div className="rounded-lg bg-white px-4 py-3 shadow-sm">
                  <dt className="text-xs text-gray-500">驗證碼（CVSValidationNo）</dt>
                  <dd className="mt-1 break-all text-lg font-bold tracking-wide text-gray-900">
                    {order.shippingValidationNo || '—'}
                  </dd>
                </div>
              </dl>

              <p className="mt-3 text-xs text-emerald-700">
                7-ELEVEN 需「交貨便代碼 + 驗證碼」於 ibon 列印；其他超商使用「交貨便代碼／寄件編號」。
              </p>
            </div>
          ) : (
            <div className="no-print mt-3">
              <p className="text-xs text-gray-400">
                向綠界物流自動拋單，取得 7-11／全家／萊爾富／OK 交貨便寄件代碼，拋單成功後訂單將自動標記為「已出貨」。
              </p>

              {!canFulfill && <p className="mt-1 text-xs text-amber-600">⚠️ {fulfillTooltip}</p>}

              <button
                type="button"
                disabled={!canCreateLogistics || creatingLogistics}
                title={!canFulfill ? fulfillTooltip : undefined}
                onClick={createLogistics}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingLogistics ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                    </svg>
                    拋單中，請稍候...
                  </>
                ) : (
                  '申請交貨便寄件代碼'
                )}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">物流配送進度</h2>
            <p className="mt-1 text-sm text-gray-500">
              查看此訂單已建立的物流單、追蹤號與 webhook 寫入的配送事件。
            </p>
          </div>

          {validPostOfficeTrackingNumber && (
            <div className="no-print flex flex-col items-start gap-1 sm:items-end">
              <button
                type="button"
                onClick={() => syncPostOfficeTracking()}
                disabled={syncingPostOfficeTracking}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncingPostOfficeTracking ? '同步中...' : '嘗試同步郵局物流狀態（實驗）'}
              </button>
              <p className="max-w-sm text-xs leading-relaxed text-amber-600">
                實驗功能，若同步失敗請以中華郵政官方查詢頁為準。
              </p>
            </div>
          )}
        </div>

        {postOfficeSyncState.type !== 'idle' && (
          <div
            className={`border-b border-gray-100 px-6 py-3 text-sm ${
              postOfficeSyncState.type === 'error'
                ? 'bg-amber-50 text-amber-700'
                : postOfficeSyncState.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-50 text-gray-600'
            }`}
          >
            {postOfficeSyncState.message}
          </div>
        )}

        {order.shipments.length === 0 ? (
          <div className="px-6 py-8">
            <p className="text-sm text-gray-500">尚未建立物流單。</p>
            {!isCancelled && (
              <p className="mt-2 text-xs text-gray-400">
                可使用上方綠界中華郵政一般宅配或超商交貨便功能建立物流資料。
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {order.shipments.map((shipment) => {
              const shipmentTrackingNumber = shipment.trackingNumber || '';
              const shipmentAddress =
                shipment.recipientAddress ||
                [shipment.cvsStoreName, shipment.cvsAddress].filter(Boolean).join(' ') ||
                recipientAddress;
              const progressInfo = getShipmentProgressInfo(shipment);

              return (
                <div key={shipment.id} className="px-6 py-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {getShipmentProviderDisplayLabel(shipment.provider)}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getShipmentProgressBadgeClass(
                            progressInfo.activeStepIndex,
                          )}`}
                        >
                          {progressInfo.displayStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        配送方式：{getShipmentShippingMethodDisplayLabel(shipment.shippingMethod || order.shippingMethod)}
                      </p>
                    </div>

                    {(shipmentTrackingNumber || shipment.provider === 'EC_PAY_POST_OFFICE') && (
                      <div className="no-print flex flex-wrap gap-2">
                        {shipmentTrackingNumber && (
                          <>
                            <button
                              type="button"
                              onClick={() => copyTrackingNumber(shipmentTrackingNumber)}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                            >
                              複製追蹤號
                            </button>
                            <button
                              type="button"
                              onClick={() => openPostOfficeTracking(shipmentTrackingNumber)}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                            >
                              開啟中華郵政郵件查詢
                            </button>
                          </>
                        )}
                        {shipment.provider === 'EC_PAY_POST_OFFICE' && (
                          <Link
                            href={`/api/orders/${order.id}/ecpay-post-office/print-label?printMode=A4`}
                            target="_blank"
                            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                          >
                            列印綠界郵局託運單
                          </Link>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-6">
                    <div className="overflow-x-auto pb-2">
                      <div className="grid min-w-[760px] grid-cols-7 gap-2">
                        {SHIPMENT_PROGRESS_STEPS.map((step, index) => {
                          const isCompleted = index < progressInfo.activeStepIndex;
                          const isCurrent = index === progressInfo.activeStepIndex;
                          const isActive = index <= progressInfo.activeStepIndex;

                          return (
                            <div key={step} className="relative flex flex-col items-center text-center">
                              {index > 0 && (
                                <div
                                  className={`absolute right-1/2 top-4 h-0.5 w-full ${
                                    isActive ? 'bg-brand-500' : 'bg-gray-200'
                                  }`}
                                />
                              )}
                              <div
                                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
                                  isCurrent
                                    ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                                    : isCompleted
                                      ? 'border-brand-500 bg-brand-500 text-white'
                                      : 'border-gray-300 bg-white text-gray-400'
                                }`}
                              >
                                {isCompleted ? '✓' : index + 1}
                              </div>
                              <p
                                className={`mt-2 text-xs font-medium ${
                                  isActive ? 'text-gray-900' : 'text-gray-400'
                                }`}
                              >
                                {step}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <p className="mt-3 text-center text-sm font-medium text-gray-700">
                      目前進度：{progressInfo.displayStatus}
                    </p>
                  </div>

                  <dl className="mt-5 grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <dt className="text-xs text-gray-500">物流商 / provider</dt>
                      <dd className="mt-1 font-medium text-gray-900">
                        {getShipmentProviderDisplayLabel(shipment.provider)}
                      </dd>
                      {shipment.provider ? (
                        <dd className="mt-0.5 font-mono text-[11px] text-gray-500">{shipment.provider}</dd>
                      ) : null}
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <dt className="text-xs text-gray-500">配送方式 / shippingMethod</dt>
                      <dd className="mt-1 font-medium text-gray-900">
                        {getShipmentShippingMethodDisplayLabel(shipment.shippingMethod || order.shippingMethod)}
                      </dd>
                      {shipment.shippingMethod ? (
                        <dd className="mt-0.5 font-mono text-[11px] text-gray-500">{shipment.shippingMethod}</dd>
                      ) : null}
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <dt className="text-xs text-gray-500">物流狀態 / status</dt>
                      <dd className="mt-1 font-medium text-gray-900">{progressInfo.displayStatus}</dd>
                      <dd className="mt-0.5 font-mono text-[11px] text-gray-500">{shipment.status || '—'}</dd>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <dt className="text-xs text-gray-500">AllPayLogisticsID</dt>
                      <dd className="mt-1 break-all font-mono text-xs text-gray-900">
                        {shipment.providerShipmentNo || '—'}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <dt className="text-xs text-gray-500">郵局掛號 / BookingNote / trackingNumber</dt>
                      <dd className="mt-1 break-all font-mono text-xs text-gray-900">
                        {shipment.trackingNumber || '—'}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <dt className="text-xs text-gray-500">收件人姓名</dt>
                      <dd className="mt-1 font-medium text-gray-900">{shipment.recipientName || recipientName}</dd>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <dt className="text-xs text-gray-500">收件人電話</dt>
                      <dd className="mt-1 font-medium text-gray-900">{shipment.recipientPhone || recipientPhone}</dd>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <dt className="text-xs text-gray-500">收件地址</dt>
                      <dd className="mt-1 text-gray-900">{shipmentAddress || '—'}</dd>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <dt className="text-xs text-gray-500">建立時間</dt>
                      <dd className="mt-1 text-gray-700">{formatDateTime(shipment.createdAt)}</dd>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <dt className="text-xs text-gray-500">更新時間</dt>
                      <dd className="mt-1 text-gray-700">{formatDateTime(shipment.updatedAt)}</dd>
                    </div>
                  </dl>

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-900">物流紀錄</h3>
                    {shipment.events.length === 0 ? (
                      <p className="mt-3 rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
                        目前尚無物流事件紀錄。
                      </p>
                    ) : (
                      <ol className="mt-3 space-y-3">
                        {shipment.events.map((event) => {
                          const office = getShipmentEventMetadataText(event, [
                            'office',
                            'processingOffice',
                            'Office',
                            '處理單位',
                          ]);
                          const details = getShipmentEventMetadataText(event, ['details', 'Details', 'remark', '備註']);
                          const displayTime = getShipmentEventDisplayTime(event);
                          const displayTimeText =
                            displayTime === event.createdAt ? formatDateTime(event.createdAt) : displayTime;

                          return (
                            <li key={event.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <p className="font-mono text-xs font-semibold text-gray-500">
                                    {event.eventType || '—'}
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-gray-900">
                                    {mapShipmentDisplayMessage(event.message) || event.status || '—'}
                                  </p>
                                  {office && <p className="mt-1 text-xs text-gray-600">處理單位：{office}</p>}
                                  {details && <p className="mt-1 text-xs text-gray-600">備註：{details}</p>}
                                </div>
                                <div className="shrink-0 text-left sm:text-right">
                                  <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                                    status code：{event.status || '—'}
                                  </span>
                                  <p className="mt-1 whitespace-nowrap text-xs text-gray-500">{displayTimeText}</p>
                                  {displayTime !== event.createdAt && (
                                    <p className="mt-0.5 whitespace-nowrap text-[11px] text-gray-400">
                                      建立於 {formatDateTime(event.createdAt)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="font-semibold text-gray-900">商品明細</h2>
            </div>

            <div className="divide-y divide-gray-100">
              {order.items.map((it) => (
                <div key={it.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {it.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.coverImage} alt={it.productName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 6.75h.008v.008H18V6.75Z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {it.slug ? (
                      <Link href="/products" className="font-medium text-gray-900 hover:text-brand-700">
                        {it.productName || '—'}
                      </Link>
                    ) : (
                      <p className="font-medium text-gray-900">{it.productName || '—'}</p>
                    )}

                    <p className="mt-0.5 text-sm text-gray-500">
                      {formatCurrency(it.productPrice)} × {safeNumber(it.quantity)}
                    </p>
                    {it.sku && <p className="mt-0.5 font-mono text-xs text-gray-400">SKU: {it.sku}</p>}
                  </div>

                  <p className="font-semibold text-gray-800">{formatCurrency(it.subtotal)}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-gray-100 bg-gray-50 px-6 py-4 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>商品小計</span>
                <span>{formatCurrency(itemsSubtotal)}</span>
              </div>

              <div className="flex justify-between text-gray-600">
                <span>運費</span>
                <span>{shippingFee > 0 ? formatCurrency(shippingFee) : '免運費'}</span>
              </div>

              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
                <span>合計</span>
                <span className="text-brand-700">{formatCurrency(order.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900">收件與聯絡資訊</h2>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">收件人姓名</dt>
                <dd className="mt-0.5 font-medium text-gray-800">{recipientName}</dd>
              </div>

              <div>
                <dt className="text-gray-500">收件人電話</dt>
                <dd className="mt-0.5 font-medium text-gray-800">{recipientPhone}</dd>
              </div>

              <div>
                <dt className="text-gray-500">收件人 Email</dt>
                <dd className="mt-0.5 break-all font-medium text-gray-800">{recipientEmail}</dd>
              </div>

              <div>
                <dt className="text-gray-500">收件地址</dt>
                <dd className="mt-0.5 font-medium text-gray-800">{recipientAddress}</dd>
              </div>

              <div>
                <dt className="text-gray-500">{order.customer.type === 'CUSTOMER' ? '直播客戶 Email' : '會員帳號'}</dt>
                <dd className="mt-0.5 break-all text-gray-700">{order.customer.email || '—'}</dd>
              </div>

              {order.customer.phone && order.customer.phone !== '—' && (
                <div>
                  <dt className="text-gray-500">客戶電話</dt>
                  <dd className="mt-0.5 text-gray-700">{order.customer.phone}</dd>
                </div>
              )}

              {(order.customer.facebookName || order.customer.lineId) && (
                <div>
                  <dt className="text-gray-500">直播聯絡資料</dt>
                  <dd className="mt-0.5 text-gray-700">
                    {[order.customer.facebookName, order.customer.lineId].filter(Boolean).join(' / ')}
                  </dd>
                </div>
              )}

              {order.customer.remark && (
                <div>
                  <dt className="text-gray-500">客戶備註</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-gray-700">{order.customer.remark}</dd>
                </div>
              )}

              {order.notes && (
                <div>
                  <dt className="text-gray-500">訂單備註</dt>
                  <dd className="mt-0.5 text-gray-700">{order.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900">付款與配送</h2>

            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">訂單來源</dt>
                <dd className="font-medium text-gray-800">{getOrderSourceLabel(order.source)}</dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-gray-500">付款方式</dt>
                <dd className="font-medium text-gray-800">{getPaymentMethodLabel(order.paymentMethod, order.notes)}</dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-gray-500">付款狀態</dt>
                <dd>
                  <PaymentStatusBadge status={order.paymentStatus} />
                </dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-gray-500">配送方式</dt>
                <dd className="font-medium text-gray-800 text-right">
                  {getShippingMethodLabel(order.shippingMethod)}
                </dd>
              </div>

              {(isLiveManualOrder || isPostOfficeCod) && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">代收金額</dt>
                  <dd className="font-semibold text-gray-900">{formatCurrency(order.totalAmount)}</dd>
                </div>
              )}

              <div className="flex justify-between">
                <dt className="text-gray-500">物流追蹤碼</dt>
                <dd className="font-medium text-gray-800">{order.trackingNumber || '—'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">訂單狀態紀錄</h2>
        </div>

        {order.orderStatusLogs.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500">尚無狀態紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-6 py-3">建立時間</th>
                  <th className="px-6 py-3">狀態變更</th>
                  <th className="px-6 py-3">actorType</th>
                  <th className="px-6 py-3">reason</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {order.orderStatusLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-6 py-3 text-gray-600">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs text-gray-800">
                      {log.fromStatus || '—'} → {log.toStatus || '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                        {log.actorType || '—'}
                      </span>
                    </td>
                    <td className="min-w-40 px-6 py-3 text-gray-700">{log.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">管理員操作稽核紀錄</h2>
        </div>

        {order.adminAuditLogs.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500">尚無管理員操作紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-6 py-3">建立時間</th>
                  <th className="px-6 py-3">action</th>
                  <th className="px-6 py-3">操作者</th>
                  <th className="px-6 py-3">description</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {order.adminAuditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-6 py-3 text-gray-600">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs text-gray-800">
                      {log.action || '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-gray-700">
                      {log.actorEmail || log.actorName || '—'}
                    </td>
                    <td className="min-w-56 px-6 py-3 text-gray-700">{log.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">付款交易紀錄</h2>
        </div>

        {order.paymentTransactions.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500">尚無付款交易紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-6 py-3">建立時間</th>
                  <th className="px-6 py-3">MerchantTradeNo</th>
                  <th className="px-6 py-3">TradeNo</th>
                  <th className="px-6 py-3">方式</th>
                  <th className="px-6 py-3 text-right">金額</th>
                  <th className="px-6 py-3">狀態</th>
                  <th className="px-6 py-3">付款時間</th>
                  <th className="px-6 py-3">最後更新</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {order.paymentTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="whitespace-nowrap px-6 py-3 text-gray-600">
                      {formatDateTime(transaction.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs text-gray-800">
                      {transaction.merchantTradeNo}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs text-gray-600">
                      {transaction.providerTradeNo || '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-gray-700">
                      {transaction.method || '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                        {transaction.status || '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-gray-600">
                      {formatDateTime(transaction.paidAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-gray-600">
                      {formatDateTime(transaction.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">退款紀錄</h2>
        </div>

        {order.refunds.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500">尚無退款紀錄</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {order.refunds.map((refund) => (
              <div key={refund.id} className="px-6 py-5">
                <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
                  <div>
                    <p className="text-xs text-gray-500">provider</p>
                    <p className="mt-1 font-medium text-gray-900">{refund.provider || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">amount</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatCurrency(refund.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">status</p>
                    <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {refund.status || '—'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">reason</p>
                    <p className="mt-1 text-gray-700">{refund.reason || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">providerRefundNo</p>
                    <p className="mt-1 break-all font-mono text-xs text-gray-800">
                      {refund.providerRefundNo || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">createdAt / updatedAt</p>
                    <p className="mt-1 text-gray-700">
                      {formatDateTime(refund.createdAt)} / {formatDateTime(refund.updatedAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">events</h3>
                  {refund.events.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">尚無退款事件</p>
                  ) : (
                    <div className="mt-2 overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-4 py-2">建立時間</th>
                            <th className="px-4 py-2">eventType</th>
                            <th className="px-4 py-2">status</th>
                            <th className="px-4 py-2">message</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {refund.events.map((event) => (
                            <tr key={event.id}>
                              <td className="whitespace-nowrap px-4 py-2 text-gray-600">
                                {formatDateTime(event.createdAt)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-gray-800">
                                {event.eventType || '—'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-gray-700">{event.status || '—'}</td>
                              <td className="min-w-56 px-4 py-2 text-gray-700">{event.message || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Webhook 事件紀錄</h2>
        </div>

        {order.paymentEvents.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500">尚無 Webhook 事件紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-6 py-3">建立時間</th>
                  <th className="px-6 py-3">MerchantTradeNo</th>
                  <th className="px-6 py-3">TradeNo</th>
                  <th className="px-6 py-3">RtnCode</th>
                  <th className="px-6 py-3">RtnMsg</th>
                  <th className="px-6 py-3">CheckMac</th>
                  <th className="px-6 py-3">處理狀態</th>
                  <th className="px-6 py-3">錯誤</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {order.paymentEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap px-6 py-3 text-gray-600">
                      {formatDateTime(event.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs text-gray-800">
                      {event.merchantTradeNo || '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs text-gray-600">
                      {event.providerTradeNo || '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-gray-700">{event.rtnCode || '—'}</td>
                    <td className="min-w-40 px-6 py-3 text-gray-700">{event.rtnMsg || '—'}</td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          event.checkMacMatched
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {event.checkMacMatched ? '通過' : '失敗'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          event.processed ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {event.processed ? '已處理' : '未處理'}
                      </span>
                    </td>
                    <td className="min-w-40 px-6 py-3 text-gray-700">{event.errorMessage || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
