import { prisma, type Prisma } from '@havoice/database';

export {
  SHIPMENT_PROVIDER_LABELS,
  getShipmentProviderLabel,
  type ShipmentProviderCode,
} from './shipment-provider-labels';

type ShipmentClient = {
  shipment: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<{ id: string }>;
  };
  shipmentEvent: {
    create(args: unknown): Promise<unknown>;
  };
};

export type ShipmentProvider = 'MANUAL' | 'EC_PAY_C2C' | 'POST_OFFICE' | 'EC_PAY_POST_OFFICE';

type UpsertShipmentInput = {
  client?: unknown;
  orderId: string;
  provider: ShipmentProvider;
  fallbackToAnyShipment?: boolean;
  shippingMethod?: string | null;
  status: string;
  trackingNumber?: string | null;
  providerShipmentNo?: string | null;
  paymentNo?: string | null;
  validationNo?: string | null;
  cvsStoreId?: string | null;
  cvsStoreName?: string | null;
  cvsAddress?: string | null;
  cvsSubType?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  recipientAddress?: string | null;
  rawResponse?: Prisma.InputJsonObject | null;
};

type CreateShipmentEventInput = {
  client?: unknown;
  shipmentId: string;
  orderId: string;
  eventType: string;
  status?: string | null;
  message?: string | null;
  metadata?: Prisma.InputJsonObject | null;
};

function shipmentClient(client?: unknown): ShipmentClient {
  return (client ?? prisma) as ShipmentClient;
}

export async function upsertShipmentRecord(input: UpsertShipmentInput): Promise<{ id: string }> {
  const client = shipmentClient(input.client);

  const existing = await client.shipment.findFirst({
    where: input.fallbackToAnyShipment
      ? { orderId: input.orderId }
      : { orderId: input.orderId, provider: input.provider },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });

  const createData = {
    orderId: input.orderId,
    provider: input.provider,
    shippingMethod: input.shippingMethod ?? null,
    status: input.status,
    trackingNumber: input.trackingNumber ?? null,
    providerShipmentNo: input.providerShipmentNo ?? null,
    paymentNo: input.paymentNo ?? null,
    validationNo: input.validationNo ?? null,
    cvsStoreId: input.cvsStoreId ?? null,
    cvsStoreName: input.cvsStoreName ?? null,
    cvsAddress: input.cvsAddress ?? null,
    cvsSubType: input.cvsSubType ?? null,
    recipientName: input.recipientName ?? null,
    recipientPhone: input.recipientPhone ?? null,
    recipientEmail: input.recipientEmail ?? null,
    recipientAddress: input.recipientAddress ?? null,
    rawResponse: input.rawResponse ?? undefined,
  };

  if (!existing) {
    return client.shipment.create({
      data: createData,
      select: { id: true },
    });
  }

  const updateData: Record<string, unknown> = { status: input.status };
  const optionalKeys = [
    'shippingMethod',
    'trackingNumber',
    'providerShipmentNo',
    'paymentNo',
    'validationNo',
    'cvsStoreId',
    'cvsStoreName',
    'cvsAddress',
    'cvsSubType',
    'recipientName',
    'recipientPhone',
    'recipientEmail',
    'recipientAddress',
    'rawResponse',
  ] as const;

  for (const key of optionalKeys) {
    const value = input[key];
    if (value !== undefined) {
      updateData[key] = value;
    }
  }

  return client.shipment.update({
    where: { id: existing.id },
    data: updateData,
    select: { id: true },
  });
}

export async function createShipmentEvent(input: CreateShipmentEventInput): Promise<void> {
  const client = shipmentClient(input.client);

  await client.shipmentEvent.create({
    data: {
      shipmentId: input.shipmentId,
      orderId: input.orderId,
      eventType: input.eventType,
      status: input.status ?? null,
      message: input.message ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}
