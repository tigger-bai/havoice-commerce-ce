'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiClientError } from '@/lib/api-client';
import type { Article, PaginatedData } from '@/types/entities';
import type { CreateArticleDTO, UpdateArticleDTO, SetRecommendationsDTO } from '@havoice/shared';

interface UseArticlesOptions {
  page?: number;
  limit?: number;
  categoryId?: string;
  status?: string;
}

/**
 * useArticles - 文章列表查詢 Hook
 *
 * 設計決策：
 * - 自動管理 loading / error / data 三態
 * - 參數變更時自動重新查詢
 * - 提供 refetch 方法供手動重新查詢
 */
export function useArticles(options: UseArticlesOptions = {}) {
  const { page = 1, limit = 10, categoryId, status } = options;
  const [data, setData] = useState<PaginatedData<Article> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | undefined> = {
        page,
        limit,
        categoryId,
        status,
      };
      const result = await apiClient.get<PaginatedData<Article>>(
        '/api/articles',
        params
      );
      setData(result);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('載入文章列表時發生未知錯誤');
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, categoryId, status]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  return { data, isLoading, error, refetch: fetchArticles };
}

/**
 * useArticle - 單一文章查詢 Hook
 */
export function useArticle(id: string | null) {
  const [data, setData] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchArticle = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiClient.get<Article>(`/api/articles/${id}`);
      setData(result);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('載入文章時發生未知錯誤');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  return { data, isLoading, error, refetch: fetchArticle };
}

/**
 * useArticleMutations - 文章 CRUD 操作 Hook
 */
export function useArticleMutations() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createArticle = async (data: CreateArticleDTO): Promise<Article | null> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await apiClient.post<Article>('/api/articles', data);
      return result;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('建立文章時發生未知錯誤');
      }
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateArticle = async (
    id: string,
    data: UpdateArticleDTO
  ): Promise<Article | null> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await apiClient.patch<Article>(`/api/articles/${id}`, data);
      return result;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('更新文章時發生未知錯誤');
      }
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteArticle = async (id: string): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.delete(`/api/articles/${id}`);
      return true;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('刪除文章時發生未知錯誤');
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const setRecommendations = async (
    articleId: string,
    data: SetRecommendationsDTO
  ): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.put(`/api/articles/${articleId}/recommendations`, data);
      return true;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('更新推薦商品時發生未知錯誤');
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    error,
    createArticle,
    updateArticle,
    deleteArticle,
    setRecommendations,
  };
}
