import * as Haptics from 'expo-haptics';
import { useState } from 'react';

import { emitWithAck, SocketEvent } from '@/core/socket';

import type { QuizAnswerPayload } from '../api/live-quiz.types';
import { useLiveQuizStore } from '../store/live-quiz.store';
import { remainingMs } from '../utils/clock';

export type AnswerState = 'error' | 'idle' | 'sending' | 'sent';

const ACK_TIMEOUT_MS = 3000;
const MAX_RETRIES = 2;

/**
 * Gửi `quiz:answer` qua socket có ack (app.md p5-01 §4). Mất ack ⇒ thử lại tối đa 2 lần nếu CÒN hạn; `QUIZ_004`
 * (server đã nhận trước đó — idempotent) coi như gửi thành công.
 *
 * Lựa chọn nằm ở `live-quiz.store` (theo phiên + chỉ số câu) chứ không phải state của hook: màn bị dựng lại giữa câu
 * (xoay máy, mở app lại) vẫn nhớ mình đã chọn gì và server đã nhận chưa (`acked`) — dựng lại mà quên thì người chơi thấy bảng
 * chọn mở khoá và bấm được lần hai (BE trả `QUIZ_004`, nhưng người chơi tưởng đáp án chưa được ghi). ⚠️ Hook sống theo MỘT
 * câu: nơi gọi đặt `key` theo `index` để câu mới tự reset trạng thái gửi.
 */
export function useQuizAnswer(
  sessionId: string,
  index: number,
  deadlineAt: number,
  offsetMs: number,
) {
  const saved = useLiveQuizStore((state) =>
    state.sessionId === sessionId ? state.answers[index] : undefined,
  );
  const [state, setState] = useState<AnswerState>(() => {
    if (!saved) return 'idle';
    return saved.acked ? 'sent' : 'error';
  });
  const [code, setCode] = useState<string | undefined>(() =>
    saved && !saved.acked ? 'ACK_TIMEOUT' : undefined,
  );
  const selected = saved?.choice ?? null;

  const remember = (choice: number, acked: boolean): void =>
    useLiveQuizStore.getState().saveAnswer(sessionId, index, { acked, choice });

  async function send(choice: number, attempt = 0): Promise<void> {
    const payload: QuizAnswerPayload = { choice, index, sessionId };
    const ack = await emitWithAck(SocketEvent.QUIZ_ANSWER, payload, ACK_TIMEOUT_MS);
    if (ack.ok || ack.code === 'QUIZ_004') {
      remember(choice, true);
      setState('sent');
      setCode(undefined);
      return;
    }
    const timedOut = ack.code === 'ACK_TIMEOUT' || ack.code === 'ACK_EMPTY';
    if (timedOut && attempt < MAX_RETRIES && remainingMs(deadlineAt, offsetMs) > 0) {
      await send(choice, attempt + 1);
      return;
    }
    setState('error');
    setCode(timedOut && remainingMs(deadlineAt, offsetMs) <= 0 ? 'QUIZ_005' : ack.code);
  }

  function choose(choice: number): void {
    if (state === 'sending' || state === 'sent') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    remember(choice, false);
    setState('sending');
    void send(choice);
  }

  function retry(): void {
    if (selected === null) return;
    setState('sending');
    void send(selected);
  }

  return { choose, code, retry, selected, state };
}
