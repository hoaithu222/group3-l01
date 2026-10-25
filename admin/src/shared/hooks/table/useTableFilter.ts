import { useCallback, useMemo, useState } from 'react';

import { DEFAULT_PAGE_SIZE } from '@/shared/constants/consts';

import { useDebounce } from '../input/useDebounce';

interface UseTableFilterOptions<TFilters extends Record<string, unknown>> {
  defaultFilters: TFilters;
  defaultPageSize?: number;
  /** Milliseconds to debounce the `search` field (default: 300). */
  debounceMs?: number;
}

/**
 * Standard hook for server-side paginated tables.
 *
 * - `search` is debounced — prevents API flood on every keystroke.
 * - All other `filters` fire immediately — dropdowns / selects are deliberate actions.
 * - Page auto-resets to 1 on any filter / search / pageSize change.
 * - `queryParams` is ready to spread into React Query queryKey & queryFn.
 *
 * @example
 * ```tsx
 * const DEFAULT_FILTERS = { status: 'all' } as const;
 *
 * const { search, setSearch, filters, setFilter, queryParams, page, pageSize, setPage, setPageSize } =
 *   useTableFilter({ defaultFilters: DEFAULT_FILTERS });
 *
 * const { data } = useMyList(queryParams); // { status, search, page, pageSize }
 *
 * <Input value={search} onChange={(e) => setSearch(e.target.value)} />
 * <Dropdown value={filters.status} onChange={(v) => setFilter('status', v)} options={STATUS_OPTIONS} />
 * <Table ... currentPage={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
 * ```
 */
export function useTableFilter<TFilters extends Record<string, unknown>>({
  defaultFilters,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  debounceMs = 300,
}: UseTableFilterOptions<TFilters>) {
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [search, setSearchState] = useState('');
  const [filters, setFiltersState] = useState<TFilters>(defaultFilters);

  const debouncedSearch = useDebounce(search, debounceMs);

  const setPage = useCallback((p: number) => setPageState(p), []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPageState(1);
  }, []);

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPageState(1);
  }, []);

  const setFilter = useCallback(<K extends keyof TFilters>(key: K, value: TFilters[K]) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
    setPageState(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(defaultFilters);
    setSearchState('');
    setPageState(1);
    setPageSizeState(defaultPageSize);
  }, [defaultFilters, defaultPageSize]);

  const hasActiveFilters = useMemo(
    () =>
      search !== '' ||
      Object.keys(filters).some((k) => filters[k] !== defaultFilters[k as keyof TFilters]),
    [search, filters, defaultFilters],
  );

  const queryParams = useMemo(
    () => ({ ...filters, search: debouncedSearch, page, pageSize }),
    [filters, debouncedSearch, page, pageSize],
  );

  return {
    page,
    pageSize,
    setPage,
    setPageSize,
    search,
    setSearch,
    filters,
    setFilter,
    resetFilters,
    hasActiveFilters,
    queryParams,
  };
}
