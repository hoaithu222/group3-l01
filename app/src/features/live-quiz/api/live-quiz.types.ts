/**
 * Kiểu dữ liệu `live-quiz` — khớp snapshot (`buildSnapshot`) và payload `quiz:*` (`entities/live-quiz.events.ts`) của BE p5-01.
 * ⚠️ Mọi mốc giờ là epoch ms theo đồng hồ SERVER; MỌI payload `quiz:*` và snapshot đều mang `serverNow` (epoch ms, cùng hệ với
 * `deadlineAt`). Trường BE thêm sau (`setId`, `setTitle`, `playersCount`, `answeredCount`, …) khai OPTIONAL để không vỡ mã cũ.
 */
export type LiveQuizStatus = 'CANCELLED' | 'FINISHED' | 'IN_PROGRESS' | 'WAITING';
export type LiveQuizPhase = 'ENDED' | 'LOBBY' | 'QUESTION' | 'REVEAL';

export interface QuizOptionDto {
  mediaAssetId: string | null;
  text: string;
}

export interface QuizQuestionDto {
  /** Hạn trả lời (epoch ms server). */
  deadlineAt: number;
  index: number;
  options: QuizOptionDto[];
  prompt: string;
  /** Lúc server mở câu (epoch ms) — BE luôn gửi; optional để tương thích snapshot cũ. */
  questionStartedAt?: number;
}

export interface QuizPlayerDto {
  avatarAssetId: string | null;
  nickname: string;
  userId: string;
}

export interface QuizScoreRowDto {
  cumulativeMs: number;
  rank: number;
  score: number;
  userId: string;
}

/** `quiz:reveal` — `stats` là số người chọn theo chỉ số lựa chọn (khoá chuỗi). */
export interface QuizRevealDto {
  correct: number | null;
  explanation: string | null;
  index: number;
  stats: Record<string, number>;
}

export interface LiveQuizSnapshot {
  currentIndex: number;
  hostId: string;
  id: string;
  leaderboardTop: QuizScoreRowDto[];
  me: QuizScoreRowDto | null;
  phase: LiveQuizPhase;
  /** CHỈ host nhận — cũng là dấu hiệu vai trò host ở client. */
  pin?: string;
  players: QuizPlayerDto[];
  question: QuizQuestionDto | null;
  /** Client-only: lệch đồng hồ `serverNow − Date.now()` đo lúc nhận snapshot (`withClockOffset`). */
  clockOffsetMs?: number;
  /** Kết quả câu vừa đóng: BE trả kèm khi `phase = REVEAL` (vào lại/nối lại giữa lúc công bố); client cũng patch từ `quiz:reveal`. */
  reveal?: QuizRevealDto | null;
  serverNow: number;
  /** CHỈ host, đang có câu (QUESTION/REVEAL): số người đã trả lời câu hiện tại (cập nhật sống qua `quiz:progress`). */
  answeredCount?: number;
  /** Số người trong phòng (= `players.length`). */
  playersCount?: number;
  /** Bộ học của phiên (BE thêm vào snapshot để khỏi tra lại qua lịch sử). */
  setId?: string;
  setTitle?: string;
  status: LiveQuizStatus;
  total: number;
  version: number;
}

export interface CreateLiveQuizPayload {
  autoAdvance: boolean;
  count: number;
  secondsPerQuestion: number;
  setId: string;
  shuffle: boolean;
  workspaceId?: string;
}

export interface CreateLiveQuizResult {
  pin: string;
  session: { id: string };
}

export interface JoinLiveQuizPayload {
  nickname?: string;
  pin: string;
}

export interface JoinLiveQuizResult {
  sessionId: string;
  snapshot: LiveQuizSnapshot;
}

/** Một đáp án của MỘT người ở MỘT câu (BE `QuizAnswerRecord`); `choice`/`ms` = null khi không trả lời. `itemId` = thẻ trong bộ học. */
export interface QuizAnswerRecordDto {
  choice: number | null;
  correct: boolean;
  index: number;
  itemId: string;
  ms: number | null;
  points: number;
}

export interface QuizResultRowDto {
  /** BE trả kèm ở `GET /live-quiz/:id/results` (mọi hàng) — dùng cho "Ôn lại câu sai". */
  answers?: QuizAnswerRecordDto[];
  answered: number;
  correct: number;
  nickname: string | null;
  rank: number;
  score: number;
  userId: string;
}

export interface LiveQuizResultsDto {
  /** `false` = job `live-quiz.persist` chưa xong (BE trả 200 + `results` rỗng, kể cả cho người chơi) — thăm dò lại. */
  persisted: boolean;
  results: QuizResultRowDto[];
  sessionId: string;
  /** Bộ học đã dùng (BE thêm; optional để tương thích bản cũ) — thay cho việc tra qua `GET /me/live-quiz/history`. */
  setId?: string;
  setTitle?: string;
  status: LiveQuizStatus;
  /** Số câu của phiên. */
  total?: number;
}

export interface LiveQuizHistoryItemDto {
  answered: number;
  correct: number;
  createdAt: string;
  endedAt: string | null;
  rank: number;
  score: number;
  sessionId: string;
  setId: string;
  setTitle: string;
  total: number;
}

export interface CursorMeta {
  hasMore: boolean;
  limit: number;
  nextCursor: string | null;
}

export interface LiveQuizHistoryPage {
  items: LiveQuizHistoryItemDto[];
  meta: CursorMeta;
}

/** `quiz:lobby` (cả phòng) — CHỈ danh sách người chơi; KHÔNG có `pin` (chỉ host nhận PIN, ở snapshot riêng). */
export interface QuizLobbyEvent {
  players?: QuizPlayerDto[];
  playersCount?: number;
  sessionId?: string;
}

/** `quiz:progress` (S→C, CHỈ host, throttle 500 ms): số người đã trả lời câu đang mở. */
export interface QuizProgressEvent {
  answeredCount: number;
  index: number;
  playersCount: number;
  sessionId: string;
}

/** Payload S→C (be emitter). */
export interface QuizQuestionEvent extends QuizQuestionDto {
  /** Đồng hồ server lúc phát (epoch ms) — dùng đo lại `clockOffsetMs` nếu cần. */
  serverNow?: number;
  sessionId?: string;
  total: number;
  version: number;
}
/**
 * `quiz:leaderboard`: bản gửi cả phòng chỉ có `top`/`playersCount`; bản gửi RIÊNG `user:{id}` chỉ có `me` (không lặp `top`).
 * BE nay gửi `me` ĐẦY ĐỦ `{ userId, rank, score, cumulativeMs }`; giữ kiểu `Partial` + `mergeMyScore` để vẫn chịu được server cũ
 * (chỉ `{ rank, score }`).
 */
export interface QuizLeaderboardEvent {
  me?: Partial<QuizScoreRowDto> | null;
  playersCount?: number;
  top?: QuizScoreRowDto[];
}
export interface QuizEndedEvent {
  /** Giống `reason` (be.md §6 gọi là `endReason`). */
  endReason?: string | null;
  playersCount?: number;
  reason: string | null;
  /** Luôn `false` lúc phát — kết quả bền ghi SAU (job persist); thăm dò `GET …/results`. */
  resultsReady?: boolean;
  sessionId?: string;
  status: LiveQuizStatus;
  /** Top bảng điểm cuối phiên. */
  top?: QuizScoreRowDto[];
  version: number;
}
export interface QuizAnswerPayload {
  choice: number;
  index: number;
  sessionId: string;
}
