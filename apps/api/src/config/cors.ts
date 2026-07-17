// apps/api/src/config/cors.ts
import type { CorsOptions } from 'cors';

/**
 * CORS 設定模組
 *
 * 設計決策（生產環境等級）：
 * - 從環境變數 CORS_ORIGIN 讀取允許來源；支援以逗號分隔的多個網址
 * - 對每個來源做 trim 並過濾空字串 / 引號殘留，避免 .env 撰寫差異造成放行失敗
 * - production 不使用 localhost fallback，避免正式環境被開發來源誤放行
 * - 使用 origin 驗證函式（而非直接傳陣列），可精準回應 same-origin / 無 Origin 的請求
 * （例如 curl、Server-to-Server、健康檢查）並對未授權來源回傳明確錯誤
 * - credentials: true 以支援跨域攜帶 Cookie / Authorization
 */

const isProduction = process.env.NODE_ENV === 'production';
const DEVELOPMENT_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];
const ECPAY_ORIGINS = isProduction
  ? ['https://logistics.ecpay.com.tw']
  : ['https://logistics-stage.ecpay.com.tw', 'https://logistics.ecpay.com.tw'];

/**
 * 解析 CORS_ORIGIN 環境變數為乾淨的來源陣列
 * 範例： "http://localhost:3000, http://localhost:3001" → ['http://localhost:3000','http://localhost:3001']
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  const origins = (raw || '')
    .split(',')
    .map((o) => o.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, ''))
    .filter((o) => o.length > 0);

  if (origins.length > 0) {
    return origins;
  }

  if (isProduction) {
    throw new Error('NODE_ENV=production 時必須設定 CORS_ORIGIN');
  }

  return DEVELOPMENT_ORIGINS;
}

/**
 * 建立 cors 中間件選項
 */
export function buildCorsOptions(): CorsOptions {
  const allowedOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);

  return {
    origin(origin, callback) {
      // 無 Origin（如 curl、Server-to-Server、同源請求）一律放行
      if (!origin) {
        return callback(null, true);
      }

      const normalized = origin.replace(/\/+$/, '');

      if (allowedOrigins.includes(normalized) || ECPAY_ORIGINS.includes(normalized)) {
        return callback(null, true);
      }

      // 未授權來源：不丟出未處理例外，回傳明確錯誤交由 cors 套件處理
      return callback(new Error(`Origin「${origin}」不被 CORS 政策允許`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}
