// apps/web/src/app/checkout/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCartStore } from '@/store/useCartStore';
import { formatPrice } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { CreateOrderSchema, resolveTaiwanPostalCode } from '@havoice/shared';
import type { CreateOrderDTO, ShippingMethod, PaymentMethod } from '@havoice/shared';
import { TAIWAN_CITIES, TAIWAN_DISTRICTS } from '@/lib/taiwan-districts';

const DEV_API_BASE_URL = 'http://localhost:4000';
const DEV_ECPAY_ACTION_URL = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

const PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.NODE_ENV !== 'production' ? DEV_API_BASE_URL : '');

const PUBLIC_ECPAY_ACTION_URL =
  process.env.NEXT_PUBLIC_ECPAY_AIO_CHECKOUT_URL ||
  (process.env.NODE_ENV !== 'production' ? DEV_ECPAY_ACTION_URL : '');

const CVS_BRANDS = [
  { value: 'UNIMART', label: '7-ELEVEN' },
  { value: 'FAMI', label: '全家 FamilyMart' },
  { value: 'HILIFE', label: '萊爾富 Hi-Life' },
  { value: 'OK', label: 'OK 超商' },
] as const;

const SHIPPING_OPTIONS = [
  {
    value: 'STANDARD' as ShippingMethod,
    label: '宅配 · 標準配送',
    desc: '3-5 個工作天',
  },
  {
    value: 'EXPRESS' as ShippingMethod,
    label: '宅配 · 快速配送',
    desc: '1-2 個工作天',
  },
  {
    value: 'STORE' as ShippingMethod,
    label: '超商取貨',
    desc: '2-3 個工作天',
  },
];

interface SelectedStore {
  cvsStoreId: string;
  cvsStoreName: string;
  cvsAddress: string;
}

interface CreateOrderResponse {
  orderNumber: string;
  totalAmount: number | string;
  itemCount: number;
  actionUrl?: string;
  ecpayPayload?: Record<string, string>;
}

function calculateShippingFee(shippingMethod: ShippingMethod, subtotal: number): number {
  if (shippingMethod === 'STANDARD') {
    return subtotal >= 1000 ? 0 : 60;
  }

  if (shippingMethod === 'EXPRESS') {
    return 120;
  }

  if (shippingMethod === 'STORE') {
    return subtotal >= 800 ? 0 : 45;
  }

  return 0;
}

function getShippingPriceLabel(shippingMethod: ShippingMethod, subtotal: number): string {
  const fee = calculateShippingFee(shippingMethod, subtotal);
  return fee === 0 ? '免運費' : formatPrice(fee);
}

/**
 * 綠界超商物流 C2C 收件人姓名規則：
 * - 中文：2～5 個字
 * - 英文：4～10 個字，可含空白
 *
 * 注意：
 * 這裡只在「超商取貨」時檢查。
 * 宅配不需要套用這個限制。
 */
function getEcpayCvsReceiverNameError(name: string): string | null {
  const trimmed = name.trim();

  if (!trimmed) {
    return '請填寫收件人姓名';
  }

  const isChineseName = /^[\u4e00-\u9fa5]{2,5}$/.test(trimmed);
  const isEnglishName = /^[A-Za-z ]{4,10}$/.test(trimmed);

  if (isChineseName || isEnglishName) {
    return null;
  }

  return '超商取貨收件人姓名需為中文 2～5 個字，或英文 4～10 個字，例如「王小明」、「James」。';
}

export default function CheckoutPage() {
  const router = useRouter();

  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/login?callbackUrl=/checkout');
    },
  });

  const { items, getTotalPrice, clearCart } = useCartStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    recipientName: '',
    recipientPhone: '',
    recipientEmail: '',
    shippingMethod: 'STANDARD' as ShippingMethod,
    paymentMethod: 'CREDIT_CARD' as PaymentMethod,
    note: '',
  });

  const [addr, setAddr] = useState({ city: '', district: '', detail: '' });
  const [cvsBrand, setCvsBrand] = useState<(typeof CVS_BRANDS)[number]['value']>('UNIMART');
  const [store, setStore] = useState<SelectedStore | null>(null);

  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  const isStore = formData.shippingMethod === 'STORE';

  const totalPrice = getTotalPrice();
  const shippingFee = calculateShippingFee(formData.shippingMethod, totalPrice);
  const grandTotal = totalPrice + shippingFee;

  const submitLabel =
    formData.paymentMethod === 'COD'
      ? `確認送出訂單 ${formatPrice(grandTotal)}`
      : `確認付款 ${formatPrice(grandTotal)}`;

  useEffect(() => {
    const draft = sessionStorage.getItem('checkout_draft');

    if (draft) {
      setHasDraft(true);

      try {
        const { savedForm, savedAddr, savedBrand, savedStore } = JSON.parse(draft);

        if (savedForm) setFormData(savedForm);
        if (savedAddr) setAddr(savedAddr);
        if (savedBrand) setCvsBrand(savedBrand);
        if (savedStore) setStore(savedStore);
      } catch (e) {
        console.error('還原表單失敗', e);
      }
    }

    setIsDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (isDraftLoaded && !hasDraft && session?.user) {
      if (!formData.recipientName) {
        setFormData((prev) => ({
          ...prev,
          recipientName: session.user.name || '',
          recipientEmail: session.user.email || '',
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isDraftLoaded, hasDraft]);

  useEffect(() => {
    if (isDraftLoaded) {
      sessionStorage.setItem(
        'checkout_draft',
        JSON.stringify({
          savedForm: formData,
          savedAddr: addr,
          savedBrand: cvsBrand,
          savedStore: store,
        }),
      );
    }
  }, [formData, addr, cvsBrand, store, isDraftLoaded]);

  const clearError = (field: string) =>
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const updateField =
    (field: keyof typeof formData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = e.target.value;

      setFormData((prev) => {
        const next = { ...prev, [field]: value };

        if (field === 'shippingMethod') {
          const nextShippingMethod = value as ShippingMethod;

          if (nextShippingMethod === 'STORE' && prev.paymentMethod === 'CREDIT_CARD') {
            next.paymentMethod = 'COD';
          }

          if (nextShippingMethod !== 'STORE') {
            setStore(null);
          }
        }

        return next;
      });

      clearError(field);
      clearError('_form');

      if (field === 'recipientName') {
        clearError('recipientName');
      }
    };

  const handleStoreMessage = useCallback((event: MessageEvent) => {
    const allowedOrigins = new Set<string>();

    if (typeof window !== 'undefined') {
      allowedOrigins.add(window.location.origin);
    }

    if (PUBLIC_API_BASE_URL) {
      try {
        allowedOrigins.add(new URL(PUBLIC_API_BASE_URL).origin);
      } catch {
        // ignore invalid URL
      }
    }

    if (allowedOrigins.size > 0 && !allowedOrigins.has(event.origin)) {
      return;
    }

    const data = event.data;

    if (!data || data.source !== 'ecpay-cvs-map') return;
    if (!data.cvsStoreId || !data.cvsStoreName) return;

    setStore({
      cvsStoreId: String(data.cvsStoreId),
      cvsStoreName: String(data.cvsStoreName),
      cvsAddress: String(data.cvsAddress || ''),
    });

    clearError('cvsStoreName');
    clearError('shippingAddress');
    clearError('_form');
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleStoreMessage);
    return () => window.removeEventListener('message', handleStoreMessage);
  }, [handleStoreMessage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sp = new URLSearchParams(window.location.search);
    const id = sp.get('cvsStoreId');
    const name = sp.get('cvsStoreName');

    if (id && name) {
      setStore({
        cvsStoreId: id,
        cvsStoreName: name,
        cvsAddress: sp.get('cvsAddress') || '',
      });

      setFormData((prev) => ({
        ...prev,
        shippingMethod: 'STORE',
        paymentMethod: prev.paymentMethod === 'CREDIT_CARD' ? 'COD' : prev.paymentMethod,
      }));

      window.history.replaceState({}, '', '/checkout');
    }
  }, []);

  const openCvsMap = () => {
    if (!PUBLIC_API_BASE_URL) {
      setFieldErrors({
        _form: '系統尚未設定超商地圖 API 網址，請聯絡管理員。',
      });
      return;
    }

    const url = `${PUBLIC_API_BASE_URL}/api/orders/cvs-map?type=${cvsBrand}`;
    window.open(url, 'ecpayCvsMap', 'width=1000,height=700,menubar=no,toolbar=no');
  };

  const submitToEcpay = (actionUrl: string, payload: Record<string, string>) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = actionUrl;

    Object.entries(payload).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    if (items.length === 0) {
      setFieldErrors({ _form: '購物車是空的，請先加入商品。' });
      return;
    }

    /**
     * 超商取貨姓名先在前台擋掉，避免訂單已付款後，
     * 後台申請綠界 C2C 交貨便代碼才失敗。
     */
    if (isStore) {
      const receiverNameError = getEcpayCvsReceiverNameError(formData.recipientName);

      if (receiverNameError) {
        setFieldErrors({
          recipientName: receiverNameError,
        });
        return;
      }
    }

    let composedAddress = '';

    if (isStore) {
      if (store) {
        const brandLabel = CVS_BRANDS.find((brand) => brand.value === cvsBrand)?.label || '超商';
        composedAddress = `${brandLabel}－${store.cvsStoreName}（門市代號 ${store.cvsStoreId}）${
          store.cvsAddress ? `／${store.cvsAddress}` : ''
        }`;
      }
    } else {
      composedAddress = `${addr.city}${addr.district}${addr.detail}`.trim();
    }

    const recipientPostalCode = isStore ? null : resolveTaiwanPostalCode(addr.city, addr.district);

    const orderPayload: CreateOrderDTO = {
      recipientName: formData.recipientName.trim(),
      recipientPhone: formData.recipientPhone.trim(),
      recipientEmail: formData.recipientEmail.trim() || undefined,
      shippingAddress: composedAddress,
      shippingMethod: formData.shippingMethod,
      paymentMethod: formData.paymentMethod,
      note: formData.note,
      recipientCity: isStore ? undefined : addr.city || undefined,
      recipientDistrict: isStore ? undefined : addr.district || undefined,
      recipientPostalCode: recipientPostalCode || undefined,
      recipientDetailAddress: isStore ? undefined : addr.detail || undefined,
      cvsStoreId: isStore ? store?.cvsStoreId : undefined,
      cvsStoreName: isStore ? store?.cvsStoreName : undefined,
      cvsAddress: isStore ? store?.cvsAddress : undefined,
      cvsSubType: isStore ? cvsBrand : undefined,
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    };

    const validation = CreateOrderSchema.safeParse(orderPayload);

    if (!validation.success) {
      const errors: Record<string, string> = {};

      validation.error.errors.forEach((issue) => {
        const field = issue.path[0] as string;
        if (!errors[field]) errors[field] = issue.message;
      });

      if (errors.shippingAddress && !isStore) {
        if (!addr.city) errors.city = '請選擇縣市';
        else if (!addr.district) errors.district = '請選擇鄉鎮市區';
        else errors.detail = '請填寫詳細地址';
      }

      if (isStore && !store) {
        errors.cvsStoreName = '請選擇取貨門市';
      }

      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      const order = await api.post<CreateOrderResponse>('/api/orders', validation.data);

      clearCart();
      sessionStorage.removeItem('checkout_draft');

      if (order.ecpayPayload) {
        const actionUrl = order.actionUrl || PUBLIC_ECPAY_ACTION_URL;

        if (!actionUrl) {
          setFieldErrors({
            _form: '系統尚未設定綠界付款網址，請聯絡管理員。',
          });
          setIsSubmitting(false);
          return;
        }

        submitToEcpay(actionUrl, order.ecpayPayload);
        return;
      }

      sessionStorage.setItem(
        'lastOrder',
        JSON.stringify({
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          itemCount: order.itemCount,
          paymentMethod: formData.paymentMethod,
        }),
      );

      router.push('/checkout/success');
    } catch (error: any) {
      if (error.status === 409) {
        setFieldErrors({ _form: error.message || '部分商品庫存不足，請返回購物車確認' });
      } else if (error.status === 400) {
        if (error.details && Array.isArray(error.details)) {
          const errors: Record<string, string> = {};

          error.details.forEach((detail: { field: string; message: string }) => {
            errors[detail.field] = detail.message;
          });

          setFieldErrors(errors);
        } else {
          setFieldErrors({ _form: error.message || '訂單資料有誤，請檢查後重試' });
        }
      } else {
        setFieldErrors({ _form: '提交訂單時發生錯誤，請稍後再試' });
      }

      setIsSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container-page flex flex-col items-center justify-center py-20">
        <svg
          className="h-20 w-20 text-gray-200"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
          />
        </svg>
        <h2 className="mt-6 text-xl font-bold text-gray-900">購物車是空的</h2>
        <p className="mt-2 text-gray-500">請先將商品加入購物車再進行結帳</p>
        <Link href="/shop" className="btn-brand mt-6">
          前往商城
        </Link>
      </div>
    );
  }

  const inputCls = (hasError?: boolean) =>
    `block w-full rounded-lg border px-4 py-3 text-sm transition-colors ${
      hasError
        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
        : 'border-gray-200 focus:border-brand-500 focus:ring-brand-500'
    } focus:outline-none focus:ring-1`;

  const paymentOptions = [
    { value: 'CREDIT_CARD', label: '信用卡付款', desc: 'Visa / Mastercard / JCB', icon: '💳' },
    { value: 'ATM', label: 'ATM 虛擬帳號', desc: '取得帳號後 3 天內完成轉帳', icon: '🏧' },
    {
      value: 'COD',
      label: isStore ? '超商取貨付款' : '貨到付款',
      desc: '送達／取貨時以現金支付',
      icon: '📦',
    },
  ].filter((option) => !(isStore && option.value === 'CREDIT_CARD'));

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">結帳</h1>

      {fieldErrors._form && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">{fieldErrors._form}</p>
              <Link href="/shop" className="mt-1 inline-block text-sm text-red-600 underline hover:text-red-700">
                返回商城確認商品
              </Link>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 grid gap-10 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">收件人資訊</h2>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="recipientName" className="mb-1.5 block text-sm font-medium text-gray-700">
                  收件人姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  id="recipientName"
                  type="text"
                  value={formData.recipientName}
                  onChange={updateField('recipientName')}
                  placeholder={isStore ? '王小明 / BENN' : '王小明'}
                  className={inputCls(!!fieldErrors.recipientName)}
                />
                {isStore && !fieldErrors.recipientName && (
                  <p className="mt-1 text-xs text-gray-400">超商取貨姓名需為中文 2～5 字，或英文 4～10 字。</p>
                )}
                {fieldErrors.recipientName && <p className="mt-1 text-sm text-red-600">{fieldErrors.recipientName}</p>}
              </div>

              <div>
                <label htmlFor="recipientPhone" className="mb-1.5 block text-sm font-medium text-gray-700">
                  手機號碼 <span className="text-red-500">*</span>
                </label>
                <input
                  id="recipientPhone"
                  type="tel"
                  inputMode="numeric"
                  value={formData.recipientPhone}
                  onChange={updateField('recipientPhone')}
                  placeholder="0912345678"
                  className={inputCls(!!fieldErrors.recipientPhone)}
                />
                {fieldErrors.recipientPhone && <p className="mt-1 text-sm text-red-600">{fieldErrors.recipientPhone}</p>}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="recipientEmail" className="mb-1.5 block text-sm font-medium text-gray-700">
                  電子郵件（選填，用於寄送訂單確認信）
                </label>
                <input
                  id="recipientEmail"
                  type="email"
                  value={formData.recipientEmail}
                  onChange={updateField('recipientEmail')}
                  placeholder="example@email.com"
                  className={inputCls(!!fieldErrors.recipientEmail)}
                />
                {fieldErrors.recipientEmail && <p className="mt-1 text-sm text-red-600">{fieldErrors.recipientEmail}</p>}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-gray-700">
                  訂單備註
                </label>
                <textarea
                  id="note"
                  rows={3}
                  value={formData.note}
                  onChange={updateField('note')}
                  placeholder="如有特殊需求請在此備註..."
                  className="block w-full resize-y rounded-lg border border-gray-200 px-4 py-3 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">運送方式</h2>

            <div className="mt-4 space-y-3">
              {SHIPPING_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition-all ${
                    formData.shippingMethod === option.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shippingMethod"
                      value={option.value}
                      checked={formData.shippingMethod === option.value}
                      onChange={updateField('shippingMethod')}
                      className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{option.label}</p>
                      <p className="text-xs text-gray-500">{option.desc}</p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-700">{getShippingPriceLabel(option.value, totalPrice)}</span>
                </label>
              ))}
            </div>

            {!isStore && (
              <div className="mt-5 grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="city" className="mb-1.5 block text-sm font-medium text-gray-700">
                    縣市 <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="city"
                    value={addr.city}
                    onChange={(e) => {
                      setAddr((prev) => ({ ...prev, city: e.target.value, district: '' }));
                      clearError('city');
                      clearError('shippingAddress');
                    }}
                    className={inputCls(!!fieldErrors.city)}
                  >
                    <option value="">請選擇縣市</option>
                    {TAIWAN_CITIES.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.city && <p className="mt-1 text-sm text-red-600">{fieldErrors.city}</p>}
                </div>

                <div>
                  <label htmlFor="district" className="mb-1.5 block text-sm font-medium text-gray-700">
                    鄉鎮市區 <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="district"
                    value={addr.district}
                    disabled={!addr.city}
                    onChange={(e) => {
                      setAddr((prev) => ({ ...prev, district: e.target.value }));
                      clearError('district');
                      clearError('shippingAddress');
                    }}
                    className={`${inputCls(!!fieldErrors.district)} disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
                  >
                    <option value="">{addr.city ? '請選擇鄉鎮市區' : '請先選擇縣市'}</option>
                    {(TAIWAN_DISTRICTS[addr.city] || []).map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.district && <p className="mt-1 text-sm text-red-600">{fieldErrors.district}</p>}
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="detail" className="mb-1.5 block text-sm font-medium text-gray-700">
                    詳細地址 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="detail"
                    type="text"
                    value={addr.detail}
                    onChange={(e) => {
                      setAddr((prev) => ({ ...prev, detail: e.target.value }));
                      clearError('detail');
                      clearError('shippingAddress');
                    }}
                    placeholder="信義路五段 7 號 10 樓"
                    className={inputCls(!!fieldErrors.detail || !!fieldErrors.shippingAddress)}
                  />
                  {(fieldErrors.detail || fieldErrors.shippingAddress) && (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors.detail || fieldErrors.shippingAddress}</p>
                  )}
                </div>
              </div>
            )}

            {isStore && (
              <div className="mt-5 border-t border-gray-100 pt-5">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">選擇超商品牌</label>

                <div className="flex flex-wrap gap-2">
                  {CVS_BRANDS.map((brand) => (
                    <button
                      key={brand.value}
                      type="button"
                      onClick={() => setCvsBrand(brand.value)}
                      className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                        cvsBrand === brand.value
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {brand.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={openCvsMap}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-brand-500 px-5 py-2.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                      />
                    </svg>
                    {store ? '重新選擇門市' : '選擇取貨門市'}
                  </button>

                  {store ? (
                    <div className="rounded-lg bg-brand-50 px-4 py-2.5 text-sm">
                      <p className="font-medium text-brand-800">
                        {store.cvsStoreName}（{store.cvsStoreId}）
                      </p>
                      {store.cvsAddress && <p className="text-xs text-brand-600">{store.cvsAddress}</p>}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">尚未選擇門市</span>
                  )}
                </div>

                {fieldErrors.cvsStoreName && <p className="mt-2 text-sm text-red-600">{fieldErrors.cvsStoreName}</p>}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">付款方式</h2>

            {isStore && <p className="mt-2 text-xs text-gray-500">超商取貨僅支援「超商取貨付款」或「ATM 轉帳」。</p>}

            <div className="mt-4 space-y-3">
              {paymentOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 transition-all ${
                    formData.paymentMethod === option.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={option.value}
                    checked={formData.paymentMethod === option.value}
                    onChange={updateField('paymentMethod')}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xl">{option.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{option.label}</p>
                    <p className="text-xs text-gray-500">{option.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {fieldErrors.paymentMethod && <p className="mt-2 text-sm text-red-600">{fieldErrors.paymentMethod}</p>}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">訂單摘要</h2>

            <ul className="mt-4 divide-y divide-gray-100">
              {items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3 py-3">
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {item.coverImage && <img src={item.coverImage} alt={item.name} className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">x{item.quantity}</p>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{formatPrice(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">商品小計（{items.length} 件）</span>
                <span className="text-gray-900">{formatPrice(totalPrice)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">運費</span>
                <span className="text-gray-900">
                  {shippingFee === 0 ? <span className="font-medium text-green-600">免運費</span> : formatPrice(shippingFee)}
                </span>
              </div>

              {formData.shippingMethod === 'STANDARD' && shippingFee > 0 && (
                <p className="text-xs text-brand-600">再加 {formatPrice(Math.max(0, 1000 - totalPrice))} 即享宅配免運</p>
              )}

              {formData.shippingMethod === 'STORE' && shippingFee > 0 && (
                <p className="text-xs text-brand-600">再加 {formatPrice(Math.max(0, 800 - totalPrice))} 即享超商取貨免運</p>
              )}

              <div className="flex justify-between border-t border-gray-100 pt-3">
                <span className="text-base font-semibold text-gray-900">合計</span>
                <span className="text-xl font-bold text-brand-600">{formatPrice(grandTotal)}</span>
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-brand relative mt-6 w-full">
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {formData.paymentMethod === 'COD' ? '訂單處理中...' : '正在導向安全支付...'}
                </span>
              ) : (
                submitLabel
              )}
            </button>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
              <span>SSL 加密傳輸 · 綠界金流安全保障</span>
            </div>

            <p className="mt-2 text-center text-xs text-gray-400">點擊送出即表示您同意我們的服務條款與隱私權政策</p>
          </div>
        </div>
      </form>
    </div>
  );
}
