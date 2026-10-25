import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useRef } from 'react';

import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { pomodoroKeys } from '../api/pomodoro.keys';
import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroCommandKind, PomodoroSnapshot } from '../api/pomodoro.types';
import { applySnapshot } from '../queries/pomodoro.cache';
import { newCommandId } from '../utils/command-id';
import { isStaleCommand, pomodoroErrorCode, pomodoroErrorMessage } from '../utils/pomodoro-errors';

interface HeldCommand {
  commandId: string;
  expectedVersion: number;
  kind: PomodoroCommandKind;
}

/** `RES_004`: lượt TRƯỚC với cùng `commandId` còn đang chạy ở server — chưa phải câu trả lời chốt, đổi id lúc này là mở đường cho chạy đôi. */
const IN_PROGRESS_CODE = 'RES_004';

/**
 * Lệnh của chủ phòng `start/pause/resume/skip/end` (app.md p5-02 §4): `commandId` (UUID) sinh khi bấm và GIỮ tới khi có câu trả lời dứt
 * khoát — mất mạng giữa chừng rồi bấm lại dùng cùng id nên server không áp lệnh hai lần (PM-08); `expectedVersion` lấy từ snapshot lúc bấm.
 * Lệch version/sai phase (`RES_003`/`CALL_POMO_005`) ⇒ toast "Phiên vừa thay đổi" + tải lại (nút phản ánh đúng trạng thái mới).
 */
export function usePomodoroCommand(channelId: string) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.user?.id);
  const held = useRef<HeldCommand | null>(null);
  const inflight = useRef(false);

  const mutation = useMutation({
    mutationFn: ({ commandId, expectedVersion, kind }: HeldCommand) =>
      pomodoroService.command(channelId, kind, { commandId, expectedVersion }),
    onError: (error) => {
      // Có phản hồi của server = câu trả lời chốt (trừ "đang chạy"): lần bấm sau là ý định MỚI. Không có phản hồi (mất mạng) thì giữ id.
      if (isAxiosError(error) && error.response && pomodoroErrorCode(error) !== IN_PROGRESS_CODE) held.current = null;
      if (isStaleCommand(error)) {
        showToast('warning', 'Phiên vừa thay đổi');
        void queryClient.invalidateQueries({ queryKey: pomodoroKeys.snapshot(channelId) });
        return;
      }
      showToast('error', pomodoroErrorMessage(error));
    },
    onSuccess: (snapshot) => {
      held.current = null;
      applySnapshot(queryClient, channelId, snapshot, myId);
    },
  });
  const { mutateAsync } = mutation;

  /** Trả snapshot mới (đã vào cache) hoặc `null` khi lỗi (đã toast) / đang có lệnh khác chạy. */
  const run = useCallback(
    async (kind: PomodoroCommandKind, expectedVersion: number): Promise<PomodoroSnapshot | null> => {
      if (inflight.current) return null;
      inflight.current = true;
      const same = held.current?.kind === kind && held.current.expectedVersion === expectedVersion;
      const command: HeldCommand = {
        commandId: same && held.current ? held.current.commandId : newCommandId(),
        expectedVersion,
        kind,
      };
      held.current = command;
      try {
        return await mutateAsync(command);
      } catch {
        return null;
      } finally {
        inflight.current = false;
      }
    },
    [mutateAsync],
  );

  return { isPending: mutation.isPending, pendingKind: mutation.isPending ? (mutation.variables?.kind ?? null) : null, run };
}
