import type { FillMatchModeValue, StudyItemTypeValue, StudyOption } from "./study-item.interface";

/**
 * Entity thi thử (p4-02) — khai ĐỘC LẬP với Prisma (khớp model `MockAttempt`/`MockAnswer`), tầng domain không import kiểu Prisma.
 */
export const MOCK_ATTEMPT_STATUSES = ["IN_PROGRESS", "SUBMITTED", "EXPIRED"] as const;
export type MockAttemptStatusValue = (typeof MOCK_ATTEMPT_STATUSES)[number];

export const MOCK_SUBMIT_MODES = ["MANUAL", "AUTO"] as const;
export type MockSubmitModeValue = (typeof MOCK_SUBMIT_MODES)[number];

/** Tag của câu không gắn thẻ / phần gộp khi vượt `LIMITS.mock.byTagMax` (`byTag`). */
export const UNTAGGED_TAG = "__untagged";
export const OTHER_TAG = "__other";

/** `activeKey` của lượt đang làm (unique ⇒ mỗi người tối đa MỘT lượt dở/bộ) và của lượt đã kết thúc. */
export const activeKeyOf = (userId: string, setId: string): string => `${userId}:${setId}`;
export const doneKeyOf = (id: string): string => `done:${id}`;

export interface MockConfig {
  count: number;
  durationSec: number;
  shuffle: boolean;
  passPct: number;
}

/** Snapshot câu hỏi lúc bắt đầu — chứa ĐÁP ÁN nên KHÔNG bao giờ trả nguyên cho client trước khi nộp (`toPublicQuestion`). */
export interface MockQuestion {
  itemId: string;
  type: StudyItemTypeValue;
  prompt: string;
  options: StudyOption[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  matchMode: FillMatchModeValue;
  explanation: string | null;
  frontMediaAssetId: string | null;
  tags: string[];
}

export interface MockTagScore {
  tag: string;
  correct: number;
  total: number;
}

export interface MockAttempt {
  id: string;
  userId: string;
  setId: string;
  setTitle: string;
  setVersion: number;
  config: MockConfig;
  questions: MockQuestion[];
  status: MockAttemptStatusValue;
  activeKey: string;
  startedAt: Date;
  expiresAt: Date;
  submittedAt: Date | null;
  submitMode: MockSubmitModeValue | null;
  answeredCount: number;
  correctCount: number | null;
  scorePct: number | null;
  passed: boolean | null;
  byTag: MockTagScore[];
  backgroundCount: number;
  backgroundMs: number;
  lastBackgroundAt: Date | null;
  eventCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type MockAttemptCreateInput = Pick<
  MockAttempt,
  "id" | "userId" | "setId" | "setTitle" | "setVersion" | "config" | "questions" | "startedAt" | "expiresAt"
>;

/** Kết quả chấm ghi vào lượt thi khi kết thúc (CAS `IN_PROGRESS → SUBMITTED|EXPIRED`). */
export interface MockFinalizePatch {
  status: Exclude<MockAttemptStatusValue, "IN_PROGRESS">;
  submitMode: MockSubmitModeValue;
  submittedAt: Date;
  answeredCount: number;
  correctCount: number;
  scorePct: number;
  passed: boolean;
  byTag: MockTagScore[];
}

/** Cập nhật đếm rời app (`POST /events`) — CAS theo `eventCount` đọc được. */
export interface MockEventPatch {
  backgroundCount?: number;
  backgroundMs?: number;
  lastBackgroundAt: Date | null;
}

export interface MockAnswer {
  id: string;
  attemptId: string;
  userId: string;
  itemId: string;
  optionIds: string[];
  text: string | null;
  timeMs: number;
  correct: boolean | null;
  partial: number | null;
  answeredAt: Date;
}

/** Đáp án đã kiểm hợp lệ (thuộc đề) sẵn sàng ghi. */
export interface MockAnswerInput {
  itemId: string;
  optionIds: string[];
  text: string | null;
  timeMs: number;
}

export interface MockAnswerGrade {
  id: string;
  correct: boolean;
  partial: number | null;
}
