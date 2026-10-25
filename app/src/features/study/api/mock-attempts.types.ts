import type { StudyItemType, StudyOption } from './study.types';

/** Thi thử (be `mock-attempt.presenter.ts`, p4-02 be.md §4). Đề khi đang làm KHÔNG kèm đáp án. */
export type MockAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
export type MockSubmitMode = 'MANUAL' | 'AUTO';

export interface MockTagScore {
  tag: string;
  correct: number;
  total: number;
}

export interface MockAttemptDto {
  id: string;
  setId: string;
  setTitle: string;
  status: MockAttemptStatus;
  submitMode: MockSubmitMode | null;
  durationSec: number;
  passPct: number;
  shuffle: boolean;
  total: number;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  answeredCount: number;
  correctCount: number | null;
  scorePct: number | null;
  passed: boolean | null;
  byTag: MockTagScore[];
  backgroundCount: number;
  backgroundMs: number;
}

/** Một dòng lịch sử thi (be `toSummaryDto`) — `GET /me/mock-attempts`, `GET /study-sets/:id/mock-attempts`. */
export interface MockAttemptSummaryDto {
  id: string;
  setId: string;
  setTitle: string;
  status: MockAttemptStatus;
  submitMode: MockSubmitMode | null;
  scorePct: number | null;
  passed: boolean | null;
  correctCount: number | null;
  total: number;
  startedAt: string;
  submittedAt: string | null;
}

export interface MockAttemptPage {
  items: MockAttemptSummaryDto[];
  meta: { hasMore: boolean; limit: number; nextCursor: string | null };
}

export interface MockQuestionPublic {
  index: number;
  itemId: string;
  type: StudyItemType;
  prompt: string;
  options: StudyOption[];
  frontMediaAssetId: string | null;
}

export interface MockMyAnswerDto {
  itemId: string;
  optionIds: string[];
  text: string | null;
}

export interface CreateAttemptPayload {
  count: number;
  durationSec: number;
  shuffle?: boolean;
  passPct?: number;
  tags?: string[];
}

export interface CreatedAttemptDto {
  attempt: MockAttemptDto;
  questions: MockQuestionPublic[];
  expiresAt: string;
  serverNow: string;
}

export interface MockInProgressDto {
  attempt: MockAttemptDto;
  questions: MockQuestionPublic[];
  myAnswers: MockMyAnswerDto[];
  serverNow: string;
}

export interface MockResultQuestionDto extends MockQuestionPublic {
  correctOptionIds: string[];
  acceptedAnswers: string[];
  explanation: string | null;
  tags: string[];
  myAnswer: MockMyAnswerDto | null;
  correct: boolean;
  partial: number | null;
}

export interface MockResultDto {
  attempt: MockAttemptDto;
  questions: MockResultQuestionDto[];
  serverNow: string;
  lateAnswersIgnored?: boolean;
}

/** `GET /mock-attempts/:id`: đang làm → đề + đáp án đã lưu; đã kết thúc → kết quả đầy đủ. */
export type MockAttemptView = MockInProgressDto | MockResultDto;

export interface MockAnswerInput {
  itemId: string;
  optionIds?: string[];
  text?: string;
  timeMs?: number;
}

export interface MockAttemptEventInput {
  type: 'BACKGROUND' | 'FOREGROUND';
  at: string;
  clientEventId: string;
}

export function isMockResult(view: MockAttemptView): view is MockResultDto {
  return view.attempt.status !== 'IN_PROGRESS';
}
