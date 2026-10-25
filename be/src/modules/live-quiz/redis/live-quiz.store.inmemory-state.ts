import type { QuizMeta, QuizPlayer, StoredQuestion } from "../entities/live-quiz.interface";
import type { QuizInit } from "./live-quiz.store.types";

/** Trạng thái một phiên trong `InMemoryLiveQuizStore` — mỗi trường tương ứng một khoá Redis (`live-quiz.keys.ts`). */
export interface SessionState {
  meta: QuizMeta;
  players: Map<string, Omit<QuizPlayer, "userId">>;
  /** userId → điểm ghép ZSET (`score × 10^7 + (10^7 − 1 − ms)`), giống Redis. */
  scores: Map<string, number>;
  answers: Map<number, Map<string, { choice: number; ms: number }>>;
  stats: Map<number, Record<string, number>>;
  corrects: string[];
  questions: StoredQuestion[];
  kicked: Set<string>;
  expiresAtMs: number;
}

/** Phiên mới lập (WAITING/LOBBY, version 1) — giống `initialMetaHash` + các hash `questions`/`correct`. */
export function newSessionState(input: QuizInit, expiresAtMs: number): SessionState {
  return {
    meta: { ...input.meta, pin: input.pin, status: "WAITING", phase: "LOBBY", currentIndex: -1, questionStartedAtMs: 0, deadlineAtMs: 0, version: 1, hostLastSeenMs: 0 },
    players: new Map(),
    scores: new Map(),
    answers: new Map(),
    stats: new Map(),
    corrects: [...input.corrects],
    questions: input.questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })) })),
    kicked: new Set(),
    expiresAtMs,
  };
}
