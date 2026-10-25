import { useCallback, useMemo } from 'react';

import { useDebounce, useImeSafeSearchInput, useQueryParams } from '@/shared/hooks';
import type { DateRange } from '@/shared/ui';
import { dayBoundaryIso, formatDate, URL_DATE_FORMAT, urlDateToDate } from '@/shared/utils/format';

import type { AdminWorkspaceRow, WorkspaceListParams } from '../types/workspace.types';

/** ObjectId 24 hex — `ownerId` sai định dạng thì bỏ (BE trả 400) thay vì gửi ở mỗi lần đổi URL. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

const DEFAULT_SORT = 'lastActivityAt';
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Bộ lọc danh bạ workspace — TOÀN BỘ sống trên URL (`useQueryParams`, `api-patterns.md`): tìm (`search`), trạng thái
 * (`status`), sắp xếp (`sort`), chủ sở hữu (`ownerId`), khoảng ngày tạo (`createdFrom`/`createdTo`, `YYYY-MM-DD`).
 * Đổi bộ lọc nào cũng về trang 1. `params` là bản ĐÃ chuẩn hoá để đưa thẳng vào `GET /admin/workspaces`: ngày đổi
 * thành mốc ISO đầu/cuối ngày (giờ máy người xem), `ownerId` chỉ có hiệu lực khi đúng ObjectId.
 */
export function useWorkspaceListFilters() {
  const qp = useQueryParams({ defaultPageSize: 20 });
  const { inputProps } = useImeSafeSearchInput(qp.search, qp.setSearch);
  const debouncedSearch = useDebounce(qp.search, SEARCH_DEBOUNCE_MS);

  const status = qp.getParam('status', 'all');
  const sort = qp.getParam('sort', DEFAULT_SORT);
  const ownerRaw = qp.getParam('ownerId').trim();
  const ownerId = OBJECT_ID.test(ownerRaw) ? ownerRaw : '';
  const createdFrom = qp.getParam('createdFrom');
  const createdTo = qp.getParam('createdTo');

  const params = useMemo<WorkspaceListParams>(
    () => ({
      q: debouncedSearch || undefined,
      status: status !== 'all' ? (status as AdminWorkspaceRow['status']) : undefined,
      ownerId: ownerId || undefined,
      createdFrom: dayBoundaryIso(createdFrom, 'start'),
      createdTo: dayBoundaryIso(createdTo, 'end'),
      sort: sort as NonNullable<WorkspaceListParams['sort']>,
      page: qp.page,
      limit: qp.pageSize,
    }),
    [debouncedSearch, status, ownerId, createdFrom, createdTo, sort, qp.page, qp.pageSize],
  );

  const range = useMemo<DateRange>(
    () => ({ from: urlDateToDate(createdFrom), to: urlDateToDate(createdTo) }),
    [createdFrom, createdTo],
  );

  const { setParam, updateParams } = qp;

  const setStatus = useCallback(
    (value: string) => setParam('status', value === 'all' ? null : value),
    [setParam],
  );
  const setSort = useCallback(
    (value: string) => setParam('sort', value === DEFAULT_SORT ? null : value),
    [setParam],
  );
  const setOwnerId = useCallback((value: string | null) => setParam('ownerId', value), [setParam]);
  const setRange = useCallback(
    (next: DateRange) =>
      updateParams({
        createdFrom: next.from ? formatDate(next.from, URL_DATE_FORMAT) : null,
        createdTo: next.to ? formatDate(next.to, URL_DATE_FORMAT) : null,
        page: null,
      }),
    [updateParams],
  );
  const clear = useCallback(
    () =>
      updateParams({
        search: null,
        status: null,
        ownerId: null,
        createdFrom: null,
        createdTo: null,
        page: null,
      }),
    [updateParams],
  );

  const hasActiveFilter = [qp.search, status !== 'all' ? status : '', ownerRaw, createdFrom, createdTo].some(
    Boolean,
  );

  return {
    qp,
    inputProps,
    params,
    values: { status, sort, ownerId, range },
    hasActiveFilter,
    setStatus,
    setSort,
    setOwnerId,
    setRange,
    clear,
  };
}
