/**
 * 統一 API 成功回應結構
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

/**
 * 統一 API 錯誤回應結構
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ValidationErrorDetail[];
  };
}

/**
 * Zod 驗證錯誤明細
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/**
 * 統一 API 回應聯合型別
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
