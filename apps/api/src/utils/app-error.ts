/**
 * 自定義應用程式錯誤類別
 *
 * 設計決策：
 * - 繼承原生 Error 以保留完整的 stack trace
 * - statusCode 用於 HTTP 回應狀態碼
 * - code 用於前端識別錯誤類型的機器可讀代碼
 * - isOperational 區分「可預期的業務錯誤」與「不可預期的系統錯誤」
 *
 * 建構子參數順序為 (statusCode, message, code)，與全專案既有呼叫慣例一致。
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number = 500,
    message: string = '伺服器內部錯誤',
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // 確保 instanceof 檢查正常運作
    Object.setPrototypeOf(this, AppError.prototype);

    // 捕獲 stack trace（排除建構函式本身）
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 常用錯誤工廠方法
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} (${identifier}) 不存在`
      : `${resource} 不存在`;
    super(404, message, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
  }
}
