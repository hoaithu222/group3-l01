/**
 * Entity domain của `live-quiz` (p5-01) — khai ĐỘC LẬP với Prisma enum/model (cùng giá trị), tầng domain không import kiểu
 * Prisma (`.claude/rules/architecture.md`), giống `modules/study/entities`.
 */
export const LIVE_QUIZ_STATUSES = ["WAITING", "IN_PROGRESS", "FINISHED", "CANCELLED"] as const;
export type LiveQuizStatusValue = (typeof LIVE_QUIZ_STATUSES)[number];

export const LIVE_QUIZ_END_REASONS = ["HOST_ENDED", "HOST_TIMEOUT", "COMPLETED", "ADMIN_ENDED", "EXPIRED"] as const;
export type LiveQuizEndReasonValue = (typeof LIVE_QUIZ_END_REASONS)[number];

/** Pha của phiên trong Redis (`meta.phase`): sảnh → đang mở câu → đã công bố đáp án → kết thúc. */
export type QuizPhase = "LOBBY" | "QUESTION" | "REVEAL" | "ENDED";

/** Điểm chốt lúc tạo phiên — đổi `LIMITS.liveQuiz.scoring` không làm lệch phiên đang chạy. */
export interface LiveQuizScoring {
  base: number;
  speedBonus: number;
}

/** Phiên trong Mongo (metadata + bản sao `version`); trạng thái nóng (điểm/đáp án) nằm ở Redis. */
export interface LiveQuizSession {
  id: string;
  setId: string;
  setTitle: string;
  workspaceId: string | null;
  hostId: string;
  pin: string;
  status: LiveQuizStatusValue;
  questionOrder: string[];
  currentIndex: number;
  questionStartedAt: Date | null;
  deadlineAt: Date | null;
  secondsPerQuestion: number;
  revealSeconds: number;
  autoAdvance: boolean;
  scoring: LiveQuizScoring;
  playersCount: number;
  version: number;
  startedAt: Date | null;
  endedAt: Date | null;
  endReason: LiveQuizEndReasonValue | null;
  resultsPersistedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type LiveQuizSessionCreateInput = Pick<
  LiveQuizSession,
  "id" | "setId" | "setTitle" | "workspaceId" | "hostId" | "pin" | "questionOrder" | "secondsPerQuestion" | "revealSeconds" | "autoAdvance" | "scoring"
>;

/** Một đáp án của một người ở một câu (`answers` của `LiveQuizResult`); câu không trả lời: `choice`/`ms` = null, 0 điểm. */
export interface QuizAnswerRecord {
  index: number;
  itemId: string;
  choice: number | null;
  correct: boolean;
  ms: number | null;
  points: number;
}

export interface LiveQuizResult {
  id: string;
  sessionId: string;
  userId: string;
  nickname: string | null;
  score: number;
  correct: number;
  answered: number;
  rank: number;
  answers: QuizAnswerRecord[];
  createdAt: Date;
}

export type LiveQuizResultCreateInput = Omit<LiveQuizResult, "id" | "createdAt">;

/** Câu hỏi lưu trong Redis lúc tạo phiên — `explanation` CHỈ gửi kèm `quiz:reveal`, `itemId` không bao giờ gửi client. */
export interface StoredQuestion {
  itemId: string;
  prompt: string;
  options: Array<{ text: string; mediaAssetId: string | null }>;
  explanation: string | null;
}

/** Trạng thái nóng của phiên (`quiz:{id}:meta`) — số đều là số nguyên (ms UNIX cho mốc thời gian). */
export interface QuizMeta {
  status: LiveQuizStatusValue;
  phase: QuizPhase;
  currentIndex: number;
  questionStartedAtMs: number;
  deadlineAtMs: number;
  version: number;
  /** ms lúc host rớt kết nối; 0 = host đang kết nối. */
  hostLastSeenMs: number;
  hostId: string;
  workspaceId: string | null;
  setId: string;
  /** Tên bộ học lúc tạo phiên — snapshot trả kèm để client không phải tra lại bộ. */
  setTitle: string;
  pin: string;
  total: number;
  seconds: number;
  revealSeconds: number;
  autoAdvance: boolean;
  base: number;
  bonus: number;
}

export interface QuizPlayer {
  userId: string;
  nickname: string;
  avatarAssetId: string | null;
  joinedAtMs: number;
}

/** Hàng bảng điểm đã giải mã (`rank` bắt đầu từ 1). */
export interface QuizScoreRow {
  userId: string;
  rank: number;
  score: number;
  cumulativeMs: number;
}
