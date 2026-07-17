import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient, type Prisma } from '@prisma/client';

import { parseTaiwanAddress } from '../../shared/src/taiwan-address';

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

type BackfillStats = {
  totalScanned: number;
  parsed: number;
  updated: number;
  skippedNoAddress: number;
  skippedUnparsed: number;
  errors: number;
};

type ParsedExample = {
  customerId: string;
  name: string;
  address: string;
  city: string;
  district: string;
  postalCode: string;
  updateFields: string[];
};

function hasText(value: string | null): boolean {
  return Boolean(value?.trim());
}

async function main() {
  const stats: BackfillStats = {
    totalScanned: 0,
    parsed: 0,
    updated: 0,
    skippedNoAddress: 0,
    skippedUnparsed: 0,
    errors: 0,
  };
  const examples: ParsedExample[] = [];

  console.log(`Mode: ${shouldWrite ? 'write' : 'dry-run'}`);

  const customers = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      OR: [
        { city: null },
        { city: '' },
        { district: null },
        { district: '' },
        { postalCode: null },
        { postalCode: '' },
      ],
    },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      district: true,
      postalCode: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  stats.totalScanned = customers.length;

  for (const customer of customers) {
    try {
      if (!hasText(customer.address)) {
        stats.skippedNoAddress += 1;
        continue;
      }

      const parsed = parseTaiwanAddress(customer.address ?? '');
      if (!parsed.city || !parsed.district || !parsed.postalCode) {
        stats.skippedUnparsed += 1;
        continue;
      }

      stats.parsed += 1;

      const data: Prisma.CustomerUpdateInput = {};
      const updateFields: string[] = [];

      if (!hasText(customer.city)) {
        data.city = parsed.city;
        updateFields.push('city');
      }
      if (!hasText(customer.district)) {
        data.district = parsed.district;
        updateFields.push('district');
      }
      if (!hasText(customer.postalCode)) {
        data.postalCode = parsed.postalCode;
        updateFields.push('postalCode');
      }

      if (updateFields.length === 0) continue;

      stats.updated += 1;

      if (examples.length < 10) {
        examples.push({
          customerId: customer.id,
          name: customer.name,
          address: parsed.normalizedAddress,
          city: parsed.city,
          district: parsed.district,
          postalCode: parsed.postalCode,
          updateFields,
        });
      }

      if (shouldWrite) {
        await prisma.customer.update({
          where: { id: customer.id },
          data,
        });
      }
    } catch (error) {
      stats.errors += 1;
      console.error(
        `[backfill-customer-address-parts] failed customerId=${customer.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log('Parsed examples');
  if (examples.length === 0) {
    console.log('- no parsed examples');
  } else {
    for (const example of examples) {
      console.log(
        `- ${example.name} (${example.customerId}): ${example.address} => ` +
          `${example.city} / ${example.district} / ${example.postalCode} ` +
          `[${example.updateFields.join(', ')}]`,
      );
    }
  }

  console.log('Summary');
  console.log(`- total scanned: ${stats.totalScanned}`);
  console.log(`- parsed: ${stats.parsed}`);
  console.log(`- ${shouldWrite ? 'updated' : 'customers to update'}: ${stats.updated}`);
  console.log(`- skipped no address: ${stats.skippedNoAddress}`);
  console.log(`- skipped unparsed: ${stats.skippedUnparsed}`);
  console.log(`- errors: ${stats.errors}`);
}

main()
  .catch((error) => {
    console.error('[backfill-customer-address-parts] fatal error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
