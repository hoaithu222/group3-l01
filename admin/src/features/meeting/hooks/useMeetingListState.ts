import { useMemo } from 'react';

import { useDebounce, useQueryParams } from '@/shared/hooks';
import type { DateRange, TableSortDir } from '@/shared/ui';
import { URL_DATE_FORMAT, formatDate, urlDateToDate } from '@/shared/utils/format';

import {
  MEETING_PAGE_SIZE,
  MEETING_PAGE_SIZE_OPTIONS,
  MEETING_SORT_SPEC,
  MEETING_STATUS_OPTIONS,
  MEETING_URL_KEYS as K,
} from '../constants/meeting.constants';
import type { MeetingPlatformValue, MeetingStatusValue } from '../types/meeting.types';
import { parseCsvValues, parsePlatform, toMeetingListParams } from '../utils/meeting-ops.utils';
import { nextSortValue, parseSort } from '../utils/sort.utils';

const STATUS_ORDER = MEETING_STATUS_OPTIONS.map((o) => o.value);
const dateToUrl = (d: Date | null): string | null => (d ? formatDate(d, URL_DATE_FORMAT) : null);

/**
 * Trạng thái bảng cuộc họp SỐNG TRÊN URL (api-patterns.md): `q`, `status` (CSV), `workspaceId`, `platform`, `from`, `to`, `page`, `limit`, `sort`,
 * `id` (ngăn kéo — F5 giữ ngăn kéo). Dựng tham số gọi API đã kiểm giá trị và trả các hàm đổi trạng thái; đổi bộ lọc/sắp xếp tự về trang 1,
 * mở/đóng ngăn kéo thì KHÔNG đụng trang. Ô tìm kiếm debounce 300 ms (nguồn = URL; ô nhập uncontrolled IME-safe ở `MeetingFilters`).
 */
export function useMeetingListState() {
  const qp = useQueryParams({
    searchKey: K.search,
    pageSizeKey: K.pageSize,
    defaultPageSize: MEETING_PAGE_SIZE,
  });
  const statusParam = qp.getParam(K.status);
  const platformParam = qp.getParam(K.platform);
  const fromParam = qp.getParam(K.from);
  const toParam = qp.getParam(K.to);
  const sortParam = qp.getParam(K.sort);
  const workspaceId = qp.getParam(K.workspace);
  const debouncedSearch = useDebounce(qp.search, 300);

  const statuses = useMemo(
    () => parseCsvValues<MeetingStatusValue>(statusParam, STATUS_ORDER),
    [statusParam],
  );
  const platform = parsePlatform(platformParam);
  const range = useMemo<DateRange>(
    () => ({ from: urlDateToDate(fromParam), to: urlDateToDate(toParam) }),
    [fromParam, toParam],
  );
  const sort = parseSort(sortParam, MEETING_SORT_SPEC);
  const limit = Math.min(qp.pageSize, Math.max(...MEETING_PAGE_SIZE_OPTIONS));
  const filtered =
    !!qp.search.trim() ||
    statuses.length > 0 ||
    !!platform ||
    !!workspaceId ||
    !!range.from ||
    !!range.to;

  const params = useMemo(
    () =>
      toMeetingListParams({
        page: qp.page,
        limit,
        q: debouncedSearch,
        workspaceId,
        status: statusParam,
        platform: platformParam,
        from: fromParam,
        to: toParam,
        sort: sortParam,
      }),
    [
      debouncedSearch,
      fromParam,
      limit,
      platformParam,
      qp.page,
      sortParam,
      statusParam,
      toParam,
      workspaceId,
    ],
  );

  return {
    page: qp.page,
    pageSize: limit,
    setPage: qp.setPage,
    setPageSize: qp.setPageSize,
    search: qp.search,
    setSearch: qp.setSearch,
    params,
    statuses,
    platform,
    workspaceId,
    range,
    sort,
    filtered,
    /** Cuộc họp đang mở ở ngăn kéo (`?id=`), `null` = đóng. */
    detailId: qp.getParam(K.detail) || null,
    setStatuses: (next: readonly MeetingStatusValue[]) =>
      qp.setParam(K.status, next.length > 0 ? next.join(',') : null),
    setPlatform: (next: MeetingPlatformValue | null) => qp.setParam(K.platform, next),
    setWorkspaceId: (next: string | null) => qp.setParam(K.workspace, next),
    setRange: (next: DateRange) =>
      qp.updateParams({ [K.from]: dateToUrl(next.from), [K.to]: dateToUrl(next.to), page: null }),
    /** Bỏ mọi bộ lọc nhưng GIỮ cách sắp xếp và ngăn kéo đang mở. */
    clearFilters: () =>
      qp.updateParams({
        [K.search]: null,
        [K.status]: null,
        [K.platform]: null,
        [K.workspace]: null,
        [K.from]: null,
        [K.to]: null,
        page: null,
      }),
    changeSort: (key: string | null, dir: TableSortDir | null) =>
      qp.setParam(K.sort, nextSortValue(sort, key, dir, MEETING_SORT_SPEC)),
    openDetail: (id: string) => qp.updateParams({ [K.detail]: id }),
    closeDetail: () => qp.updateParams({ [K.detail]: null }),
  };
}
