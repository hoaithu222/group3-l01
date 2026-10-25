import { useCallback, useMemo } from 'react';

import { useDebounce, useQueryParams } from '@/shared/hooks';

import {
  COMPANIES_PAGE_SIZE,
  COMPANY_STATUSES,
  COMPANY_TIERS,
  STATUS_FILTER_ALL,
} from '../constants/recruiter.constants';
import { usePendingCompaniesCount } from '../service/recruiter.queries';
import type { CompanyStatus, CompanyTier } from '../types/company.types';
import type { AdminCompaniesParams } from '../types/recruiter.types';

/** Giá trị URL ngoài danh sách cho phép → bỏ, KHÔNG gửi BE (BE trả 400 với enum lạ). */
function oneOf<T extends string>(raw: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/**
 * Bộ lọc danh sách doanh nghiệp — TOÀN BỘ sống trên URL (`useQueryParams`): copy link / F5 / back giữ nguyên.
 * `?q=` tìm theo tên (IME-safe ở ô nhập, debounce 300 ms, lọc SERVER); `?status=` một trạng thái hoặc `all`; `?tier=`.
 *
 * Trạng thái MẶC ĐỊNH ("Chờ duyệt khi có", admin.md §2.1): URL chưa chọn gì thì hỏi trước số doanh nghiệp chờ duyệt (`limit=1`) —
 * có thì lọc "Chờ duyệt", không thì hiện tất cả. Chọn "Tất cả" ghi `status=all` tường minh để KHÔNG bị kéo về "Chờ duyệt" lần sau.
 * `ready = false` trong lúc chờ câu hỏi đó → trang chưa gọi danh sách (tránh một lượt gọi "tất cả" rồi lại gọi "chờ duyệt").
 */
export function useCompanyFilters() {
  const qp = useQueryParams({ searchKey: 'q', defaultPageSize: COMPANIES_PAGE_SIZE });
  const debouncedSearch = useDebounce(qp.search.trim(), 300);

  const statusRaw = qp.getParam('status');
  const explicitStatus = statusRaw === STATUS_FILTER_ALL || oneOf(statusRaw, COMPANY_STATUSES);
  const pending = usePendingCompaniesCount(!explicitStatus);
  const ready = !!explicitStatus || !pending.isPending;

  let status: CompanyStatus | undefined;
  if (statusRaw === STATUS_FILTER_ALL) status = undefined;
  else if (explicitStatus) status = statusRaw as CompanyStatus;
  else status = (pending.data ?? 0) > 0 ? 'PENDING' : undefined;

  const tier: CompanyTier | undefined = oneOf(qp.getParam('tier'), COMPANY_TIERS);

  const params = useMemo<AdminCompaniesParams>(
    () => ({
      page: qp.page,
      limit: qp.pageSize,
      ...(status && { status }),
      ...(tier && { tier }),
      ...(debouncedSearch && { q: debouncedSearch }),
    }),
    [debouncedSearch, qp.page, qp.pageSize, status, tier],
  );

  const { setParam } = qp;
  const setStatus = useCallback((v: string) => setParam('status', v), [setParam]);
  const setTier = useCallback(
    (v: string) => setParam('tier', v === STATUS_FILTER_ALL ? null : v),
    [setParam],
  );

  return {
    params,
    ready,
    search: qp.search,
    setSearch: qp.setSearch,
    /** Trạng thái đang áp (`undefined` = tất cả). */
    status,
    /** Giá trị hiện ở ô "Trạng thái": trạng thái đang áp hoặc `all`. */
    statusValue: status ?? STATUS_FILTER_ALL,
    tierValue: tier ?? STATUS_FILTER_ALL,
    hasActiveFilter: !!status || !!tier || debouncedSearch !== '',
    debouncedSearch,
    page: qp.page,
    pageSize: qp.pageSize,
    setPage: qp.setPage,
    setPageSize: qp.setPageSize,
    setStatus,
    setTier,
    getParam: qp.getParam,
    updateParams: qp.updateParams,
    searchParams: qp.searchParams,
  };
}
