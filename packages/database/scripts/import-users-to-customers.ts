import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '../../.env'));

const prisma = new PrismaClient();
const shouldWrite = process.argv.includes('--write');

type ImportStats = {
  totalUsersScanned: number;
  eligibleUsers: number;
  createdCustomers: number;
  skippedExistingCustomers: number;
  updatedCustomerAddresses: number;
  skippedMissingIdentity: number;
  errors: number;
};

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const normalized = phone.replace(/[\s\-()（）]/g, '').trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeAddress(address: string | null): string | null {
  if (!address) return null;
  const normalized = address.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildRemark(user: { id: string; address: string | null }): string {
  const lines = ['由 User 匯入', `原 User ID: ${user.id}`];
  return lines.join('\n');
}

function appendImportRemark(existingRemark: string | null, importRemark: string): string {
  const current = existingRemark?.trim() || '';
  if (!current) return importRemark;
  if (current.includes(importRemark) || current.includes(importRemark.split('\n')[1] ?? importRemark)) {
    return current;
  }
  return `${current}\n\n${importRemark}`;
}

async function main() {
  const stats: ImportStats = {
    totalUsersScanned: 0,
    eligibleUsers: 0,
    createdCustomers: 0,
    skippedExistingCustomers: 0,
    updatedCustomerAddresses: 0,
    skippedMissingIdentity: 0,
    errors: 0,
  };

  console.log(`Mode: ${shouldWrite ? 'write' : 'dry-run'}`);

  const [users, existingCustomers] = await Promise.all([
    prisma.user.findMany({
      where: {
        deletedAt: null,
        role: 'USER',
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        phone: true,
        email: true,
        address: true,
        remark: true,
      },
    }),
  ]);

  stats.totalUsersScanned = users.length;

  const existingPhones = new Map<string, (typeof existingCustomers)[number]>();
  const existingEmails = new Map<string, (typeof existingCustomers)[number]>();

  for (const customer of existingCustomers) {
    const phone = normalizePhone(customer.phone);
    const email = normalizeEmail(customer.email);
    if (phone && !existingPhones.has(phone)) existingPhones.set(phone, customer);
    if (email && !existingEmails.has(email)) existingEmails.set(email, customer);
  }

  for (const user of users) {
    try {
      const name = user.name?.trim() || '';
      const phone = normalizePhone(user.phone);
      const email = normalizeEmail(user.email);
      const address = normalizeAddress(user.address);

      if (!name && !phone && !email) {
        stats.skippedMissingIdentity += 1;
        continue;
      }

      stats.eligibleUsers += 1;

      const existingCustomer =
        (phone ? existingPhones.get(phone) : null) ||
        (email ? existingEmails.get(email) : null) ||
        null;

      if (existingCustomer) {
        const existingAddress = normalizeAddress(existingCustomer.address);
        if (address && !existingAddress) {
          stats.updatedCustomerAddresses += 1;

          if (shouldWrite) {
            const importRemark = buildRemark(user);
            await prisma.customer.update({
              where: { id: existingCustomer.id },
              data: {
                address,
                remark: appendImportRemark(existingCustomer.remark, importRemark),
              },
            });

            existingCustomer.address = address;
            existingCustomer.remark = appendImportRemark(existingCustomer.remark, importRemark);
          }
        }

        stats.skippedExistingCustomers += 1;
        continue;
      }

      const customerName = name || email || phone;
      if (!customerName) {
        stats.skippedMissingIdentity += 1;
        continue;
      }

      if (shouldWrite) {
        await prisma.customer.create({
          data: {
            name: customerName,
            phone,
            email,
            address,
            remark: buildRemark(user),
            source: 'USER_IMPORT',
          },
        });
      }

      stats.createdCustomers += 1;
      if (phone) existingPhones.set(phone, { id: '', phone, email, address, remark: buildRemark(user) });
      if (email) existingEmails.set(email, { id: '', phone, email, address, remark: buildRemark(user) });
    } catch (error) {
      stats.errors += 1;
      console.error(
        `[import-users-to-customers] failed userId=${user.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log('Summary');
  console.log(`- total users scanned: ${stats.totalUsersScanned}`);
  console.log(`- eligible users: ${stats.eligibleUsers}`);
  console.log(
    `- ${shouldWrite ? 'created customers' : 'customers to create'}: ${stats.createdCustomers}`,
  );
  console.log(
    `- ${shouldWrite ? 'updated customer addresses' : 'customer addresses to update'}: ${stats.updatedCustomerAddresses}`,
  );
  console.log(`- skipped existing customers: ${stats.skippedExistingCustomers}`);
  console.log(`- skipped missing identity: ${stats.skippedMissingIdentity}`);
  console.log(`- errors: ${stats.errors}`);
}

main()
  .catch((error) => {
    console.error('[import-users-to-customers] fatal error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
