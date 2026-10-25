import { useCallback, useMemo } from 'react';

import { useQueryParams } from '@/shared/hooks';
import type { DateRange } from '@/shared/ui';
import { endOfDay, formatDate, parseDate, startOfDay, toISOString } from '@/shared/utils/format';

import {
  ALL_FILTER,
  EVENTS_PAGE_SIZE,
  WEBHOOK_PROVIDERS,
  WEBHOOK_STATUSES,
} from '../constants/integration.labels';
import type {
  AdminEventsParams,
  WebhookEventStatus,
  WebhookProvider,
} from '../types/integration.types';

const URL_DATE_FORMAT = 'YYYY-MM-DD';
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const FILTER_KEYS = ['provider', 'status', 'workspaceId', 'workspaceName', 'from', 'to'] as const;

function oneOf<T extends string>(raw: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

function dayIso(value: string, edge: 'start' | 'end'): string | undefined {
  if (!value) return undefined;
  const day = parseDate(value);
  if (!day.isValid()) return undefined;
  return toISOString(edge === 'start' ? startOfDay(day) : endOfDay(day));
}

function toDate(value: string): Date | null {
  const day = value ? parseDate(value) : null;
  return day?.isValid() ? day.toDate() : null;
}

/**
 * Bộ lọc tab "Sự kiện webhook" — TOÀN BỘ trên URL (`useQueryParams`): copy link / F5 / back giữ nguyên. Giá trị URL lạ bị bỏ (không gửi BE);
 * ngày `YYYY-MM-DD` đổi thành mốc ISO đầu/cuối ngày; đổi bộ lọc → về trang 1. `eventId` (ngăn kéo) cũng sống trên URL.
 */
export function useEventFilters() {
  const qp = useQueryParams();
  const { getParam, updateParams, page } = qp;

  const provider = oneOf<WebhookProvider>(getParam('provider'), WEBHOOK_PROVIDERS);
  const status = oneOf<WebhookEventStatus>(getParam('status'), WEBHOOK_STATUSES);
  const rawWs = getParam('workspaceId');
  const workspaceId = OBJECT_ID.test(rawWs) ? rawWs : undefined;
  const workspaceName = getParam('workspaceName');
  const from = getParam('from');
  const to = getParam('to');
  const eventId = OBJECT_ID.test(getParam('eventId')) ? getParam('eventId') : null;

  const params = useMemo<AdminEventsParams>(
    () => ({
      page,
      limit: EVENTS_PAGE_SIZE,
      ...(provider && { provider }),
      ...(status && { status }),
      ...(workspaceId && { workspaceId }),
      ...(dayIso(from, 'start') && { from: dayIso(from, 'start') }),
      ...(dayIso(to, 'end') && { to: dayIso(to, 'end') }),
    }),
    [page, provider, status, workspaceId, from, to],
  );

  const range = useMemo<DateRange>(() => ({ from: toDate(from), to: toDate(to) }), [from, to]);

  const setFilter = useCallback(
    (key: 'provider' | 'status', value: string) =>
      updateParams({ [key]: value === ALL_FILTER ? null : value, page: null }),
    [updateParams],
  );

  const setWorkspace = useCallback(
    (ws: { id: string; name: string } | null) =>
      updateParams({ workspaceId: ws?.id ?? null, workspaceName: ws?.name ?? null, page: null }),
    [updateParams],
  );

  const setRange = useCallback(
    (next: DateRange) =>
      updateParams({
        from: next.from ? formatDate(next.from, URL_DATE_FORMAT) : null,
        to: next.to ? formatDate(next.to, URL_DATE_FORMAT) : null,
        page: null,
      }),
    [updateParams],
  );

  const clear = useCallback(
    () => updateParams({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), page: null }),
    [updateParams],
  );

  return {
    params,
    values: {
      provider: provider ?? ALL_FILTER,
      status: status ?? ALL_FILTER,
      workspace: workspaceId
        ? { id: workspaceId, name: workspaceName || `Workspace …${workspaceId.slice(-6)}` }
        : null,
      range,
    },
    hasActiveFilter: [provider, status, workspaceId, from, to].some(Boolean),
    eventId,
    openEvent: (id: string | null) => updateParams({ eventId: id }),
    page,
    setPage: qp.setPage,
    setProvider: (v: string) => setFilter('provider', v),
    setStatus: (v: string) => setFilter('status', v),
    setWorkspace,
    setRange,
    clear,
  };
}

export type EventFilterState = ReturnType<typeof useEventFilters>;
