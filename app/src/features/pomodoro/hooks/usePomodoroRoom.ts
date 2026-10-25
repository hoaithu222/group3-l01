import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getDeviceId } from '@/core/device/device-id';
import { useAuthStore } from '@/shell/store/slices/auth';

import { pomodoroKeys } from '../api/pomodoro.keys';
import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroSnapshot } from '../api/pomodoro.types';
import { applySnapshot } from '../queries/pomodoro.cache';
import { usePomodoroStore } from '../store/pomodoro.store';
import { pomodoroErrorCode, pomodoroErrorMessage } from '../utils/pomodoro-errors';
import { connectPomodoroSession, leavePomodoroRoom } from './pomodoro-session.controller';

/** Lỗi vào phòng khiến trạng thái preview đổi (đầy chỗ, bị mời ra, kênh lưu trữ) ⇒ tải lại để nút "Vào học" phản ánh đúng. */
const REFRESH_CODES = new Set(['CALL_008', 'CALL_016', 'CALL_018']);

export interface UsePomodoroRoom {
  /** Người dùng đồng ý "Chuyển sang máy này" (`CALL_004`) → vào lại với `force`. */
  confirmSwitch: () => Promise<PomodoroSnapshot | null>;
  dismissFailure: () => void;
  dismissSwitch: () => void;
  failure: string | null;
  /** "Vào học": mở phiên WAITING nếu kênh chưa có, lấy token và bắt đầu nối media. Trả snapshot của người vào (đã vào cache) hoặc `null`. */
  join: () => Promise<PomodoroSnapshot | null>;
  leave: () => Promise<void>;
  pending: boolean;
  switchPrompt: boolean;
}

/**
 * Vào/rời phòng học (app.md §2 `PomodoroRoomScreen` preview ↔ trong phòng). REST `join` xong là trả về ngay: kết nối media chạy nền trong
 * controller (state ở `pomodoro.store.room`, màn phòng hiện "Đang vào phòng…" tới khi CONNECTED). Rời màn = rời phòng — không có thanh
 * thu nhỏ để giữ phòng khi đi chỗ khác (cần `CallHost` ở layout, ngoài phạm vi feature), nên media không được chạy mồ côi.
 */
export function usePomodoroRoom(channelId: string): UsePomodoroRoom {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.user?.id);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [switchPrompt, setSwitchPrompt] = useState(false);
  const busy = useRef(false);

  const run = useCallback(
    async (force: boolean): Promise<PomodoroSnapshot | null> => {
      if (busy.current) return null;
      busy.current = true;
      setPending(true);
      setFailure(null);
      try {
        const result = await pomodoroService.join(channelId, await getDeviceId(), force);
        const { merged } = applySnapshot(queryClient, channelId, result.snapshot, myId);
        void connectPomodoroSession(result, channelId);
        return merged;
      } catch (error) {
        const code = pomodoroErrorCode(error);
        if (code === 'CALL_004') {
          setSwitchPrompt(true);
        } else {
          setFailure(pomodoroErrorMessage(error, 'Không vào được phòng, thử lại sau'));
          if (REFRESH_CODES.has(code)) void queryClient.invalidateQueries({ queryKey: pomodoroKeys.snapshot(channelId) });
        }
        return null;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [channelId, myId, queryClient],
  );

  const join = useCallback(() => run(false), [run]);
  const confirmSwitch = useCallback(() => {
    setSwitchPrompt(false);
    return run(true);
  }, [run]);
  const leave = useCallback(() => leavePomodoroRoom(), []);

  // Rời màn (hoặc đổi kênh) = rời phòng + xoá state theo kênh (offset đồng hồ, nháp mục tiêu — app.md §5).
  useEffect(
    () => () => {
      if (usePomodoroStore.getState().room.channelId === channelId) void leavePomodoroRoom();
      usePomodoroStore.getState().clearChannel(channelId);
    },
    [channelId],
  );

  return {
    confirmSwitch,
    dismissFailure: () => setFailure(null),
    dismissSwitch: () => setSwitchPrompt(false),
    failure,
    join,
    leave,
    pending,
    switchPrompt,
  };
}
