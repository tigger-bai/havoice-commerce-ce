/**
 * 一次性腳本：將指定 email 的帳號升級為 SUPER_ADMIN
 *
 * 用途：
 *   RBAC 升級後，需指定一個既有管理員帳號成為最高權限 SUPER_ADMIN，
 *   以便登入後台存取 /system-users 並管理 ADMIN / EDITOR / VENDOR 帳號。
 *
 * 設計決策：
 *   - 不重建任何資料，僅針對單一帳號做 role 更新（相較整批 seed 更安全、可重複執行）
 *   - email 必須由環境變數 PROMOTE_EMAIL 或命令列參數明確指定，不提供預設值
 *   - 冪等：若帳號已是 SUPER_ADMIN，重複執行不會造成副作用
 *   - 找不到帳號時以非零結束碼結束，便於 CI / 人工辨識
 *
 * 執行方式：
 *   # 指定帳號（任一方式）
 *   PROMOTE_EMAIL=admin@example.com pnpm --filter @havoice/database promote:super-admin
 *   pnpm --filter @havoice/database promote:super-admin -- admin@example.com
 */

import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveTargetEmail(): string | null {
  const argEmail = process.argv.slice(2).find((argument) => !argument.startsWith('-'));
  const email = (argEmail || process.env.PROMOTE_EMAIL || '').trim().toLowerCase();

  return email || null;
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  const [domainName, ...domainSuffixParts] = domain.split('.');
  const maskedLocalPart = `${localPart.charAt(0)}***`;
  const maskedDomain = `${domainName.charAt(0)}***`;
  const domainSuffix = domainSuffixParts.join('.');

  return `${maskedLocalPart}@${maskedDomain}.${domainSuffix}`;
}

async function main() {
  const email = resolveTargetEmail();

  if (!email) {
    console.error('❌ 未提供目標 Email。請使用 PROMOTE_EMAIL 或命令列參數明確指定。');
    process.exitCode = 1;
    return;
  }

  if (!EMAIL_PATTERN.test(email)) {
    console.error('❌ 目標 Email 格式無效，未執行任何變更。');
    process.exitCode = 1;
    return;
  }

  const maskedEmail = maskEmail(email);
  console.log(`🔐 準備將帳號升級為 SUPER_ADMIN：${maskedEmail}`);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });

  if (!existing) {
    console.error(`❌ 找不到指定帳號：${maskedEmail}`);
    process.exitCode = 1;
    return;
  }

  if (existing.role === Role.SUPER_ADMIN) {
    console.log(`✅ 帳號 ${maskedEmail} 已是 SUPER_ADMIN，無需變更（冪等）。`);
    return;
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { role: Role.SUPER_ADMIN },
    select: { role: true },
  });

  console.log(`✅ 升級完成：${maskedEmail}，角色 ${existing.role} → ${updated.role}`);
}

main()
  .catch(() => {
    console.error('❌ 升級腳本執行失敗，未輸出可能包含敏感資訊的錯誤內容。');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
