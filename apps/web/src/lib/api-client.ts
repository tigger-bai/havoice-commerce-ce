// apps/web/src/lib/api-client.ts
import type { ApiSuccessResponse } from '@havoice/shared';

const DEV_API_BASE_URL = 'http://localhost:4000';

function getApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (value) {
    return value.replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEV_API_BASE_URL;
  }

  throw new Error('Missing required environment variable: NEXT_PUBLIC_API_URL');
}

const API_BASE_URL = getApiBaseUrl();

interface RequestOptions {
  params?: Record<string, string | number | undefined>;
  cache?: RequestCache;
  revalidate?: number;
}

/**
 * 前台 API 客戶端
 *
 * 設計決策：
 * - 針對 Server Components 優化，支援 Next.js 的 cache 與 revalidate
 * - 加入 credentials: 'include' 確保跨網域請求能攜帶 NextAuth Cookie
 */
async function fetchApi<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, cache, revalidate } = options;

  const url = new URL(`${API_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const fetchOptions: RequestInit = {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // 🔴 補上這行：讓 GET 請求帶上 Cookie
    ...(cache && { cache }),
    ...(revalidate !== undefined && { next: { revalidate } }),
  };

  const response = await fetch(url.toString(), fetchOptions);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
  }

  const json = await response.json();
  return (json as ApiSuccessResponse<T>).data;
}

export const api = {
  get<T>(endpoint: string, options?: RequestOptions) {
    return fetchApi<T>(endpoint, options);
  },

  async post<T>(endpoint: string, body: unknown) {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include', // 🔴 補上這行：這是結帳能否成功識別身分的關鍵！
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // 🔴 修正：將 status code 一併拋出，這樣結帳頁面才能抓到 409(庫存不足) 或 400(驗證失敗)
      throw { 
        status: response.status, 
        message: errorData.error?.message || errorData.message || 'Request failed',
        details: errorData.error?.details
      };
    }

    const json = await response.json();
    return (json as ApiSuccessResponse<T>).data;
  },
};