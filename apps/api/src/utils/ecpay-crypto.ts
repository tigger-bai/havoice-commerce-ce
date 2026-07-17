// apps/api/src/utils/ecpay-crypto.ts
import crypto from 'crypto';

/**
 * 產生綠界 API 必備的 CheckMacValue (SHA256)
 * @param payload 要傳遞給綠界的參數物件 (不含 CheckMacValue 本身)
 * @param hashKey 綠界後台取得的 HashKey
 * @param hashIV 綠界後台取得的 HashIV
 */
export function generateCheckMacValue(payload: Record<string, any>, hashKey: string, hashIV: string): string {
  // 1. 將參數依照英文字母 A-Z 進行字典排序
  const sortedKeys = Object.keys(payload).sort();
  
  // 2. 將排序後的參數串接成 Query String 格式 (Key=Value&Key=Value)
  let macString = sortedKeys.map(key => `${key}=${payload[key]}`).join('&');
  
  // 3. 最前方加上 HashKey，最後方加上 HashIV
  macString = `HashKey=${hashKey}&${macString}&HashIV=${hashIV}`;
  
  // 4. 進行 URL Encode，並將與 .NET 相容的字元轉換回來
  let encodedString = encodeURIComponent(macString)
    .replace(/%20/g, '+')
    .replace(/%2d/gi, '-')
    .replace(/%5f/gi, '_')
    .replace(/%2e/gi, '.')
    .replace(/%21/gi, '!')
    .replace(/%2a/gi, '*')
    .replace(/%28/gi, '(')
    .replace(/%29/gi, ')')
    .toLowerCase(); // 5. 轉換為全小寫

  // 6. 透過 SHA256 進行雜湊
  const hash = crypto.createHash('sha256').update(encodedString).digest('hex');
  
  // 7. 最後轉換為全大寫
  return hash.toUpperCase();
}