import { useCallback, useRef, useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { useSubmitMockAttempt } from '../queries/mock-attempts.queries';
import { useMockPlayerStore } from '../store/mock-player.store';
import type { AnswerAutosaver } from '../utils/answer-autosaver';
import { getErrorCode, studyErrorMessage } from '../utils/error-info';

/**
 * Nộp bài (app.md p4-02 §4 "Nộp"): `drainForSubmit()` chờ lô đang bay rồi gom TOÀN BỘ đáp án chưa được xác nhận vào
 * `submit.answers` — chặn rủi ro "lượt lưu đang bay tới BE sau khi chấm". Thành công → `useSubmitMockAttempt` ghi kết quả vào
 * cache `detail` và dọn `mock-player.store`; việc CHUYỂN màn do `MockTestPlayerScreen` (thấy `detail` đã là kết quả) — một
 * chỗ duy nhất, không `router.replace` hai lần. Thất bại (mất mạng…) → `failed` để màn hiện nút thử lại; đáp án
 * vẫn nằm trong store nên không mất gì.
 */
export function useMockSubmit(attemptId: string, saver: AnswerAutosaver) {
  const { isPending, mutate } = useSubmitMockAttempt(attemptId);
  const [failed, setFailed] = useState(false);
  const running = useRef(false);

  const run = useCallback(async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setFailed(false);
    const answers = await saver.drainForSubmit();
    mutate(answers, {
      onError: (error) => {
        // `MOCK_005`: một đáp án không thuộc đề làm hỏng CẢ lượt nộp — bỏ phần chờ gửi để bấm "Thử lại" không lặp mãi.
        if (getErrorCode(error) === 'MOCK_005') {
          const pending = useMockPlayerStore.getState().attempts[attemptId]?.pending ?? [];
          useMockPlayerStore.getState().dropPending(attemptId, pending);
        }
        setFailed(true);
        showToast('error', studyErrorMessage(error));
      },
      onSettled: () => {
        running.current = false;
      },
    });
  }, [attemptId, mutate, saver]);

  return { failed, isPending, run };
}
