import { useMemo, useState } from 'react';

import type { MeetingRangeParams } from '../api/meetings.types';
import { monthGridStart, monthWeekCount } from '../utils/meeting-month.utils';
import { addDays, startOfWeek } from '../utils/meeting-time.utils';
import type { CalendarFilters } from './useCalendarFilters';

/** Cửa sổ tải quanh tuần đang xem: `[đầu tuần − 7 ngày, cuối tuần + 21 ngày]` = 35 ngày ≤ `rangeMaxDays` 62 (README p2-04 §4.1). */
const DAYS_BEFORE = 7;
const DAYS_AFTER = 28; // 7 ngày của tuần + 21 ngày sau

/** `week` = điện thoại (dải tuần + agenda); `month` = máy tính bảng (lưới tháng + agenda ngày chọn). */
export type CalendarView = 'month' | 'week';

export interface CalendarRange {
  /** Ngày đang chọn (giờ máy). */
  selected: Date;
  setSelected: (date: Date) => void;
  params: MeetingRangeParams;
  weekStart: Date;
}

/**
 * Trạng thái ngày chọn + tham số cửa sổ tải. Tham số ổn định (đổi tuần/tháng mới đổi khoá) nên chọn ngày trong cùng cửa sổ không
 * refetch. Tuần: cửa sổ trượt 35 ngày quanh tuần — tuần kế đã nằm sẵn (prefetch tự nhiên). Tháng: đúng các ô của lưới (28–42 ngày
 * ≤ `rangeMaxDays` 62), theo tháng chứa ngày chọn — chuyển tháng là đổi `selected` nên cả lưới lẫn khoá cache cùng đổi.
 */
export function useCalendarRange(
  filters: CalendarFilters,
  view: CalendarView = 'week',
): CalendarRange {
  const [selected, setSelected] = useState(() => new Date());
  const weekStart = useMemo(() => startOfWeek(selected), [selected]);
  const anchorTime = view === 'month' ? monthGridStart(selected).getTime() : weekStart.getTime();
  const weeks = view === 'month' ? monthWeekCount(selected) : 0;

  const params = useMemo<MeetingRangeParams>(() => {
    const anchor = new Date(anchorTime);
    const from = view === 'month' ? anchor : addDays(anchor, -DAYS_BEFORE);
    const to = addDays(anchor, view === 'month' ? weeks * 7 : DAYS_AFTER);
    return {
      from: from.toISOString(),
      scope: filters.scope,
      status: filters.statuses.length > 0 ? filters.statuses : undefined,
      to: to.toISOString(),
      workspaceId: filters.workspaceId || undefined,
    };
  }, [anchorTime, view, weeks, filters.scope, filters.statuses, filters.workspaceId]);

  return { params, selected, setSelected, weekStart };
}
