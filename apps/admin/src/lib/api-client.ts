import type { ApiSuccessResponse, ApiErrorResponse } from '@havoice/shared';

/**
 * API 客戶端基礎設施
 *
 * 設計決策：
 * - 統一封裝所有 HTTP 請求，提供一致的錯誤處理
 * - 自動解析 JSON 回應並進行型別推導
 * - 支援 Server Components 與 Client Components 兩種使用情境
 */

const DEV_API_BASE_URL = 'http://localhost:4000';

function getApiBaseUrl(): string {
  const value = (
    typeof window === 'undefined'
      ? process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL
      : process.env.NEXT_PUBLIC_API_URL
  )?.trim();

  if (value) {
    return value.replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEV_API_BASE_URL;
  }

  throw new Error('Missing required API URL environment variable');
}

const API_BASE_URL = getApiBaseUrl();

export class ApiClientError extends Error {
  public statusCode: number;
  public code: string;
  public details?: Array<{ field: string; message: string }>;

  constructor(response: ApiErrorResponse, statusCode: number) {
    super(response.error.message);
    this.statusCode = statusCode;
    this.code = response.error.code;
    this.details = response.error.details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, params, headers, ...restOptions } = options;

  // 建構 URL 與查詢參數
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const config: RequestInit = {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  const response = await fetch(url.toString(), config);
  const data = await response.json();

  if (!response.ok) {
    throw new ApiClientError(data as ApiErrorResponse, response.status);
  }

  return (data as ApiSuccessResponse<T>).data;
}

/**
 * API 客戶端方法集合
 */
export const apiClient = {
  get<T>(endpoint: string, params?: Record<string, string | number | undefined>) {
    return request<T>(endpoint, { method: 'GET', params });
  },

  post<T>(endpoint: string, body: unknown) {
    return request<T>(endpoint, { method: 'POST', body });
  },

  patch<T>(endpoint: string, body: unknown) {
    return request<T>(endpoint, { method: 'PATCH', body });
  },

  put<T>(endpoint: string, body: unknown) {
    return request<T>(endpoint, { method: 'PUT', body });
  },

  delete<T>(endpoint: string) {
    return request<T>(endpoint, { method: 'DELETE' });
  },
};
