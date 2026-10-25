import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { onRoomResync, SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';
import { useAppActive } from '@/shared/hooks/useAppActive';
import { useAuthStore } from '@/shell/store/slices/auth';

import { pomodoroKeys } from '../api/pomodoro.keys';
import type { PomodoroUpdatedEvent } from '../api/pomodoro.types';
import { applySnapshot } from '../queries/pomodoro.cache';
import { usePomodoroSnapshotQuery } from '../queries/pomodoro.queries';
import { usePomodoroStore } from '../store/pomodoro.store';
import { medianOffset } from '../utils/clock';

/** Quá hạn `phaseEndsAt` chừng này mà chưa có `pomodoro:updated` ⇒ tải lại (app.md §4: "quá 3 s không có sự kiện → refetch"). */
const OVERDUE_GRACE_MS = 3000;
const OVERDUE_RETRY_MS = 5000;
const OVERDUE_MAX_RETRIES = 12;
/** Trải đều lượt tải lại `myActions` của N máy sau một sự kiện đổi chủ phòng/phiên (không để cùng GET một lúc). */
const RECONCILE_JITTER_MS = 1200;

/**
 * Snapshot + phòng `ch:{id}` + patch cache theo `pomodoro:updated` (app.md p5-02 §4).
 *
 * ⚠️ Màn phòng Pomodoro THAY màn chat của kênh nên không ai khác `room:join ch:{id}` — hook tự join (refcount ở `core/socket`, hai nơi cùng
 * mở một phòng chỉ sinh MỘT lượt join). Reconnect ⇒ `onRoomResync` tải lại (phase có thể đã đổi lúc mất mạng); app trở lại foreground ⇒
 * tải lại (PM-05); quá hạn phase mà không có sự kiện ⇒ tải lại (sự kiện lỡ, worker trễ).
 */
export function usePomodoroSnapshot(channelId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.user?.id);
  const query = usePomodoroSnapshotQuery(channelId, enabled);
  const room = useRoomSubscription('ch', channelId, { enabled });
  const { refetch } = query;
  const endsAt = query.data?.phaseEndsAt ?? null;
  const appState = useAppActive();
  const wasActive = useRef(true);
  const jitter = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSocketEvent<PomodoroUpdatedEvent>(SocketEvent.POMODORO_UPDATED, (event) => {
    if (event.channelId !== channelId) return;
    const { reconcile } = applySnapshot(queryClient, channelId, event, myId);
    if (reconcile && jitter.current === null) {
      jitter.current = setTimeout(() => {
        jitter.current = null;
        void queryClient.invalidateQueries({ queryKey: pomodoroKeys.snapshot(channelId) });
      }, Math.random() * RECONCILE_JITTER_MS);
    }
  });

  useEffect(() => onRoomResync(() => void refetch()), [refetch]);

  useEffect(
    () => () => {
      if (jitter.current !== null) clearTimeout(jitter.current);
    },
    [],
  );

  useEffect(() => {
    if (appState === 'active' && !wasActive.current && enabled) void refetch();
    wasActive.current = appState === 'active';
  }, [appState, enabled, refetch]);

  // Canh quá hạn bằng nhịp 1 s (không hẹn MỘT timer dài 25 phút: timer dài bị hệ điều hành treo khi app ra nền và cảnh báo trên Android).
  useEffect(() => {
    if (!endsAt || !enabled) return undefined;
    let lastTry = 0;
    let tries = 0;
    const timer = setInterval(() => {
      const offset = medianOffset(usePomodoroStore.getState().offsetSamples[channelId] ?? []);
      const now = Date.now();
      if (now + offset - Date.parse(endsAt) < OVERDUE_GRACE_MS) return;
      if (tries >= OVERDUE_MAX_RETRIES || now - lastTry < OVERDUE_RETRY_MS) return;
      lastTry = now;
      tries += 1;
      void refetch();
    }, 1000);
    return () => clearInterval(timer);
  }, [channelId, enabled, endsAt, refetch]);

  return {
    error: query.error,
    isError: query.isError,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    refetch,
    room,
    snapshot: query.data,
  };
}
