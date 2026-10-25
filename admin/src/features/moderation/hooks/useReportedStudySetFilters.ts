import { useCallback, useMemo } from 'react';

import { useQueryParams } from '@/shared/hooks';

import { OBJECT_ID_PATTERN } from '../constants/moderation.constants';
import {
  DEFAULT_MIN_REPORTS,
  MIN_REPORTS_OPTIONS,
  REPORTED_SETS_PAGE_SIZE,
  REPORTED_SETS_URL,
  STUDY_ITEMS_PAGE_PARAM,
} from '../constants/study-set-moderation.constants';
import type {
  AdminReportedStudySetsParams,
  ReportedStudySetStatus,
} from '../types/study-set-moderation.types';

/** Ô lọc "tất cả" — `Dropdown`/`SegmentToggle` không nhận giá trị rỗng. */
export const ALL_STATUS = 'all';

/**
 * Bộ lọc tab `content` (bộ học bị báo cáo nhiều) — trạng thái, ngưỡng báo cáo, trang và bộ học đang mở trong ngăn kéo đều nằm trên URL
 * (`?tab=content&setStatus&minReports&setsPage&setId`). Khoá riêng, không dùng `status`/`page` của tab `reports` nên đổi tab không kéo
 * bộ lọc của tab kia sang. Giá trị URL lạ bị bỏ (rơi về mặc định) — KHÔNG gửi BE.
 */
export function useReportedStudySetFilters() {
  const qp = useQueryParams({ pageKey: REPORTED_SETS_URL.page, defaultPageSize: REPORTED_SETS_PAGE_SIZE });
  const { getParam, setParam, updateParams } = qp;

  const rawStatus = getParam(REPORTED_SETS_URL.status);
  const status: ReportedStudySetStatus | undefined =
    rawStatus === 'ACTIVE' || rawStatus === 'HIDDEN' ? rawStatus : undefined;
  const minReports =
    MIN_REPORTS_OPTIONS.find((n) => String(n) === getParam(REPORTED_SETS_URL.minReports)) ??
    DEFAULT_MIN_REPORTS;
  const rawSetId = getParam(REPORTED_SETS_URL.setId);
  const setId = OBJECT_ID_PATTERN.test(rawSetId) ? rawSetId : null;

  const params = useMemo<AdminReportedStudySetsParams>(
    () => ({
      page: qp.page,
      limit: REPORTED_SETS_PAGE_SIZE,
      minReports,
      ...(status && { status }),
    }),
    [qp.page, minReports, status],
  );

  const setStatus = useCallback(
    (value: string) => setParam(REPORTED_SETS_URL.status, value === ALL_STATUS ? null : value),
    [setParam],
  );
  const setMinReports = useCallback(
    (value: string) =>
      setParam(REPORTED_SETS_URL.minReports, Number(value) === DEFAULT_MIN_REPORTS ? null : value),
    [setParam],
  );
  const openSet = useCallback(
    (id: string) => updateParams({ [REPORTED_SETS_URL.setId]: id }),
    [updateParams],
  );
  /** Đóng ngăn kéo — xoá luôn trang bảng mục của bộ vừa xem. */
  const closeSet = useCallback(
    () => updateParams({ [REPORTED_SETS_URL.setId]: null, [STUDY_ITEMS_PAGE_PARAM]: null }),
    [updateParams],
  );

  return {
    params,
    page: qp.page,
    setPage: qp.setPage,
    values: { status: status ?? ALL_STATUS, minReports, setId },
    setStatus,
    setMinReports,
    openSet,
    closeSet,
  };
}
