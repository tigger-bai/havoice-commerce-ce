'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getDistrictsByCity,
  getPostalCodeByDistrict,
  getTaiwanCities,
  parseTaiwanAddress,
} from '@havoice/shared';

import { PageHeader } from '@/components/ui/LoadingAndError';
import { useToast } from '@/components/ui/Toast';
import { validateEcpayReceiverName } from '@/lib/ecpay-post-office-validation';
import { formatCurrency, safeNumber } from '@/lib/utils';

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error?: { message?: string; code?: string; details?: unknown } };

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  lineId: string | null;
  facebookName: string | null;
  postalCode: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  remark: string | null;
}

interface ProductSearchItem {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  status: string;
  coverImage: string | null;
  categoryName: string;
}

interface SelectedOrderItem extends ProductSearchItem {
  quantity: number;
}

interface RecipientForm {
  name: string;
  phone: string;
  email: string;
  postalCode: string;
  city: string;
  district: string;
  address: string;
}

interface NewCustomerForm {
  name: string;
  phone: string;
  email: string;
  facebookName: string;
  lineId: string;
  postalCode: string;
  city: string;
  district: string;
  address: string;
  remark: string;
}

type LiveManualPaymentMethod =
  | 'BANK_TRANSFER'
  | 'CASH'
  | 'MONTHLY_SETTLEMENT'
  | 'POST_OFFICE_COD'
  | 'OTHER';

const LIVE_MANUAL_PAYMENT_METHOD_OPTIONS: Array<{ value: LiveManualPaymentMethod; label: string }> = [
  { value: 'BANK_TRANSFER', label: '匯款' },
  { value: 'CASH', label: '現金' },
  { value: 'MONTHLY_SETTLEMENT', label: '月結' },
  { value: 'POST_OFFICE_COD', label: '貨到付款' },
  { value: 'OTHER', label: '其他' },
];

const emptyRecipient: RecipientForm = {
  name: '',
  phone: '',
  email: '',
  postalCode: '',
  city: '',
  district: '',
  address: '',
};

const emptyCustomer: NewCustomerForm = {
  name: '',
  phone: '',
  email: '',
  facebookName: '',
  lineId: '',
  postalCode: '',
  city: '',
  district: '',
  address: '',
  remark: '',
};

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700';
const sectionClass = 'rounded-xl border border-gray-200 bg-white p-5 shadow-sm';
const modalInputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400';

function getApiErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback;
  const error = (json as { error?: { message?: unknown } }).error;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  return fallback;
}

function normalizeOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getPaymentMethodLabel(method: LiveManualPaymentMethod, otherPaymentMethod?: string): string {
  if (method === 'OTHER') {
    const other = otherPaymentMethod?.trim();
    return other ? `其他：${other}` : '其他';
  }

  return LIVE_MANUAL_PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

export default function LiveManualOrderNewPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [customerKeyword, setCustomerKeyword] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomerForm>(emptyCustomer);

  const [recipient, setRecipient] = useState<RecipientForm>(emptyRecipient);
  const [addressParseHint, setAddressParseHint] = useState<string | null>(null);
  const [productKeyword, setProductKeyword] = useState('');
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [items, setItems] = useState<SelectedOrderItem[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<LiveManualPaymentMethod>('BANK_TRANSFER');
  const [otherPaymentMethod, setOtherPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalAmount = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + safeNumber(item.price) * Math.max(1, Math.trunc(safeNumber(item.quantity))),
        0,
      ),
    [items],
  );

  const taiwanCities = useMemo(() => getTaiwanCities(), []);
  const newCustomerDistricts = useMemo(
    () => getDistrictsByCity(newCustomer.city),
    [newCustomer.city],
  );
  const recipientDistricts = useMemo(
    () => getDistrictsByCity(recipient.city),
    [recipient.city],
  );
  const newCustomerNameValidation = useMemo(
    () => (newCustomer.name.trim() ? validateEcpayReceiverName(newCustomer.name) : null),
    [newCustomer.name],
  );
  const recipientNameValidation = useMemo(
    () => (recipient.name.trim() ? validateEcpayReceiverName(recipient.name) : null),
    [recipient.name],
  );

  const searchCustomers = useCallback(
    async (keyword: string) => {
      setIsSearchingCustomers(true);
      try {
        const params = new URLSearchParams();
        params.set('keyword', keyword.trim());
        params.set('limit', '10');

        const res = await fetch(`/api/customers?${params.toString()}`, { cache: 'no-store' });
        const json = (await res.json()) as ApiEnvelope<{ items?: Customer[] }>;

        if (!res.ok || !json.success) {
          throw new Error(getApiErrorMessage(json, '搜尋客戶失敗'));
        }

        setCustomers(Array.isArray(json.data.items) ? json.data.items : []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '搜尋客戶失敗');
        setCustomers([]);
      } finally {
        setIsSearchingCustomers(false);
      }
    },
    [toast],
  );

  const searchProducts = useCallback(
    async (keyword: string) => {
      setIsSearchingProducts(true);
      try {
        const params = new URLSearchParams();
        params.set('keyword', keyword.trim());
        params.set('status', 'PUBLISHED');
        params.set('limit', '20');

        const res = await fetch(`/api/products?${params.toString()}`, { cache: 'no-store' });
        const json = (await res.json()) as ApiEnvelope<{ items?: ProductSearchItem[] }>;

        if (!res.ok || !json.success) {
          throw new Error(getApiErrorMessage(json, '搜尋商品失敗'));
        }

        setProducts(Array.isArray(json.data.items) ? json.data.items : []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '搜尋商品失敗');
        setProducts([]);
      } finally {
        setIsSearchingProducts(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    const keyword = customerKeyword.trim();
    const timer = setTimeout(() => {
      void searchCustomers(keyword);
    }, 300);

    return () => clearTimeout(timer);
  }, [customerKeyword, searchCustomers]);

  useEffect(() => {
    const keyword = productKeyword.trim();
    const timer = setTimeout(() => {
      void searchProducts(keyword);
    }, 300);

    return () => clearTimeout(timer);
  }, [productKeyword, searchProducts]);

  const updateNewCustomerCity = (city: string) => {
    setNewCustomer((prev) => ({
      ...prev,
      city,
      district: '',
      postalCode: '',
    }));
  };

  const updateNewCustomerDistrict = (district: string) => {
    setNewCustomer((prev) => ({
      ...prev,
      district,
      postalCode: getPostalCodeByDistrict(prev.city, district) ?? '',
    }));
  };

  const updateRecipientCity = (city: string) => {
    setRecipient((prev) => ({
      ...prev,
      city,
      district: '',
      postalCode: '',
    }));
    setAddressParseHint(null);
  };

  const updateRecipientDistrict = (district: string) => {
    setRecipient((prev) => ({
      ...prev,
      district,
      postalCode: getPostalCodeByDistrict(prev.city, district) ?? '',
    }));
    setAddressParseHint(null);
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerKeyword(customer.name);
    setAddressParseHint(null);
  };

  const fillRecipientFromCustomer = () => {
    if (!selectedCustomer) return;
    const parsedAddress = selectedCustomer.address
      ? parseTaiwanAddress(selectedCustomer.address)
      : null;
    const willUseParsedAddressParts = Boolean(
      (!recipient.postalCode && !selectedCustomer.postalCode && parsedAddress?.postalCode) ||
        (!recipient.city && !selectedCustomer.city && parsedAddress?.city) ||
        (!recipient.district && !selectedCustomer.district && parsedAddress?.district),
    );

    setRecipient((prev) => ({
      ...prev,
      name: prev.name || selectedCustomer.name || '',
      phone: prev.phone || selectedCustomer.phone || '',
      email: prev.email || selectedCustomer.email || '',
      postalCode: prev.postalCode || selectedCustomer.postalCode || parsedAddress?.postalCode || '',
      city: prev.city || selectedCustomer.city || parsedAddress?.city || '',
      district: prev.district || selectedCustomer.district || parsedAddress?.district || '',
      address: prev.address || selectedCustomer.address || '',
    }));
    setAddressParseHint(
      willUseParsedAddressParts ? '縣市 / 行政區 / 郵遞區號由地址自動判斷，請確認' : null,
    );
    toast.success('已帶入客戶姓名、電話、Email 與地址');
  };

  const createCustomer = async (): Promise<Customer> => {
    const name = newCustomer.name.trim();
    if (!name) {
      throw new Error('請先輸入新客戶姓名');
    }

    setIsCreatingCustomer(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: normalizeOptional(newCustomer.phone),
          email: normalizeOptional(newCustomer.email),
          facebookName: normalizeOptional(newCustomer.facebookName),
          lineId: normalizeOptional(newCustomer.lineId),
          postalCode: normalizeOptional(newCustomer.postalCode),
          city: normalizeOptional(newCustomer.city),
          district: normalizeOptional(newCustomer.district),
          address: normalizeOptional(newCustomer.address),
          remark: normalizeOptional(newCustomer.remark),
          source: 'LIVE_MANUAL',
        }),
      });

      const json = (await res.json()) as ApiEnvelope<Customer>;
      if (!res.ok || !json.success) {
        throw new Error(getApiErrorMessage(json, '建立客戶失敗'));
      }

      setSelectedCustomer(json.data);
      setCustomerKeyword(json.data.name);
      setAddressParseHint(null);
      setNewCustomer(emptyCustomer);
      setIsCustomerModalOpen(false);
      setCustomers((prev) => [json.data, ...prev.filter((customer) => customer.id !== json.data.id)]);
      return json.data;
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const handleCreateCustomer = async () => {
    try {
      await createCustomer();
      toast.success('客戶已建立並選取');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '建立客戶失敗');
    }
  };

  const addProduct = (product: ProductSearchItem) => {
    if (product.stock <= 0) {
      toast.warning('此商品目前沒有庫存');
      return;
    }

    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: Math.min(item.stock, item.quantity + 1) }
            : item,
        );
      }

      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateItemQuantity = (productId: string, value: string) => {
    const quantity = Math.max(1, Math.trunc(Number(value) || 1));
    setItems((prev) =>
      prev.map((item) =>
        item.id === productId ? { ...item, quantity: Math.min(quantity, Math.max(1, item.stock)) } : item,
      ),
    );
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== productId));
  };

  const validateBeforeSubmit = (): string | null => {
    if (!selectedCustomer) return '請選擇客戶或新增客戶資料';
    if (!recipient.name.trim()) return '請輸入收件人姓名';
    if (!recipient.phone.trim()) return '請輸入收件人電話';
    if (!/^\d{3,6}$/.test(recipient.postalCode.trim())) return '請輸入正確郵遞區號';
    if (!recipient.address.trim()) return '請輸入收件地址';
    if (items.length === 0) return '請至少加入一項商品';
    if (paymentMethod === 'OTHER' && !otherPaymentMethod.trim()) return '請輸入其他付款方式';

    const overStockItem = items.find((item) => item.quantity > item.stock);
    if (overStockItem) return `商品「${overStockItem.name}」數量超過庫存`;

    return null;
  };

  const submitOrder = async () => {
    const validationError = validateBeforeSubmit();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const customer = selectedCustomer;
      if (!customer) {
        throw new Error('請選擇客戶或新增客戶資料');
      }

      const res = await fetch('/api/orders/live-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          recipient: {
            name: recipient.name.trim(),
            phone: recipient.phone.trim(),
            email: normalizeOptional(recipient.email),
            postalCode: recipient.postalCode.trim(),
            city: normalizeOptional(recipient.city),
            district: normalizeOptional(recipient.district),
            address: recipient.address.trim(),
          },
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
          paymentMethod,
          otherPaymentMethod: paymentMethod === 'OTHER' ? normalizeOptional(otherPaymentMethod) : undefined,
          notes: normalizeOptional(notes),
        }),
      });

      const json = (await res.json()) as ApiEnvelope<{
        id: string;
        orderNumber: string;
        totalAmount: number;
      }>;

      if (!res.ok || !json.success) {
        throw new Error(getApiErrorMessage(json, '建立直播訂單失敗'));
      }

      toast.success(`直播訂單 ${json.data.orderNumber} 已建立`);
      router.push(`/orders/${json.data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '建立直播訂單失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="新增直播訂單"
        description="建立直播訂單"
        actions={
          <Link
            href="/orders"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            返回訂單列表
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <section className={sectionClass}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">客戶資料</h2>
                <p className="mt-1 text-sm text-gray-500">搜尋既有客戶，或建立一位直播客戶。</p>
              </div>
              {selectedCustomer && (
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                  已選取
                </span>
              )}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <label htmlFor="customerKeyword" className={labelClass}>
                  搜尋客戶
                </label>
                <div className="flex gap-2">
                  <input
                    id="customerKeyword"
                    value={customerKeyword}
                    onChange={(event) => setCustomerKeyword(event.target.value)}
                    className={inputClass}
                    placeholder="姓名 / 電話 / Email / Facebook 名稱"
                  />
                  <button
                    type="button"
                    onClick={() => searchCustomers(customerKeyword)}
                    disabled={isSearchingCustomers}
                    className="shrink-0 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSearchingCustomers ? '搜尋中' : '搜尋'}
                  </button>
                </div>

                <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-gray-200">
                  {customers.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-gray-500">沒有符合條件的客戶</p>
                  ) : (
                    customers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className={`block w-full border-b border-gray-100 px-3 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-gray-50 ${
                          selectedCustomer?.id === customer.id ? 'bg-brand-50' : 'bg-white'
                        }`}
                      >
                        <span className="font-medium text-gray-900">{customer.name}</span>
                        <span className="mt-1 block text-xs text-gray-500">
                          {[customer.phone, customer.email, customer.facebookName].filter(Boolean).join(' / ') || '無聯絡資料'}
                        </span>
                      </button>
                    ))
                  )}
                </div>

                {selectedCustomer && (
                  <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    <div className="font-medium">{selectedCustomer.name}</div>
                    <div className="mt-1 text-xs">
                      {[selectedCustomer.phone, selectedCustomer.email, selectedCustomer.facebookName, selectedCustomer.lineId]
                        .filter(Boolean)
                        .join(' / ') || '尚無聯絡資料'}
                    </div>
                    {selectedCustomer.remark && (
                      <div className="mt-2 border-t border-green-200 pt-2 text-xs text-green-700">
                        備註：{selectedCustomer.remark}
                      </div>
                    )}
                    {selectedCustomer.address && (
                      <div className="mt-2 border-t border-green-200 pt-2 text-xs text-green-700">
                        客戶地址：
                        {[
                          selectedCustomer.postalCode,
                          selectedCustomer.city,
                          selectedCustomer.district,
                          selectedCustomer.address,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-start justify-start lg:justify-end">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(true)}
                  className="rounded-lg border border-brand-600 bg-white px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                >
                  新增客戶資料
                </button>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">收件資料</h2>
                <p className="mt-1 text-sm text-gray-500">客戶備註不會自動帶入地址。</p>
              </div>
              <button
                type="button"
                onClick={fillRecipientFromCustomer}
                disabled={!selectedCustomer}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                帶入客戶姓名 / 電話 / Email / 地址
              </button>
            </div>

            {addressParseHint && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {addressParseHint}
              </p>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="recipientName" className={labelClass}>
                  收件人姓名 *
                </label>
                <input
                  id="recipientName"
                  value={recipient.name}
                  onChange={(event) => setRecipient((prev) => ({ ...prev, name: event.target.value }))}
                  className={inputClass}
                />
                {recipientNameValidation ? (
                  <p
                    className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                      recipientNameValidation.valid
                        ? 'bg-green-50 text-green-700'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {recipientNameValidation.valid
                      ? `綠界託運單將使用：${recipientNameValidation.normalizedName}`
                      : recipientNameValidation.message}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">
                    若要建立綠界託運單，收件人姓名需符合中文 2～5 個字或英文 4～10 個字。
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="recipientPhone" className={labelClass}>
                  收件人電話 *
                </label>
                <input
                  id="recipientPhone"
                  value={recipient.phone}
                  onChange={(event) => setRecipient((prev) => ({ ...prev, phone: event.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="recipientEmail" className={labelClass}>
                  Email
                </label>
                <input
                  id="recipientEmail"
                  type="email"
                  value={recipient.email}
                  onChange={(event) => setRecipient((prev) => ({ ...prev, email: event.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="recipientCity" className={labelClass}>
                  縣市
                </label>
                <select
                  id="recipientCity"
                  value={recipient.city}
                  onChange={(event) => updateRecipientCity(event.target.value)}
                  className={inputClass}
                >
                  <option value="">請選擇縣市</option>
                  {taiwanCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="recipientDistrict" className={labelClass}>
                  行政區
                </label>
                <select
                  id="recipientDistrict"
                  value={recipient.district}
                  onChange={(event) => updateRecipientDistrict(event.target.value)}
                  className={inputClass}
                  disabled={!recipient.city}
                >
                  <option value="">{recipient.city ? '請選擇行政區' : '請先選擇縣市'}</option>
                  {recipientDistricts.map((option) => (
                    <option key={option.district} value={option.district}>
                      {option.district}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="recipientPostalCode" className={labelClass}>
                  郵遞區號 *
                </label>
                <select
                  id="recipientPostalCode"
                  value={recipient.postalCode}
                  onChange={(event) => setRecipient((prev) => ({ ...prev, postalCode: event.target.value }))}
                  className={inputClass}
                  disabled={!recipient.district}
                >
                  <option value="">{recipient.district ? '請選擇郵遞區號' : '選擇行政區後自動帶入'}</option>
                  {recipient.postalCode && (
                    <option value={recipient.postalCode}>{recipient.postalCode}</option>
                  )}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="recipientAddress" className={labelClass}>
                  詳細地址 *
                </label>
                <input
                  id="recipientAddress"
                  value={recipient.address}
                  onChange={(event) => setRecipient((prev) => ({ ...prev, address: event.target.value }))}
                  className={inputClass}
                  placeholder="路名、巷弄、號、樓層"
                />
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  詳細地址建議只填路名、巷弄、號、樓層；縣市、行政區、郵遞區號請使用上方欄位選擇，避免重複。
                </p>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-base font-semibold text-gray-900">付款方式</h2>
            <p className="mt-1 text-sm text-gray-500">
              付款方式只記錄收款安排；綠界中華郵政一般宅配託運單僅用於寄送，不會自動代收貨款。
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="paymentMethod" className={labelClass}>
                  付款方式 *
                </label>
                <select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as LiveManualPaymentMethod)}
                  className={inputClass}
                >
                  {LIVE_MANUAL_PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {paymentMethod === 'OTHER' && (
                <div>
                  <label htmlFor="otherPaymentMethod" className={labelClass}>
                    其他付款方式 *
                  </label>
                  <input
                    id="otherPaymentMethod"
                    value={otherPaymentMethod}
                    onChange={(event) => setOtherPaymentMethod(event.target.value)}
                    className={inputClass}
                    placeholder="例如：LINE Pay、現場刷卡、公司帳款等"
                  />
                </div>
              )}
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-base font-semibold text-gray-900">商品明細</h2>
            <div className="mt-4 flex gap-2">
              <input
                value={productKeyword}
                onChange={(event) => setProductKeyword(event.target.value)}
                className={inputClass}
                placeholder="搜尋商品名稱 / SKU / slug"
              />
              <button
                type="button"
                onClick={() => searchProducts(productKeyword)}
                disabled={isSearchingProducts}
                className="shrink-0 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSearchingProducts ? '搜尋中' : '搜尋'}
              </button>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
                {products.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-500">沒有符合條件的商品</p>
                ) : (
                  products.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">{product.name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          SKU {product.sku}．庫存 {product.stock}．{formatCurrency(product.price)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => addProduct(product)}
                        disabled={product.stock <= 0}
                        className="shrink-0 rounded-lg border border-brand-600 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
                      >
                        加入
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-lg border border-gray-200">
                {items.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-500">尚未加入商品</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {items.map((item) => (
                      <div key={item.id} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-gray-900">{item.name}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {formatCurrency(item.price)}．庫存 {item.stock}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-700"
                          >
                            移除
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-[96px_1fr] items-center gap-3">
                          <input
                            type="number"
                            min={1}
                            max={Math.max(1, item.stock)}
                            value={item.quantity}
                            onChange={(event) => updateItemQuantity(item.id, event.target.value)}
                            className={inputClass}
                          />
                          <div className="text-right text-sm font-semibold text-gray-900">
                            {formatCurrency(safeNumber(item.price) * item.quantity)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <label htmlFor="orderNotes" className="text-base font-semibold text-gray-900">
              訂單備註
            </label>
            <textarea
              id="orderNotes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${inputClass} mt-3 min-h-28 resize-y`}
              placeholder="直播場次、喊單備註、電話確認紀錄等"
            />
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className={sectionClass}>
            <h2 className="text-base font-semibold text-gray-900">建立訂單</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">訂單來源</dt>
                <dd className="font-medium text-gray-900">LIVE_MANUAL</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">付款方式</dt>
                <dd className="font-medium text-gray-900">
                  {getPaymentMethodLabel(paymentMethod, otherPaymentMethod)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">物流方向</dt>
                <dd className="font-medium text-gray-900">綠界中華郵政一般宅配託運單</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">商品項目</dt>
                <dd className="font-medium text-gray-900">{items.length} 項</dd>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">商品總金額</dt>
                  <dd className="text-lg font-bold text-brand-700">{formatCurrency(totalAmount)}</dd>
                </div>
              </div>
            </dl>

            <button
              type="button"
              onClick={submitOrder}
              disabled={isSubmitting}
              className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? '建立中...' : '建立直播訂單'}
            </button>

            <p className="mt-3 text-xs leading-5 text-gray-500">
              建立後會扣庫存，並在訂單詳情中留下狀態紀錄、庫存紀錄與後台稽核紀錄。
            </p>
          </section>
        </aside>
      </div>

      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="newCustomerDialogTitle"
            className="max-h-[calc(100vh-48px)] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateCustomer();
              }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
                <div>
                  <h2 id="newCustomerDialogTitle" className="text-base font-semibold text-gray-900">
                    新增客戶資料
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">建立直播客戶後會自動選取，可再帶入收件資料。</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomerModalOpen(false);
                    setNewCustomer(emptyCustomer);
                  }}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="關閉"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="newCustomerName" className={labelClass}>
                    姓名 *
                  </label>
                  <input
                    id="newCustomerName"
                    value={newCustomer.name}
                    onChange={(event) => setNewCustomer((prev) => ({ ...prev, name: event.target.value }))}
                    className={modalInputClass}
                  />
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    客戶名稱可保存暱稱；但若要建立綠界託運單，收件人姓名需符合中文 2～5 個字或英文 4～10 個字。暱稱、地區、稱呼建議填在客戶備註。
                  </p>
                  {newCustomerNameValidation && (
                    <p
                      className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                        newCustomerNameValidation.valid
                          ? 'bg-green-50 text-green-700'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {newCustomerNameValidation.valid
                        ? `建立綠界託運單時可使用：${newCustomerNameValidation.normalizedName}`
                        : '此名稱可能不符合綠界託運單姓名限制，建議將真實姓名與暱稱分開填寫。'}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="newCustomerPhone" className={labelClass}>
                    電話
                  </label>
                  <input
                    id="newCustomerPhone"
                    value={newCustomer.phone}
                    onChange={(event) => setNewCustomer((prev) => ({ ...prev, phone: event.target.value }))}
                    className={modalInputClass}
                  />
                </div>
                <div>
                  <label htmlFor="newCustomerEmail" className={labelClass}>
                    Email
                  </label>
                  <input
                    id="newCustomerEmail"
                    type="email"
                    value={newCustomer.email}
                    onChange={(event) => setNewCustomer((prev) => ({ ...prev, email: event.target.value }))}
                    className={modalInputClass}
                  />
                </div>
                <div>
                  <label htmlFor="newCustomerFacebook" className={labelClass}>
                    Facebook 名稱
                  </label>
                  <input
                    id="newCustomerFacebook"
                    value={newCustomer.facebookName}
                    onChange={(event) => setNewCustomer((prev) => ({ ...prev, facebookName: event.target.value }))}
                    className={modalInputClass}
                  />
                </div>
                <div>
                  <label htmlFor="newCustomerLine" className={labelClass}>
                    LINE ID
                  </label>
                  <input
                    id="newCustomerLine"
                    value={newCustomer.lineId}
                    onChange={(event) => setNewCustomer((prev) => ({ ...prev, lineId: event.target.value }))}
                    className={modalInputClass}
                  />
                </div>
                <div>
                  <label htmlFor="newCustomerCity" className={labelClass}>
                    縣市
                  </label>
                  <select
                    id="newCustomerCity"
                    value={newCustomer.city}
                    onChange={(event) => updateNewCustomerCity(event.target.value)}
                    className={modalInputClass}
                  >
                    <option value="">請選擇縣市</option>
                    {taiwanCities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="newCustomerDistrict" className={labelClass}>
                    行政區
                  </label>
                  <select
                    id="newCustomerDistrict"
                    value={newCustomer.district}
                    onChange={(event) => updateNewCustomerDistrict(event.target.value)}
                    className={modalInputClass}
                    disabled={!newCustomer.city}
                  >
                    <option value="">{newCustomer.city ? '請選擇行政區' : '請先選擇縣市'}</option>
                    {newCustomerDistricts.map((option) => (
                      <option key={option.district} value={option.district}>
                        {option.district}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="newCustomerPostalCode" className={labelClass}>
                    郵遞區號
                  </label>
                  <select
                    id="newCustomerPostalCode"
                    value={newCustomer.postalCode}
                    onChange={(event) => setNewCustomer((prev) => ({ ...prev, postalCode: event.target.value }))}
                    className={modalInputClass}
                    disabled={!newCustomer.district}
                  >
                    <option value="">{newCustomer.district ? '請選擇郵遞區號' : '選擇行政區後自動帶入'}</option>
                    {newCustomer.postalCode && (
                      <option value={newCustomer.postalCode}>{newCustomer.postalCode}</option>
                    )}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="newCustomerAddress" className={labelClass}>
                    詳細地址
                  </label>
                  <input
                    id="newCustomerAddress"
                    value={newCustomer.address}
                    onChange={(event) => setNewCustomer((prev) => ({ ...prev, address: event.target.value }))}
                    className={modalInputClass}
                    placeholder="路名、巷弄、號、樓層"
                  />
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    詳細地址建議只填路名、巷弄、號、樓層；縣市、行政區、郵遞區號請使用上方欄位選擇，避免重複。
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="newCustomerRemark" className={labelClass}>
                    客戶備註
                  </label>
                  <textarea
                    id="newCustomerRemark"
                    value={newCustomer.remark}
                    onChange={(event) => setNewCustomer((prev) => ({ ...prev, remark: event.target.value }))}
                    className={`${modalInputClass} min-h-24 resize-y`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomerModalOpen(false);
                    setNewCustomer(emptyCustomer);
                  }}
                  disabled={isCreatingCustomer}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCustomer || !newCustomer.name.trim()}
                  className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreatingCustomer ? '建立中...' : '建立並選擇客戶'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
