import type { MockAnswerInput } from '../api/mock-attempts.types';
import { useMockPlayerStore } from '../store/mock-player.store';
import {
  ANSWER_BATCH_MAX,
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_RETRY_MS,
  pendingAnswers,
  SETTLE_TIMEOUT_MS,
} from './answer-batches';
import { getErrorCode } from './error-info';

type SendOutcome = 'ok' | 'terminal' | 'error';

/** Phần phụ thuộc vào React (mạng, mutation, callback) — màn cấp lại mỗi lần vẽ qua `configure`. */
export interface AutosaverEnv {
  isOnline: () => boolean;
  /** `MOCK_003` (quá hạn) / `MOCK_004` (đã nộp): dừng gửi, màn chuyển sang kết quả. */
  onTerminal?: (code: string) => void;
  save: (answers: MockAnswerInput[]) => Promise<unknown>;
}

/**
 * Bộ lưu đáp án theo lô (app.md p4-02 §4 "Trả lời"), thuần TS để test không cần React: ghi store NGAY → debounce →
 * `PUT answers` ≤ 50. Một câu chỉ rời `pending` khi server xác nhận VÀ giá trị không đổi trong lúc bay (`confirm`).
 * ⚠️ Rủi ro đã biết: lượt PUT đang bay đúng lúc nộp có thể tới BE SAU khi chấm (409 `MOCK_004` → mất điểm câu đó). Theo
 * plan, `drainForSubmit()` chờ lô đang bay rồi trả TOÀN BỘ `pending` chưa xác nhận để gửi kèm `submit.answers` — BE upsert
 * idempotent theo câu và chấm SAU khi lưu, nên câu nào tới trước cũng đúng.
 */
export function createAnswerAutosaver(attemptId: string) {
  let env: AutosaverEnv = {
    isOnline: () => false,
    save: () => Promise.reject(new Error('answer-autosaver: chưa gọi configure()')),
  };
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let terminal = false;
  let stopped = false;
  let draining = false;

  const clearTimers = () => {
    if (debounce) clearTimeout(debounce);
    if (retry) clearTimeout(retry);
    debounce = null;
    retry = null;
  };

  async function send(batch: MockAnswerInput[]): Promise<SendOutcome> {
    try {
      await env.save(batch);
      useMockPlayerStore.getState().confirm(attemptId, batch);
      return 'ok';
    } catch (error) {
      const code = getErrorCode(error);
      if (code === 'MOCK_003' || code === 'MOCK_004') {
        terminal = true;
        env.onTerminal?.(code);
        return 'terminal';
      }
      if (code === 'MOCK_005') {
        // Một câu không thuộc đề làm hỏng cả lô: gửi lại TỪNG câu để câu hợp lệ vẫn lên, câu hỏng bị bỏ (không lặp vô hạn).
        if (batch.length > 1) {
          for (const single of batch) if ((await send([single])) === 'terminal') return 'terminal';
        } else {
          useMockPlayerStore.getState().dropPending(attemptId, [batch[0]?.itemId ?? '']);
        }
        return 'ok';
      }
      return 'error';
    }
  }

  function flush(): Promise<void> {
    if (debounce) clearTimeout(debounce);
    debounce = null;
    if (inFlight) return inFlight;
    if (terminal || !env.isOnline()) return Promise.resolve();
    const batch = pendingAnswers(attemptId).slice(0, ANSWER_BATCH_MAX);
    if (batch.length === 0) return Promise.resolve();
    const run = send(batch).then((outcome) => {
      inFlight = null;
      // Còn dư (lô > 50 hoặc đáp án mới trong lúc bay) thì gửi tiếp NGAY — trừ khi đang có hẹn giờ debounce (người dùng còn
      // đang trả lời: đợi hết nhịp) hoặc đang chuẩn bị nộp (`drainForSubmit` tự gom phần dư, gửi kèm `submit`).
      if (outcome === 'ok' && !draining && !debounce && pendingAnswers(attemptId).length > 0)
        void flush();
      else if (outcome === 'error' && !stopped)
        retry = setTimeout(() => void flush(), AUTOSAVE_RETRY_MS);
    });
    inFlight = run;
    return run;
  }

  async function settle(timeoutMs: number = SETTLE_TIMEOUT_MS): Promise<void> {
    if (!inFlight) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      inFlight,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
  }

  return {
    /** Cấp lại phụ thuộc React (gọi trong effect mỗi lần vẽ): luôn dùng mutation/callback/mạng mới nhất. */
    configure(next: AutosaverEnv): void {
      env = next;
    },
    /** Đáp án mới: ghi store ngay (bền qua tắt app), gửi sau `AUTOSAVE_DEBOUNCE_MS`. */
    queue(answer: MockAnswerInput): void {
      useMockPlayerStore.getState().saveAnswer(attemptId, answer);
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
    },
    flush,
    /**
     * Chuẩn bị nộp: chờ lô đang bay, đẩy tuần tự các lô dư (> 50) rồi trả tối đa 50 câu còn lại cho `submit.answers`.
     * Lỗi khi đẩy lô dư (kể cả 409 `MOCK_003/4`) KHÔNG chặn nộp — server vẫn chấm phần đã lưu. Đã `terminal` ⇒ `[]`.
     */
    async drainForSubmit(): Promise<MockAnswerInput[]> {
      clearTimers();
      draining = true;
      try {
        await settle();
        let rest = pendingAnswers(attemptId);
        while (rest.length > ANSWER_BATCH_MAX && !terminal) {
          if ((await send(rest.slice(0, ANSWER_BATCH_MAX))) !== 'ok') break;
          rest = pendingAnswers(attemptId);
        }
        return terminal ? [] : rest.slice(0, ANSWER_BATCH_MAX);
      } finally {
        draining = false;
      }
    },
    /** Bắt đầu lại sau `stop` (StrictMode chạy effect hai lần). */
    start(): void {
      stopped = false;
    },
    /** Rời màn: đẩy nốt phần đang chờ rồi ngừng hẹn giờ. Đáp án chưa lên vẫn nằm trong store bền. */
    stop(): void {
      stopped = true;
      clearTimers();
      void flush();
    },
  };
}

export type AnswerAutosaver = ReturnType<typeof createAnswerAutosaver>;
