import type { LiveQuizEndReasonValue, LiveQuizStatusValue, QuizPhase, QuizScoreRow } from "./live-quiz.interface";

/**
 * Payload S→C của `quiz:*` và snapshot REST (be.md p5-01 §4/§6). ⚠️ Mọi mốc giờ là epoch ms theo đồng hồ SERVER và MỌI payload
 * mang `serverNow` (epoch ms, CÙNG hệ với `deadlineAt`/`questionStartedAt`/snapshot) — khác các sự kiện chung dùng ISO: live quiz tính
 * đồng hồ đếm ngược bằng số nên không phải parse. `emitToRoom/emitToUsers` chỉ thêm `v` + `serverNow` ISO khi payload chưa có.
 */
export interface QuizPlayerView {
  userId: string;
  nickname: string;
  avatarAssetId: string | null;
}

export interface QuizOptionView {
  text: string;
  mediaAssetId: string | null;
}

/** Câu đang mở — KHÔNG BAO GIỜ có đáp án đúng/giải thích (chỉ `quiz:reveal`). */
export interface QuizQuestionView {
  index: number;
  prompt: string;
  options: QuizOptionView[];
  deadlineAt: number;
  questionStartedAt: number;
}

export interface QuizRevealView {
  index: number;
  correct: number | null;
  stats: Record<string, number>;
  explanation: string | null;
}

export interface QuizStamped {
  serverNow: number;
}

export interface QuizQuestionPayload extends QuizQuestionView, QuizStamped {
  sessionId: string;
  total: number;
  version: number;
}

/** Gửi cả phòng — KHÔNG có `pin` (chỉ host thấy PIN, qua snapshot riêng). */
export interface QuizLobbyPayload extends QuizStamped {
  sessionId: string;
  players: QuizPlayerView[];
  playersCount: number;
}

export interface QuizRevealPayload extends QuizRevealView, QuizStamped {
  sessionId: string;
}

export interface QuizLeaderboardPayload extends QuizStamped {
  sessionId: string;
  index: number;
  top: QuizScoreRow[];
  playersCount: number;
}

/** Gửi RIÊNG `user:{id}` — hàng đầy đủ của chính người đó (`userId`, `rank`, `score`, `cumulativeMs`), không lặp `top`. */
export interface QuizMePayload extends QuizStamped {
  sessionId: string;
  index: number;
  me: QuizScoreRow;
}

/** Gửi RIÊNG host (`user:{hostId}`, throttle 500 ms) — số người đã trả lời câu đang mở. */
export interface QuizProgressPayload extends QuizStamped {
  sessionId: string;
  index: number;
  answeredCount: number;
  playersCount: number;
}

export interface QuizEndedPayload extends QuizStamped {
  sessionId: string;
  status: Extract<LiveQuizStatusValue, "FINISHED" | "CANCELLED">;
  /** Giữ tên cũ `reason` (app đang đọc) và thêm `endReason` theo be.md §6. */
  reason: LiveQuizEndReasonValue;
  endReason: LiveQuizEndReasonValue;
  version: number;
  top: QuizScoreRow[];
  playersCount: number;
  /** Luôn `false` lúc phát: kết quả bền ghi SAU (outbox `live-quiz.persist`) — client thăm dò `GET …/results` (`persisted`). */
  resultsReady: boolean;
}

export interface QuizSnapshot extends QuizStamped {
  id: string;
  status: LiveQuizStatusValue;
  phase: QuizPhase;
  /** CHỈ host nhận. */
  pin?: string;
  hostId: string;
  setId: string;
  setTitle: string;
  currentIndex: number;
  total: number;
  question: QuizQuestionView | null;
  players: QuizPlayerView[];
  playersCount: number;
  leaderboardTop: QuizScoreRow[];
  me: QuizScoreRow | null;
  /** CHỈ host, khi đang có câu (QUESTION/REVEAL): số người đã trả lời câu hiện tại. */
  answeredCount?: number;
  /** Chỉ khi `phase = REVEAL` (câu đã đóng) — người vào lại/nối lại giữa lúc công bố vẫn thấy đáp án. */
  reveal?: QuizRevealView | null;
  version: number;
}
