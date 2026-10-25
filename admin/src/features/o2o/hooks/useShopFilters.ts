import { useCallback, useMemo } from 'react';

import { useDebounce, useQueryParams } from '@/shared/hooks';

import { ALL_FILTER, O2O_PAGE_SIZE, SHOP_STATUSES } from '../constants/o2o.constants';
import type { AdminShopsParams } from '../types/o2o.types';
import { oneOf, validId } from '../utils/filter.utils';

/**
 * Bộ lọc tab "Tiệm in" — trên URL: tìm `?q=` (server), trạng thái duyệt `?status=`, trang, và ngăn kéo `?shopId=`.
 * Giá trị URL lạ bị bỏ; đổi bộ lọc → về trang 1.
 */
export function useShopFilters() {
  const qp = useQueryParams({ searchKey: 'q' });
  const { getParam, updateParams, page } = qp;

  const status = oneOf(getParam('status'), SHOP_STATUSES);
  const debouncedSearch = useDebounce(qp.search.trim(), 300);
  const shopId = validId(getParam('shopId')) ?? null;

  const params = useMemo<AdminShopsParams>(
    () => ({
      page,
      limit: O2O_PAGE_SIZE,
      ...(debouncedSearch && { q: debouncedSearch }),
      ...(status && { status }),
    }),
    [page, debouncedSearch, status],
  );

  const setStatus = useCallback(
    (value: string) => updateParams({ status: value === ALL_FILTER ? null : value, page: null }),
    [updateParams],
  );

  const clear = useCallback(
    () => updateParams({ q: null, status: null, page: null }),
    [updateParams],
  );

  return {
    params,
    search: qp.search,
    debouncedSearch,
    status: status ?? ALL_FILTER,
    hasActiveFilter: Boolean(debouncedSearch || status),
    shopId,
    openShop: (id: string | null) => updateParams({ shopId: id }),
    page,
    setPage: qp.setPage,
    setSearch: qp.setSearch,
    setStatus,
    clear,
  };
}
