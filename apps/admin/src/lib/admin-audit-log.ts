import type { NextRequest } from 'next/server';

import { prisma, type Prisma } from '@havoice/database';

import type { AdminSessionUser } from '@/lib/auth/api-guard';

export type AdminAuditAction =
  | 'ORDER_STATUS_UPDATE'
  | 'ORDER_CANCEL'
  | 'ORDER_TRACKING_UPDATE'
  | 'ORDER_AUTO_MARK_SHIPPED'
  | 'ORDER_C2C_LOGISTICS_CREATE'
  | 'ORDER_POST_OFFICE_SHIPMENT_CREATE'
  | 'ORDER_POST_OFFICE_STATUS_UPDATE'
  | 'ORDER_POST_OFFICE_TRACKING_SYNC'
  | 'ORDER_ECPAY_POST_OFFICE_LOGISTICS_CREATE'
  | 'ORDER_LIVE_MANUAL_CREATE'
  | 'ORDER_PAYMENT_CONFIRMATION_CREATE';

type AdminAuditClient = {
  adminAuditLog: {
    create(args: { data: Prisma.AdminAuditLogUncheckedCreateInput }): Promise<unknown>;
  };
};

type CreateAdminAuditLogInput = {
  client?: unknown;
  req: NextRequest;
  actor?: AdminSessionUser | null;
  action: AdminAuditAction;
  resourceType: 'ORDER';
  resourceId?: string | null;
  description?: string | null;
  beforeData?: Prisma.InputJsonObject;
  afterData?: Prisma.InputJsonObject;
  metadata?: Prisma.InputJsonObject;
};

function getClientIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp.slice(0, 191);
  }

  const realIp = req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip');
  return realIp ? realIp.trim().slice(0, 191) : null;
}

export async function createAdminAuditLog(input: CreateAdminAuditLogInput): Promise<void> {
  const client = (input.client ?? prisma) as AdminAuditClient;
  const userAgent = input.req.headers.get('user-agent');

  await client.adminAuditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorEmail: input.actor?.email ?? null,
      actorName: input.actor?.name ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      description: input.description ?? null,
      beforeData: input.beforeData,
      afterData: input.afterData,
      metadata: input.metadata,
      ipAddress: getClientIp(input.req),
      userAgent: userAgent ? userAgent.slice(0, 2000) : null,
    },
  });
}
