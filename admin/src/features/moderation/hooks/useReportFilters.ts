import { useCallback, useMemo } from 'react';

import { useQueryParams } from '@/shared/hooks';
import type { DateRange } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import {
  DEFAULT_REPORT_SORT,
  DEFAULT_REPORT_STATUS,
  OBJECT_ID_PATTERN,
  REPORT_REASONS,
  REPORT_SORTS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  REPORT_URL_DATE_FORMAT,
} from '../constants/moderation.constants';
import type { AdminReportListParams } from '../types/moderation.types';
import { dayBoundaryIso, urlDateToDate } from '../utils/report-filter-dates';

/** Ô lọc "tất cả" — Radix Select không nhận giá trị rỗng. */
export const ALL_FILTER = 'all';

/** Giá trị URL ngoài danh sách cho phép (tab khác dùng chung khoá `status`…) → bỏ, KHÔNG gửi BE. */
function oneOf<T extends string>(raw: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

const FILTER_KEYS = ['status', 'targetType', 'reason', 'workspaceId', 'from', 'to'] as const;

export interface UseReportFiltersOptions {
  /** Workspace CỐ ĐỊNH (tab `reports` của workspace) — thắng `?workspaceId=` trên URL. */
  workspaceId?: string;
}

/**
 * Bộ lọc hàng đợi báo cáo — TOÀN BỘ sống trên URL (`useQueryParams`): copy link / F5 / back giữ
 * nguyên. Trả `params` ĐÃ chuẩn hoá để đưa thẳng vào `useAdminReports`: giá trị URL lạ bị bỏ
 * (trạng thái rơi về `OPEN`), ngày đổi thành mốc ISO đầu/cuối ngày.
 */
export function useReportFilters({ workspaceId: fixedWorkspaceId }: UseReportFiltersOptions = {}) {
  const qp = useQueryParams({ defaultPageSize: 20 });
  const { getParam, setParam, updateParams, page, pageSize } = qp;

  const status = oneOf(getParam('status'), REPORT_STATUSES) ?? DEFAULT_REPORT_STATUS;
  const targetType = oneOf(getParam('targetType'), REPORT_TARGET_TYPES);
  const reason = oneOf(getParam('reason'), REPORT_REASONS);
  const sort = oneOf(getParam('sort'), REPORT_SORTS) ?? DEFAULT_REPORT_SORT;
  const rawWorkspaceId = getParam('workspaceId');
  const urlWorkspaceId = OBJECT_ID_PATTERN.test(rawWorkspaceId) ? rawWorkspaceId : undefined;
  const from = getParam('from');
  const to = getParam('to');

  const params = useMemo<AdminReportListParams>(
    () => ({
      page,
      limit: pageSize,
      status,
      targetType,
      workspaceId: fixedWorkspaceId ?? urlWorkspaceId,
      reason,
      from: dayBoundaryIso(from, 'start'),
      to: dayBoundaryIso(to, 'end'),
      sort,
    }),
    [page, pageSize, status, targetType, fixedWorkspaceId, urlWorkspaceId, reason, from, to, sort],
  );

  const range = useMemo<DateRange>(
    () => ({ from: urlDateToDate(from), to: urlDateToDate(to) }),
    [from, to],
  );

  /** Đặt/xoá một khoá lọc: `all`/giá trị mặc định → xoá khỏi URL cho URL sạch. */
  const setFilter = useCallback(
    (key: string, value: string, fallback: string = ALL_FILTER) =>
      setParam(key, value === fallback ? null : value),
    [setParam],
  );

  const setStatus = useCallback(
    (v: string) => setFilter('status', v, DEFAULT_REPORT_STATUS),
    [setFilter],
  );
  const setTargetType = useCallback((v: string) => setFilter('targetType', v), [setFilter]);
  const setReason = useCallback((v: string) => setFilter('reason', v), [setFilter]);
  const setWorkspace = useCallback((v: string) => setFilter('workspaceId', v), [setFilter]);
  const setSort = useCallback(
    (v: string) => setFilter('sort', v, DEFAULT_REPORT_SORT),
    [setFilter],
  );

  const setRange = useCallback(
    (next: DateRange) =>
      updateParams({
        from: next.from ? formatDate(next.from, REPORT_URL_DATE_FORMAT) : null,
        to: next.to ? formatDate(next.to, REPORT_URL_DATE_FORMAT) : null,
        page: null,
      }),
    [updateParams],
  );

  const clear = useCallback(
    () => updateParams({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), page: null }),
    [updateParams],
  );

  const hasActiveFilter =
    status !== DEFAULT_REPORT_STATUS ||
    [targetType, reason, urlWorkspaceId, from, to].some(Boolean);

  return {
    params,
    values: { status, targetType, reason, workspaceId: urlWorkspaceId, sort, range },
    hasActiveFilter,
    page,
    pageSize,
    setPage: qp.setPage,
    setPageSize: qp.setPageSize,
    setStatus,
    setTargetType,
    setReason,
    setWorkspace,
    setSort,
    setRange,
    clear,
  };
}

export type ReportFilterState = ReturnType<typeof useReportFilters>;
