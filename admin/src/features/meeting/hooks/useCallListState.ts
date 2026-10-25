import { useMemo } from 'react';

import { useQueryParams } from '@/shared/hooks';
import type { DateRange, TableSortDir } from '@/shared/ui';
import { URL_DATE_FORMAT, formatDate, urlDateToDate } from '@/shared/utils/format';

import {
  CALL_END_REASON_OPTIONS,
  CALL_SORT_SPEC,
  CALL_STATUS_OPTIONS,
} from '../constants/call.constants';
import {
  MEETING_PAGE_SIZE,
  MEETING_PAGE_SIZE_OPTIONS,
  MEETING_URL_KEYS as K,
} from '../constants/meeting.constants';
import type { CallEndReasonValue, CallStatusValue } from '../types/call.types';
import { toCallListParams } from '../utils/call-ops.utils';
import { parseCsvValues } from '../utils/meeting-ops.utils';
import { nextSortValue, parseSort } from '../utils/sort.utils';

/** Khoá URL RIÊNG của tab cuộc gọi (ngoài các khoá dùng chung `status`, `workspaceId`, `from`, `to`, `sort`, `id`). */
const CALL_KEYS = {
  scopeType: 'scopeType',
  mode: 'mode',
  mediaKind: 'mediaKind',
  endReason: 'endReason',
  meeting: 'meetingId',
} as const;

const STATUS_ORDER = CALL_STATUS_OPTIONS.map((o) => o.value);
const END_REASON_ORDER = CALL_END_REASON_OPTIONS.map((o) => o.value);
const dateToUrl = (d: Date | null): string | null => (d ? formatDate(d, URL_DATE_FORMAT) : null);

/**
 * Trạng thái bảng cuộc gọi SỐNG TRÊN URL: `scopeType`, `mode`, `mediaKind`, `status` (CSV), `endReason` (CSV), `workspaceId`, `meetingId`, `from`,
 * `to`, `page`, `limit`, `sort`, `id` (ngăn kéo) — F5 giữ bộ lọc (OPC-09). KHÔNG có bộ lọc theo người (OPC-05). `meetingId` chỉ đến từ liên kết
 * "Xem cuộc gọi" của cuộc họp; có nó thì phạm vi tự là `MEETING` (BE từ chối `meetingId` kèm phạm vi khác).
 */
export function useCallListState() {
  const qp = useQueryParams({ pageSizeKey: K.pageSize, defaultPageSize: MEETING_PAGE_SIZE });
  const scopeType = qp.getParam(CALL_KEYS.scopeType);
  const mode = qp.getParam(CALL_KEYS.mode);
  const mediaKind = qp.getParam(CALL_KEYS.mediaKind);
  const statusParam = qp.getParam(K.status);
  const endReasonParam = qp.getParam(CALL_KEYS.endReason);
  const fromParam = qp.getParam(K.from);
  const toParam = qp.getParam(K.to);
  const sortParam = qp.getParam(K.sort);
  const workspaceId = qp.getParam(K.workspace);
  const meetingId = qp.getParam(CALL_KEYS.meeting);

  const statuses = useMemo(
    () => parseCsvValues<CallStatusValue>(statusParam, STATUS_ORDER),
    [statusParam],
  );
  const endReasons = useMemo(
    () => parseCsvValues<CallEndReasonValue>(endReasonParam, END_REASON_ORDER),
    [endReasonParam],
  );
  const range = useMemo<DateRange>(
    () => ({ from: urlDateToDate(fromParam), to: urlDateToDate(toParam) }),
    [fromParam, toParam],
  );
  const sort = parseSort(sortParam, CALL_SORT_SPEC);
  const limit = Math.min(qp.pageSize, Math.max(...MEETING_PAGE_SIZE_OPTIONS));

  const params = useMemo(
    () =>
      toCallListParams({
        page: qp.page,
        limit,
        workspaceId,
        meetingId,
        scopeType,
        mode,
        mediaKind,
        status: statusParam,
        endReason: endReasonParam,
        from: fromParam,
        to: toParam,
        sort: sortParam,
      }),
    [
      endReasonParam,
      fromParam,
      limit,
      meetingId,
      mediaKind,
      mode,
      qp.page,
      scopeType,
      sortParam,
      statusParam,
      toParam,
      workspaceId,
    ],
  );
  const filtered =
    !!scopeType ||
    !!mode ||
    !!mediaKind ||
    statuses.length > 0 ||
    endReasons.length > 0 ||
    !!workspaceId ||
    !!meetingId ||
    !!range.from ||
    !!range.to;

  const setOrClear = (key: string) => (next: string | null) => qp.setParam(key, next);

  return {
    page: qp.page,
    pageSize: limit,
    setPage: qp.setPage,
    setPageSize: qp.setPageSize,
    params,
    scopeType,
    mode,
    mediaKind,
    statuses,
    endReasons,
    workspaceId,
    meetingId,
    range,
    sort,
    filtered,
    /** Cuộc gọi đang mở ở ngăn kéo (`?id=`), `null` = đóng. */
    detailId: qp.getParam(K.detail) || null,
    setScopeType: setOrClear(CALL_KEYS.scopeType),
    setMode: setOrClear(CALL_KEYS.mode),
    setMediaKind: setOrClear(CALL_KEYS.mediaKind),
    setWorkspaceId: setOrClear(K.workspace),
    clearMeeting: () => qp.setParam(CALL_KEYS.meeting, null),
    setStatuses: (next: readonly CallStatusValue[]) =>
      qp.setParam(K.status, next.length > 0 ? next.join(',') : null),
    setEndReasons: (next: readonly CallEndReasonValue[]) =>
      qp.setParam(CALL_KEYS.endReason, next.length > 0 ? next.join(',') : null),
    setRange: (next: DateRange) =>
      qp.updateParams({ [K.from]: dateToUrl(next.from), [K.to]: dateToUrl(next.to), page: null }),
    /** Bỏ mọi bộ lọc nhưng GIỮ cách sắp xếp và ngăn kéo đang mở. */
    clearFilters: () =>
      qp.updateParams({
        [CALL_KEYS.scopeType]: null,
        [CALL_KEYS.mode]: null,
        [CALL_KEYS.mediaKind]: null,
        [K.status]: null,
        [CALL_KEYS.endReason]: null,
        [K.workspace]: null,
        [CALL_KEYS.meeting]: null,
        [K.from]: null,
        [K.to]: null,
        page: null,
      }),
    changeSort: (key: string | null, dir: TableSortDir | null) =>
      qp.setParam(K.sort, nextSortValue(sort, key, dir, CALL_SORT_SPEC)),
    openDetail: (id: string) => qp.updateParams({ [K.detail]: id }),
    closeDetail: () => qp.updateParams({ [K.detail]: null }),
  };
}
