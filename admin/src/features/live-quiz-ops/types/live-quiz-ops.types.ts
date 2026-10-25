/**
 * Kiểu dữ liệu giám sát Live Quiz (p5-01 admin.md §2) — viết tay theo BE thật:
 * `be/src/modules/live-quiz/live-quiz.admin.routes.ts` + `services/live-quiz-query.service.ts` (`adminView`, `adminGet`) +
 * `services/live-quiz-finish.service.ts` (`adminEnd`) + `dtos/index.ts` (`adminSessionsQuerySchema`). BE là nguồn thật.
 *
 * ⛔ Riêng tư: BE KHÔNG trả PIN, nội dung câu hỏi hay đáp án từng người, nên KHÔNG khai (và không được thêm) `pin`, `answers`,
 * `questions`, `choice` ở đây — `tests/features/live-quiz-ops/live-quiz-privacy.test.tsx` quét file này để chặn.
 */

/** `LIVE_QUIZ_STATUSES` của BE. */
export type LiveQuizStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';

/** `LIVE_QUIZ_END_REASONS` của BE. */
export type LiveQuizEndReason =
  'HOST_ENDED' | 'HOST_TIMEOUT' | 'COMPLETED' | 'ADMIN_ENDED' | 'EXPIRED';

/** Một phiên trong danh sách — `adminView` của BE (chỉ metadata, ngày ở dạng ISO). Tên host/workspace BE chưa trả, chỉ có id. */
export interface AdminLiveQuizSession {
  id: string;
  status: LiveQuizStatus;
  endReason: LiveQuizEndReason | null;
  setId: string;
  setTitle: string;
  workspaceId: string | null;
  hostId: string;
  /** Tổng số câu của phiên. */
  total: number;
  playersCount: number;
  /** Chỉ số câu đang mở, đếm từ 0. */
  currentIndex: number;
  autoAdvance: boolean;
  startedAt: string | null;
  endedAt: string | null;
  /** Đã ghi bảng kết quả bền chưa (chỉ phiên FINISHED). */
  resultsPersistedAt: string | null;
  createdAt: string;
  version: number;
}

/** Một dòng bảng kết quả bền (không kèm đáp án từng câu — BE không trả cho admin). */
export interface AdminLiveQuizResultRow {
  userId: string;
  nickname: string | null;
  score: number;
  correct: number;
  answered: number;
  rank: number;
}

/** `GET /admin/live-quiz/sessions/:id`. `results` rỗng khi phiên chưa ghi kết quả bền. */
export interface AdminLiveQuizSessionDetail extends AdminLiveQuizSession {
  results: AdminLiveQuizResultRow[];
}

/** `GET /admin/live-quiz/sessions` — BE chỉ lọc được MỘT trạng thái (không có ngày/workspace/host). */
export interface AdminLiveQuizListParams {
  page: number;
  limit: number;
  status?: LiveQuizStatus;
}

export interface EndLiveQuizPayload {
  sessionId: string;
  /** 10–500 ký tự (`reasonSchema` của BE) — `ConfirmWithReasonModal` đã chặn. */
  reason: string;
}

/** `POST /admin/live-quiz/sessions/:id/end` → `{ status: 'CANCELLED' }`. */
export interface EndLiveQuizResult {
  status: 'CANCELLED';
}
