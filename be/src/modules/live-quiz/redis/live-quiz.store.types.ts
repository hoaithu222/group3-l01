import type { LiveQuizStatusValue, QuizMeta, QuizPlayer, QuizScoreRow, StoredQuestion } from "../entities/live-quiz.interface";

export interface QuizInit {
  id: string;
  pin: string;
  meta: Omit<QuizMeta, "status" | "phase" | "currentIndex" | "questionStartedAtMs" | "deadlineAtMs" | "version" | "hostLastSeenMs" | "pin">;
  questions: StoredQuestion[];
  /** Mỗi phần tử `"<đáp án đúng>:<số lựa chọn>"` (`encodeCorrect`). */
  corrects: string[];
  ttlSeconds: number;
}

export type JoinResult = { kind: "JOINED" | "EXISTS"; playersCount: number } | { kind: "FULL" | "KICKED" | "ENDED" | "GONE" };
export type AdvanceResult =
  | { kind: "OK"; index: number; startedAtMs: number; deadlineAtMs: number; version: number }
  | { kind: "VERSION"; version: number }
  | { kind: "STATE"; status: string }
  | { kind: "END" | "GONE" };
export type AnswerResult =
  | { kind: "OK"; points: number; answered: number; players: number }
  | { kind: "GONE" | "STATE" | "NOT_PLAYER" | "CLOSED" | "BAD_CHOICE" | "DUP" };
export type FinishResult =
  | { kind: "OK"; prevStatus: LiveQuizStatusValue; version: number }
  | { kind: "ALREADY"; status: LiveQuizStatusValue; version: number }
  | { kind: "VERSION"; version: number }
  | { kind: "STATE"; status: string }
  | { kind: "GONE" };

export interface AdvanceParams {
  mode: "start" | "next";
  expectedVersion: number;
  seconds: number;
  total: number;
}

export interface AnswerParams {
  userId: string;
  index: number;
  choice: number;
  base: number;
  bonus: number;
  seconds: number;
}

/**
 * Cổng Redis của live quiz — nguồn sự thật điểm/đáp án/trạng thái nóng trong phiên. Bản thật (`NodeRedisLiveQuizStore`) dùng Lua
 * (be.md §5); bản `InMemoryLiveQuizStore` mô phỏng đúng ngữ nghĩa từng script cho test. Redis lỗi ⇒ 503 (KHÔNG fail-open).
 */
export interface ILiveQuizStore {
  claimPin(pin: string, sessionId: string, ttlSeconds: number): Promise<boolean>;
  resolvePin(pin: string): Promise<string | null>;
  releasePin(pin: string): Promise<void>;
  init(input: QuizInit): Promise<void>;
  getMeta(id: string): Promise<QuizMeta | null>;
  join(id: string, player: QuizPlayer, max: number): Promise<JoinResult>;
  players(id: string): Promise<QuizPlayer[]>;
  hasPlayer(id: string, userId: string): Promise<boolean>;
  kick(id: string, userId: string): Promise<boolean>;
  advance(id: string, p: AdvanceParams): Promise<AdvanceResult>;
  /** Đóng câu `index` (QUESTION → REVEAL) đúng MỘT lần; `true` = lời gọi này đóng được. */
  close(id: string, index: number): Promise<boolean>;
  answer(id: string, p: AnswerParams): Promise<AnswerResult>;
  finish(id: string, expectedVersion: number | null, target: "FINISHED" | "CANCELLED", allowedFrom: readonly LiveQuizStatusValue[] | "*"): Promise<FinishResult>;
  question(id: string, index: number): Promise<StoredQuestion | null>;
  correctOf(id: string, index: number): Promise<{ correctIndex: number; optionCount: number } | null>;
  stats(id: string, index: number): Promise<Record<string, number>>;
  /** userId → `{ choice, ms }` của một câu. */
  answers(id: string, index: number): Promise<Map<string, { choice: number; ms: number }>>;
  /** Người này đã có đáp án ở câu `index` chưa (`HEXISTS`) — phân biệt "gửi trùng" với "quá hạn" khi câu đã đóng. */
  hasAnswered(id: string, index: number, userId: string): Promise<boolean>;
  /** Số người đã trả lời câu `index` + số người trong phòng (hai `HLEN`). */
  counts(id: string, index: number): Promise<{ answered: number; players: number }>;
  /** Toàn bộ bảng điểm đã xếp hạng (≤ `playersMax` hàng). */
  scores(id: string): Promise<QuizScoreRow[]>;
  setHostLastSeen(id: string, ms: number): Promise<void>;
  /** Đặt TTL cho mọi khoá của phiên (`total` = số câu → khoá `answers/stats` theo câu). */
  expireAll(id: string, total: number, ttlSeconds: number): Promise<void>;
}
