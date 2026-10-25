import { create } from 'zustand';

/** Lựa chọn của tôi ở một câu. `acked` = server đã nhận (ack `ok` hoặc `QUIZ_004`); `false` = đang gửi/chưa gửi được. */
export interface StoredAnswer {
  acked: boolean;
  choice: number;
}

/** Nội dung câu hỏi đã thấy — để "Ôn lại câu sai" sau phiên (BE không cho tải lại đáp án từng câu). */
export interface StoredQuestion {
  options: string[];
  prompt: string;
}

export interface StoredReveal {
  correct: number | null;
  explanation: string | null;
}

interface LiveQuizState {
  /** Theo chỉ số câu, CHỈ của phiên `sessionId`. */
  answers: Record<number, StoredAnswer>;
  questions: Record<number, StoredQuestion>;
  reveals: Record<number, StoredReveal>;
  sessionId: string | null;
}

interface LiveQuizActions {
  /** Xoá sạch (đăng xuất/đổi tài khoản). */
  reset: () => void;
  rememberQuestion: (sessionId: string, index: number, question: StoredQuestion) => void;
  rememberReveal: (sessionId: string, index: number, reveal: StoredReveal) => void;
  saveAnswer: (sessionId: string, index: number, answer: StoredAnswer) => void;
}

const EMPTY: LiveQuizState = { answers: {}, questions: {}, reveals: {}, sessionId: null };

/** Đổi sang phiên khác ⇒ bắt đầu từ trạng thái rỗng (không để lựa chọn của phiên cũ lọt sang). */
const scoped = (state: LiveQuizState, sessionId: string): LiveQuizState =>
  state.sessionId === sessionId ? state : { ...EMPTY, sessionId };

/**
 * State client của phiên live quiz (app.md p5-01 §5) — CHỈ trong bộ nhớ, không persist. Giữ để lựa chọn của tôi sống
 * sót khi màn phiên bị dựng lại giữa câu (xoay máy, mở app lại — LQ-08), và để sau phiên còn dữ liệu cho "Ôn lại câu sai".
 * ⚠️ Đồng hồ lệch (`clockOffsetMs`) KHÔNG ở đây: nó đo lại mỗi lần tải snapshot và nằm trong cache snapshot.
 * Đăng xuất: `resetLiveQuizStores()` (nối ở `shell/session/useLogout.ts`, cùng các `reset*Stores` khác).
 */
export const useLiveQuizStore = create<LiveQuizState & LiveQuizActions>()((set) => ({
  ...EMPTY,
  rememberQuestion: (sessionId, index, question) =>
    set((state) => {
      const base = scoped(state, sessionId);
      return { ...base, questions: { ...base.questions, [index]: question } };
    }),
  rememberReveal: (sessionId, index, reveal) =>
    set((state) => {
      const base = scoped(state, sessionId);
      return { ...base, reveals: { ...base.reveals, [index]: reveal } };
    }),
  reset: () => set({ ...EMPTY }),
  saveAnswer: (sessionId, index, answer) =>
    set((state) => {
      const base = scoped(state, sessionId);
      return { ...base, answers: { ...base.answers, [index]: answer } };
    }),
}));

export function resetLiveQuizStores(): void {
  useLiveQuizStore.getState().reset();
}
