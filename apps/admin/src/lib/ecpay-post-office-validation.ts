export const ECPAY_RECEIVER_NAME_LIMIT_MESSAGE =
  '綠界託運單收件人姓名限制：中文需 2～5 個字，英文需 4～10 個字。請將暱稱、地區或稱呼放在客戶備註。';

export const ECPAY_RECEIVER_NAME_BACKEND_MESSAGE =
  '收件人姓名不符合綠界限制：中文需 2～5 個字，英文需 4～10 個字。請改為符合格式的收件人姓名；暱稱或備註請放在客戶備註，不要放入收件人姓名。';

export interface EcpayReceiverNameValidationResult {
  valid: boolean;
  normalizedName?: string;
  message?: string;
}

export interface EcpayPostOfficeFieldValidationInput {
  receiverName: string;
  receiverPhone: string;
  postalCode: string;
  city?: string | null;
  district?: string | null;
  address: string;
  goodsAmount: number;
}

export interface EcpayPostOfficeFieldValidationResult {
  valid: boolean;
  normalizedName?: string;
  message?: string;
}

export interface EcpayReceiverAddressInput {
  city?: string | null;
  district?: string | null;
  address: string;
  postalCode?: string | null;
}

export function normalizeEcpayReceiverName(name: string): string {
  return name
    .trim()
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '');
}

export function validateEcpayReceiverName(name: string): EcpayReceiverNameValidationResult {
  const normalizedName = normalizeEcpayReceiverName(name);

  if (/^[\u4e00-\u9fff]{2,5}$/.test(normalizedName)) {
    return { valid: true, normalizedName };
  }

  if (/^[A-Za-z]{4,10}$/.test(normalizedName)) {
    return { valid: true, normalizedName };
  }

  return {
    valid: false,
    normalizedName: normalizedName || undefined,
    message: ECPAY_RECEIVER_NAME_LIMIT_MESSAGE,
  };
}

export function buildEcpayReceiverAddress(input: EcpayReceiverAddressInput): string {
  const postalCode = String(input.postalCode || '').replace(/\D/g, '').slice(0, 3);
  const city = input.city?.trim() || '';
  const district = input.district?.trim() || '';
  let address = input.address.trim();

  if (postalCode) {
    address = address.replace(new RegExp(`^${postalCode}\\s*`), '').trim();
  }
  address = address.replace(/^\d{3}\s*/, '').trim();

  const locationPrefix = `${city}${district}`;
  if (locationPrefix) {
    while (address.startsWith(locationPrefix)) {
      address = address.slice(locationPrefix.length).trim();
    }
  }

  return [city, district, address].filter(Boolean).join('');
}

export function validateEcpayPostOfficeFields(
  input: EcpayPostOfficeFieldValidationInput,
): EcpayPostOfficeFieldValidationResult {
  const nameValidation = validateEcpayReceiverName(input.receiverName);
  if (!nameValidation.valid) {
    return {
      valid: false,
      normalizedName: nameValidation.normalizedName,
      message: ECPAY_RECEIVER_NAME_BACKEND_MESSAGE,
    };
  }

  if (!input.receiverPhone.trim()) {
    return { valid: false, normalizedName: nameValidation.normalizedName, message: '缺少收件人電話' };
  }

  if (!/^\d{3,6}$/.test(input.postalCode.trim())) {
    return { valid: false, normalizedName: nameValidation.normalizedName, message: '缺少或郵遞區號格式不正確' };
  }

  if (!input.city?.trim()) {
    return { valid: false, normalizedName: nameValidation.normalizedName, message: '缺少收件人縣市' };
  }

  if (!input.district?.trim()) {
    return { valid: false, normalizedName: nameValidation.normalizedName, message: '缺少收件人行政區' };
  }

  if (!input.address.trim() || input.address.trim().length <= 6) {
    return { valid: false, normalizedName: nameValidation.normalizedName, message: '缺少完整收件地址' };
  }

  if (!Number.isFinite(input.goodsAmount) || input.goodsAmount <= 0) {
    return { valid: false, normalizedName: nameValidation.normalizedName, message: '商品金額必須大於 0' };
  }

  return { valid: true, normalizedName: nameValidation.normalizedName };
}
