import { useCallback, useEffect, useState } from 'react';

import { readJson, writeJson } from '@/core/storage';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { MeetingStatus, RangeScope } from '../api/meetings.types';

export interface CalendarFilters {
  scope: RangeScope;
  /** Rỗng = mọi trạng thái. */
  statuses: MeetingStatus[];
  /** Rỗng = mọi nhóm. */
  workspaceId: string;
}

export const DEFAULT_FILTERS: CalendarFilters = { scope: 'MINE', statuses: [], workspaceId: '' };

/** Bộ lọc có khác mặc định không — để nút lọc trên AppBar báo "đang lọc" (thiếu cuộc họp trong lịch là do lọc, không phải mất dữ liệu). */
export function isFiltered(filters: CalendarFilters): boolean {
  return (
    filters.scope !== DEFAULT_FILTERS.scope ||
    filters.statuses.length > 0 ||
    filters.workspaceId !== DEFAULT_FILTERS.workspaceId
  );
}

const keyOf = (userId: string): string => `calendar:filters:${userId}`;

/**
 * Bộ lọc lịch — lưu `AsyncStorage` theo TÀI KHOẢN (`calendar:filters:<userId>`), không nhạy cảm (README p2-04 §5). Đọc lúc mở tab;
 * thiếu/hỏng ⇒ mặc định. Khoá theo user nên người đăng nhập sau trên cùng máy không thừa hưởng bộ lọc của người trước.
 */
export function useCalendarFilters(): [CalendarFilters, (next: CalendarFilters) => void] {
  const userId = useAuthStore((state) => state.user?.id);
  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    void readJson<CalendarFilters>(keyOf(userId)).then((saved) => {
      if (alive && saved) setFilters({ ...DEFAULT_FILTERS, ...saved });
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const update = useCallback(
    (next: CalendarFilters) => {
      setFilters(next);
      if (userId) void writeJson(keyOf(userId), next);
    },
    [userId],
  );

  return [filters, update];
}
