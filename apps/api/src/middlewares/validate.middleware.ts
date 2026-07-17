import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * 通用 Zod 驗證中間件工廠
 *
 * 設計決策：
 * - 支援驗證 body、query、params 三種來源
 * - 驗證通過後將解析結果寫回 req 對應屬性（包含 Zod 的 transform/default 處理結果）
 * - 驗證失敗時拋出結構化的 ZodError，由全域錯誤處理器統一處理
 *
 * @param schema - Zod Schema 實例
 * @param source - 驗證來源：'body' | 'query' | 'params'
 */
export function validate(
  schema: ZodSchema,
  source: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      // 將解析後的結果（含 default/transform）寫回 request
      (req as unknown as Record<string, unknown>)[source] = parsed;
      next();
    } catch (error) {
      // 直接將 ZodError 傳遞給全域錯誤處理器
      next(error);
    }
  };
}
