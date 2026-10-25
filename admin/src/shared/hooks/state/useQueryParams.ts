import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DEFAULT_PAGE_SIZE } from '@/shared/constants/consts';

export interface QueryParamsConfig {
  pageKey?: string;
  pageSizeKey?: string;
  searchKey?: string;
  tabKey?: string;
  defaultPageSize?: number;
  /** Tự reset page về 1 khi đổi bất kỳ param nào không phải page/pageSize. */
  resetPageOnChange?: boolean;
}

export type QueryParamValue = string | number | null | undefined;

export interface UseQueryParamsReturn {
  page: number;
  pageSize: number;
  search: string;
  tab: string;
  getParam: (key: string, defaultValue?: string) => string;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSearch: (value: string) => void;
  setTab: (value: string) => void;
  setParam: (key: string, value: QueryParamValue) => void;
  updateParams: (updates: Record<string, QueryParamValue>) => void;
  clearParams: () => void;
  searchParams: URLSearchParams;
}

const DEFAULT_PAGE = 1;

/**
 * Hook quản lý filter/pagination/tab qua URL query string.
 *
 * - BẮT BUỘC dùng cho mọi màn hình có filter / phân trang / tab (xem
 *   `api-patterns.md §URL-synced filters`).
 * - Đổi filter → page tự reset về 1.
 * - `setSearch('')` / `setParam(key, null)` xoá luôn key khỏi URL.
 * - Mặc định dùng `{ replace: true }` để không phá history khi gõ search.
 */
export const useQueryParams = (config?: QueryParamsConfig): UseQueryParamsReturn => {
  const [searchParams, setSearchParams] = useSearchParams();

  const pageKey = config?.pageKey ?? 'page';
  const pageSizeKey = config?.pageSizeKey ?? 'pageSize';
  const searchKey = config?.searchKey ?? 'search';
  const tabKey = config?.tabKey ?? 'tab';
  const defaultPageSize = config?.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const resetPageOnChange = config?.resetPageOnChange ?? true;

  const page = useMemo(() => {
    const parsed = parseInt(searchParams.get(pageKey) ?? '', 10);
    return Number.isNaN(parsed) || parsed < 1 ? DEFAULT_PAGE : parsed;
  }, [searchParams, pageKey]);

  const pageSize = useMemo(() => {
    const parsed = parseInt(searchParams.get(pageSizeKey) ?? '', 10);
    return Number.isNaN(parsed) || parsed < 1 ? defaultPageSize : parsed;
  }, [searchParams, pageSizeKey, defaultPageSize]);

  const search = useMemo(() => searchParams.get(searchKey) ?? '', [searchParams, searchKey]);

  const tab = useMemo(() => searchParams.get(tabKey) ?? '', [searchParams, tabKey]);

  const getParam = useCallback(
    (key: string, defaultValue = '') => searchParams.get(key) ?? defaultValue,
    [searchParams],
  );

  const updateParams = useCallback(
    (updates: Record<string, QueryParamValue>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(updates).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '') {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          });
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (newPage: number) => updateParams({ [pageKey]: newPage }),
    [updateParams, pageKey],
  );

  const setPageSize = useCallback(
    (size: number) => updateParams({ [pageSizeKey]: size, [pageKey]: 1 }),
    [updateParams, pageSizeKey, pageKey],
  );

  const setSearch = useCallback(
    (value: string) =>
      updateParams({
        [searchKey]: value || null,
        ...(resetPageOnChange ? { [pageKey]: 1 } : {}),
      }),
    [updateParams, searchKey, pageKey, resetPageOnChange],
  );

  const setTab = useCallback(
    (value: string) => updateParams({ [tabKey]: value || null }),
    [updateParams, tabKey],
  );

  const setParam = useCallback(
    (key: string, value: QueryParamValue) =>
      updateParams({
        [key]: value,
        ...(resetPageOnChange && key !== pageKey && key !== pageSizeKey ? { [pageKey]: 1 } : {}),
      }),
    [updateParams, pageKey, pageSizeKey, resetPageOnChange],
  );

  const clearParams = useCallback(
    () => setSearchParams(new URLSearchParams(), { replace: true }),
    [setSearchParams],
  );

  return {
    page,
    pageSize,
    search,
    tab,
    getParam,
    setPage,
    setPageSize,
    setSearch,
    setTab,
    setParam,
    updateParams,
    clearParams,
    searchParams,
  };
};
