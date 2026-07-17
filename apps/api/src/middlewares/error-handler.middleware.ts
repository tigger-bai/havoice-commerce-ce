import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@havoice/database';
import { AppError } from '../utils/app-error';
import type { ApiErrorResponse, ValidationErrorDetail } from '@havoice/shared';

/**
 * 全域錯誤處理中間件
 *
 * 設計決策：
 * - 依照錯誤類型分層處理：ZodError → AppError → PrismaError → 未知錯誤
 * - 所有回應皆遵循統一的 ApiErrorResponse 結構
 * - 生產環境下隱藏內部錯誤細節，僅記錄至日誌
 * - 開發環境下回傳完整的 stack trace 以利除錯
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ─── 1. Zod 驗證錯誤 → 400 Bad Request ───
  if (err instanceof ZodError) {
    const details: ValidationErrorDetail[] = err.errors.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '請求資料驗證失敗，請檢查輸入欄位',
        details,
      },
    };

    res.status(400).json(response);
    return;
  }

  // ─── 2. 自定義業務錯誤 (AppError) ───
  if (err instanceof AppError) {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // ─── 3. Prisma 已知錯誤 ───
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    let statusCode = 500;
    let code = 'DATABASE_ERROR';
    let message = '資料庫操作失敗';

    switch (err.code) {
      case 'P2002': {
        // 唯一約束衝突
        statusCode = 409;
        code = 'CONFLICT';
        const target = (err.meta?.target as string[])?.join(', ') || '未知欄位';
        message = `資料已存在：${target} 的值重複`;
        break;
      }
      case 'P2025': {
        // 記錄不存在
        statusCode = 404;
        code = 'NOT_FOUND';
        message = '請求的資源不存在';
        break;
      }
      case 'P2003': {
        // 外鍵約束失敗
        statusCode = 400;
        code = 'FOREIGN_KEY_ERROR';
        message = '關聯的資源不存在，請確認引用的 ID 是否正確';
        break;
      }
    }

    const response: ApiErrorResponse = {
      success: false,
      error: { code, message },
    };

    res.status(statusCode).json(response);
    return;
  }

  // ─── 4. 未知錯誤 → 500 Internal Server Error ───
  console.error('[UnhandledError]', err);

  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? '伺服器內部錯誤，請稍後再試'
          : err.message || '未知錯誤',
    },
  };

  res.status(500).json(response);
}
