import fs from 'fs';
import { parse as parseDotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * 環境變數載入模組
 *
 * 設計決策：
 * - 必須在任何讀取 process.env 的程式碼之前被 import（故於 server.ts / app.ts 最上方載入）
 * - 依序載入 Monorepo 根目錄 .env 與 apps/api/.env，app 專屬設定覆蓋共用設定
 * - 物流 webhook 需和 admin 建單端使用同一組正式物流金鑰，因此只同步 admin 的 ECPAY_LOGISTICS_HASH_KEY/IV
 * - dev（tsx watch）與 build 後（node dist）皆能正確讀到變數
 * - 對關鍵變數（JWT_SECRET）做啟動期檢查，缺漏時於非正式環境提出警告
 */

const configDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(configDir, '../..');
const repoRoot = path.resolve(apiRoot, '../..');
const adminRoot = path.resolve(apiRoot, '../admin');
const originalEnvKeys = new Set(Object.keys(process.env));

function applyDotenvFile(
  filePath: string,
  options: {
    overridePreviousFileValues?: boolean;
    onlyKeys?: string[];
  } = {},
): void {
  if (!fs.existsSync(filePath)) return;

  const parsed = parseDotenv(fs.readFileSync(filePath));
  const allowedKeys = options.onlyKeys ? new Set(options.onlyKeys) : null;

  for (const [key, value] of Object.entries(parsed)) {
    if (allowedKeys && !allowedKeys.has(key)) continue;

    const hasValue = typeof process.env[key] !== 'undefined';
    const isOriginalEnv = originalEnvKeys.has(key);
    if (!hasValue || (options.overridePreviousFileValues && !isOriginalEnv)) {
      process.env[key] = value;
    }
  }
}

// 不依賴 process.cwd()，避免從 monorepo root 啟動時漏讀 apps/api/.env。
// 先載入 repo root 共用設定，再讓 apps/api/.env 覆蓋 root 檔案值。
// 若 deployment runtime 已明確提供 env，仍保留 runtime env 優先權。
applyDotenvFile(path.join(repoRoot, '.env'));
applyDotenvFile(path.join(apiRoot, '.env'), { overridePreviousFileValues: true });

// EC_PAY_POST_OFFICE 建單在 admin app 執行；API webhook 驗證必須使用同一組物流 HashKey/IV。
// 只同步物流專用金鑰，避免改動金流 ECPAY_HASH_KEY / ECPAY_HASH_IV。
applyDotenvFile(path.join(adminRoot, '.env'), {
  overridePreviousFileValues: true,
  onlyKeys: ['ECPAY_LOGISTICS_HASH_KEY', 'ECPAY_LOGISTICS_HASH_IV'],
});

const isProduction = process.env.NODE_ENV === 'production';
const DEV_JWT_SECRET = 'development-only-fallback-secret';
const jwtSecret = process.env.JWT_SECRET?.trim();

if (!jwtSecret && isProduction) {
  throw new Error('[API] NODE_ENV=production 時必須設定 JWT_SECRET');
}

if (jwtSecret === 'fallback-secret-change-in-production' && isProduction) {
  throw new Error('[API] production 不可使用不安全的 JWT_SECRET fallback');
}

if (!jwtSecret) {
  console.warn('[API] 未設定 JWT_SECRET，僅於非 production 使用開發用 fallback');
}

export const env = {
  PORT: process.env.API_PORT || '4000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  JWT_SECRET: jwtSecret || DEV_JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
};
