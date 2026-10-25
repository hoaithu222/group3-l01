import { useCallback, useMemo } from 'react';

import { useDebounce, useQueryParams } from '@/shared/hooks';

import {
  ALL_FILTER,
  AMENITY_CODES,
  LOCATION_STATUSES,
  LOCATION_TYPES,
  O2O_PAGE_SIZE,
} from '../constants/o2o.constants';
import type { AdminLocationsParams } from '../types/o2o.types';
import { oneOf, validId } from '../utils/filter.utils';

/** Khoá URL của tab Địa điểm — `O2oPage` xoá chúng khi đổi tab để bộ lọc/trang của tab này không rò sang tab khác. */
const FILTER_KEYS = ['q', 'type', 'status', 'amenity'] as const;

/**
 * Bộ lọc tab "Địa điểm" — TOÀN BỘ trên URL (`useQueryParams`): copy link / F5 / back giữ nguyên. Tìm `?q=` lọc phía SERVER
 * (debounce 300 ms); giá trị URL lạ bị bỏ; đổi bộ lọc → về trang 1. `locationId` (ngăn kéo chi tiết) cũng sống trên URL.
 */
export function useLocationFilters() {
  const qp = useQueryParams({ searchKey: 'q' });
  const { getParam, updateParams, page } = qp;

  const type = oneOf(getParam('type'), LOCATION_TYPES);
  const status = oneOf(getParam('status'), LOCATION_STATUSES);
  const amenity = oneOf(getParam('amenity'), AMENITY_CODES);
  const debouncedSearch = useDebounce(qp.search.trim(), 300);
  const locationId = validId(getParam('locationId')) ?? null;

  const params = useMemo<AdminLocationsParams>(
    () => ({
      page,
      limit: O2O_PAGE_SIZE,
      ...(debouncedSearch && { q: debouncedSearch }),
      ...(type && { type }),
      ...(status && { status }),
      ...(amenity && { amenity }),
    }),
    [page, debouncedSearch, type, status, amenity],
  );

  const setFilter = useCallback(
    (key: 'type' | 'status' | 'amenity', value: string) =>
      updateParams({ [key]: value === ALL_FILTER ? null : value, page: null }),
    [updateParams],
  );

  const clear = useCallback(
    () => updateParams({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), page: null }),
    [updateParams],
  );

  return {
    params,
    search: qp.search,
    debouncedSearch,
    values: {
      type: type ?? ALL_FILTER,
      status: status ?? ALL_FILTER,
      amenity: amenity ?? ALL_FILTER,
    },
    hasActiveFilter: Boolean(debouncedSearch || type || status || amenity),
    locationId,
    openLocation: (id: string | null) => updateParams({ locationId: id }),
    page,
    setPage: qp.setPage,
    setSearch: qp.setSearch,
    setFilter,
    clear,
  };
}
