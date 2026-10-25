import { useMemo } from 'react';

import { useQueryParams } from '@/shared/hooks';
import type { DateRange, TableSortDir } from '@/shared/ui';

import {
  RECORDING_PAGE_SIZE,
  RECORDING_URL_KEYS as K,
} from '../constants/workspace-recordings.constants';
import type { RecordingStatusValue } from '../types/workspace-recordings.types';
import { dateToUrl, urlDateToDate } from '../utils/workspace-meetings.utils';
import {
  nextRecordingSort,
  parseRecordingSort,
  parseRecordingStatuses,
  toRecordingListParams,
} from '../utils/workspace-recordings.utils';

/**
 * Trạng thái danh sách bản ghi hình SỐNG TRÊN URL (api-patterns.md: filter/sắp xếp/trang/ngăn kéo không dùng `useState`): đọc các khoá `rec*` (xem
 * `RECORDING_URL_KEYS`, riêng để không dính bộ lọc của tab khác cùng trang), dựng tham số gọi API đã kiểm giá trị, và trả các hàm đổi trạng thái.
 * Đổi bộ lọc/sắp xếp tự đưa về trang 1 (`useQueryParams`); mở/đóng ngăn kéo thì KHÔNG đụng trang.
 *
 * `workspaceId` / `meetingId` là PHẠM VI do nơi nhúng tab quyết định (trang workspace, hoặc tab "Ghi hình" của `/meeting` — `?workspaceId=`, `?meetingId=`),
 * không phải bộ lọc `rec*` của riêng bảng nên KHÔNG tính vào `filtered` và `clearFilters` không đụng tới.
 */
export function useRecordingListState(workspaceId?: string, meetingId?: string) {
  const qp = useQueryParams({
    pageKey: K.page,
    pageSizeKey: K.pageSize,
    defaultPageSize: RECORDING_PAGE_SIZE,
  });
  const statusParam = qp.getParam(K.status);
  const fromParam = qp.getParam(K.from);
  const toParam = qp.getParam(K.to);
  const sortParam = qp.getParam(K.sort);
  const expiring = qp.getParam(K.expiring) === '1';
  const includeDeleted = qp.getParam(K.deleted) === '1';

  const statuses = useMemo(() => parseRecordingStatuses(statusParam), [statusParam]);
  const range = useMemo<DateRange>(
    () => ({ from: urlDateToDate(fromParam), to: urlDateToDate(toParam) }),
    [fromParam, toParam],
  );
  const sort = parseRecordingSort(sortParam);
  const filtered = statuses.length > 0 || !!range.from || !!range.to || expiring || includeDeleted;

  const params = useMemo(
    () =>
      toRecordingListParams({
        page: qp.page,
        limit: qp.pageSize,
        workspaceId,
        meetingId,
        status: statusParam,
        from: fromParam,
        to: toParam,
        sort: sortParam,
        expiring,
        includeDeleted,
      }),
    [
      expiring,
      fromParam,
      includeDeleted,
      qp.page,
      qp.pageSize,
      sortParam,
      statusParam,
      toParam,
      workspaceId,
      meetingId,
    ],
  );

  return {
    page: qp.page,
    pageSize: qp.pageSize,
    setPage: qp.setPage,
    setPageSize: qp.setPageSize,
    params,
    statuses,
    range,
    sort,
    expiring,
    includeDeleted,
    filtered,
    /** Bản ghi đang mở ở ngăn kéo (`?recId=`), `null` = đóng. */
    detailId: qp.getParam(K.detail) || null,
    setStatuses: (next: readonly RecordingStatusValue[]) =>
      qp.setParam(K.status, next.length > 0 ? next.join(',') : null),
    setRange: (next: DateRange) =>
      qp.updateParams({
        [K.from]: dateToUrl(next.from),
        [K.to]: dateToUrl(next.to),
        [K.page]: null,
      }),
    setExpiring: (next: boolean) => qp.setParam(K.expiring, next ? '1' : null),
    setIncludeDeleted: (next: boolean) => qp.setParam(K.deleted, next ? '1' : null),
    /** Bỏ mọi bộ lọc nhưng GIỮ cách sắp xếp và ngăn kéo đang mở. */
    clearFilters: () =>
      qp.updateParams({
        [K.status]: null,
        [K.from]: null,
        [K.to]: null,
        [K.expiring]: null,
        [K.deleted]: null,
        [K.page]: null,
      }),
    showFailed: () => qp.setParam(K.status, 'FAILED'),
    showExpiring: () => qp.setParam(K.expiring, '1'),
    changeSort: (key: string | null, dir: TableSortDir | null) =>
      qp.setParam(K.sort, nextRecordingSort(sort, key, dir)),
    openDetail: (id: string) => qp.updateParams({ [K.detail]: id }),
    closeDetail: () => qp.updateParams({ [K.detail]: null }),
  };
}
