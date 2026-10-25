import { useCallback, useMemo, useState } from 'react';

interface UsePaginationOptions {
  initialPage?: number;
  initialLimit?: number;
  total?: number;
}

export function usePagination(options?: UsePaginationOptions) {
  const [page, setPage] = useState(options?.initialPage ?? 1);
  const [limit, setLimitState] = useState(options?.initialLimit ?? 10);
  const [total, setTotal] = useState(options?.total ?? 0);

  const totalPages = useMemo(() => Math.ceil(total / limit) || 1, [total, limit]);
  const hasNext = useMemo(() => page < totalPages, [page, totalPages]);
  const hasPrev = useMemo(() => page > 1, [page]);

  const goTo = useCallback(
    (p: number) => setPage(Math.max(1, Math.min(p, totalPages))),
    [totalPages],
  );
  const next = useCallback(() => goTo(page + 1), [goTo, page]);
  const prev = useCallback(() => goTo(page - 1), [goTo, page]);
  const setLimit = useCallback((l: number) => {
    setLimitState(l);
    setPage(1);
  }, []);

  return { page, limit, total, totalPages, hasNext, hasPrev, goTo, next, prev, setLimit, setTotal };
}
