export type ShipmentProviderCode = 'MANUAL' | 'EC_PAY_C2C' | 'POST_OFFICE' | 'EC_PAY_POST_OFFICE';

export const SHIPMENT_PROVIDER_LABELS: Record<ShipmentProviderCode, string> = {
  MANUAL: '手動物流',
  EC_PAY_C2C: '綠界超商物流',
  POST_OFFICE: '郵局備援 / Mock',
  EC_PAY_POST_OFFICE: '綠界郵局一般宅配',
};

export function getShipmentProviderLabel(provider?: string | null): string {
  if (!provider) return '—';

  return SHIPMENT_PROVIDER_LABELS[provider as ShipmentProviderCode] ?? provider;
}
