import { useCallback, useMemo } from 'react';

import { useDebounce, useQueryParams } from '@/shared/hooks';
import type { DateRange } from '@/shared/ui';
import { endOfDay, formatDate, parseDate, startOfDay, toISOString } from '@/shared/utils/format';

import {
  AUDIT_FILTER_KEYS,
  AUDIT_URL_DATE_FORMAT,
  OBJECT_ID_PATTERN,
} from '../constants/audit-log.constants';
import type { AuditLogFilters } from '../types/audit-log.types';

/** Độ trễ trước khi ô nhập ID bắn query — cùng nhịp với ô tìm kiếm của các trang khác. */
const TEXT_DEBOUNCE_MS = 300;

/** Ngày `YYYY-MM-DD` trong URL → mốc ISO đầu/cuối ngày (giờ máy người xem); sai định dạng → bỏ. */
function dayBoundaryIso(value: string, edge: 'start' | 'end'): string | undefined {
  if (!value) return undefined;
  const day = parseDate(value);
  if (!day.isValid()) return undefined;
  return toISOString(edge === 'start' ? startOfDay(day) : endOfDay(day));
}

function urlDateToDate(value: string): Date | null {
  const day = value ? parseDate(value) : null;
  return day?.isValid() ? day.toDate() : null;
}

/**
 * Bộ lọc nhật ký — TOÀN BỘ sống trên URL (`useQueryParams`), nên copy link / F5 / back giữ
 * nguyên. Phân trang là cursor nên `resetPageOnChange: false` (không có `page` để reset,
 * và khỏi rác `?page=1` lên URL).
 *
 * Trả `filters` là bản ĐÃ chuẩn hoá để đưa thẳng vào query: ô ID chỉ có hiệu lực khi
 * đúng ObjectId (BE trả 400 với id sai — không nên bắn request ở mỗi phím gõ dở), ngày
 * đổi thành mốc ISO đầu/cuối ngày.
 */
export function useAuditLogFilters() {
  const qp = useQueryParams({ resetPageOnChange: false });

  const actorId = qp.getParam('actorId').trim();
  const actionRaw = qp.getParam('action');
  const targetType = qp.getParam('targetType');
  const targetId = qp.getParam('targetId').trim();
  const workspaceId = qp.getParam('workspaceId').trim();
  const from = qp.getParam('from');
  const to = qp.getParam('to');
  const focusActor = qp.getParam('focus') === 'actor';

  const actions = useMemo(
    () =>
      actionRaw
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    [actionRaw],
  );

  const debouncedActorId = useDebounce(actorId, TEXT_DEBOUNCE_MS);
  const debouncedTargetId = useDebounce(targetId, TEXT_DEBOUNCE_MS);
  const debouncedWorkspaceId = useDebounce(workspaceId, TEXT_DEBOUNCE_MS);

  const filters = useMemo<AuditLogFilters>(
    () => ({
      actorId: OBJECT_ID_PATTERN.test(debouncedActorId) ? debouncedActorId : undefined,
      action: actions.length > 0 ? actions : undefined,
      targetType: targetType || undefined,
      targetId: debouncedTargetId || undefined,
      workspaceId: OBJECT_ID_PATTERN.test(debouncedWorkspaceId) ? debouncedWorkspaceId : undefined,
      from: dayBoundaryIso(from, 'start'),
      to: dayBoundaryIso(to, 'end'),
    }),
    [debouncedActorId, actions, targetType, debouncedTargetId, debouncedWorkspaceId, from, to],
  );

  const range = useMemo<DateRange>(
    () => ({ from: urlDateToDate(from), to: urlDateToDate(to) }),
    [from, to],
  );

  const { setParam, updateParams } = qp;

  const setRange = useCallback(
    (next: DateRange) =>
      updateParams({
        from: next.from ? formatDate(next.from, AUDIT_URL_DATE_FORMAT) : null,
        to: next.to ? formatDate(next.to, AUDIT_URL_DATE_FORMAT) : null,
      }),
    [updateParams],
  );

  const setActions = useCallback(
    (next: string[]) => setParam('action', next.length > 0 ? next.join(',') : null),
    [setParam],
  );

  /** Ô ID: rỗng/khoảng trắng → xoá key khỏi URL. */
  const setText = useCallback(
    (key: 'actorId' | 'targetId' | 'workspaceId', value: string) =>
      setParam(key, value.trim() || null),
    [setParam],
  );

  const setTargetType = useCallback(
    (value: string) => setParam('targetType', value === 'all' ? null : value),
    [setParam],
  );

  const clear = useCallback(
    () => updateParams(Object.fromEntries(AUDIT_FILTER_KEYS.map((k) => [k, null]))),
    [updateParams],
  );

  /** Bỏ `?focus=` sau khi đã focus xong để F5 không focus lại. */
  const consumeFocus = useCallback(() => setParam('focus', null), [setParam]);

  const hasActiveFilter = [actorId, actionRaw, targetType, targetId, workspaceId, from, to].some(
    Boolean,
  );

  return {
    values: { actorId, actions, targetType, targetId, workspaceId, range },
    invalid: {
      actorId: actorId !== '' && !OBJECT_ID_PATTERN.test(actorId),
      workspaceId: workspaceId !== '' && !OBJECT_ID_PATTERN.test(workspaceId),
    },
    filters,
    hasActiveFilter,
    focusActor,
    setText,
    setActions,
    setTargetType,
    setRange,
    clear,
    consumeFocus,
  };
}

export type AuditLogFilterState = ReturnType<typeof useAuditLogFilters>;
