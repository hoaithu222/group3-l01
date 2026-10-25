import type { MockAnswerInput } from '../api/mock-attempts.types';
import { useMockPlayerStore } from '../store/mock-player.store';

/** BE `LIMITS.mock.answersBatchMax` — cả `PUT answers` lẫn `submit.answers`. */
export const ANSWER_BATCH_MAX = 50;
export const AUTOSAVE_DEBOUNCE_MS = 800;
export const AUTOSAVE_RETRY_MS = 5000;
/** Chờ lô đang bay xong tối đa chừng này trước khi nộp — quá thì gửi kèm luôn trong `submit.answers`. */
export const SETTLE_TIMEOUT_MS = 1500;

/** Đáp án CHƯA được server xác nhận của một lượt (kể cả lô đang bay), theo thứ tự trả lời. */
export function pendingAnswers(attemptId: string): MockAnswerInput[] {
  const entry = useMockPlayerStore.getState().attempts[attemptId];
  if (!entry) return [];
  return entry.pending.flatMap((id) => {
    const answer = entry.answers[id];
    return answer ? [answer] : [];
  });
}
