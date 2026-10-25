import { useMemo } from 'react';

import { useMeetingsRange } from '../queries/meetings.queries';
import { countByDay } from '../utils/meeting-month.utils';
import { groupByDay, toDayKey } from '../utils/meeting-time.utils';
import { useCalendarFilters } from './useCalendarFilters';
import { type CalendarView, useCalendarRange } from './useCalendarRange';

/**
 * Dữ liệu của màn Lịch họp: bộ lọc (lưu theo tài khoản) + ngày chọn/cửa sổ tải + danh sách nhóm theo ngày. Điện thoại (`week`) hiện
 * MỌI nhóm trong cửa sổ và cuộn tới ngày chọn; máy tính bảng (`month`) chỉ hiện nhóm của NGÀY CHỌN ở cột agenda (`paneGroups`).
 * `state` gộp tải/lỗi/rỗng để màn khỏi tự suy: lỗi CHỈ khi chưa có dữ liệu nào (có cache cũ thì vẫn hiện, kèm làm mới nền).
 */
export function useMeetingsCalendar(view: CalendarView) {
  const [filters, setFilters] = useCalendarFilters();
  const range = useCalendarRange(filters, view);
  const meetings = useMeetingsRange(range.params);

  const items = meetings.data;
  const groups = useMemo(() => groupByDay(items ?? []), [items]);
  const counts = useMemo(() => countByDay(items ?? []), [items]);
  const busyDays = useMemo(() => new Set(groups.map((group) => group.dayKey)), [groups]);
  const selectedKey = toDayKey(range.selected);
  const paneGroups = useMemo(
    () => (view === 'month' ? groups.filter((group) => group.dayKey === selectedKey) : groups),
    [groups, selectedKey, view],
  );

  let state: 'empty' | 'error' | 'loading' | 'ready' = 'ready';
  if (meetings.isError && !items) state = 'error';
  else if (meetings.isPending) state = 'loading';
  else if (paneGroups.length === 0) state = 'empty';

  return { busyDays, counts, filters, meetings, paneGroups, range, selectedKey, setFilters, state };
}
