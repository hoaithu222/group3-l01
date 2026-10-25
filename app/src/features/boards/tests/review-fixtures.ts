import { AxiosError } from 'axios';

import type {
  ReviewConfigDto,
  ReviewRoundDto,
  RubricCriterion,
  TaskReviewDto,
  TaskReviewsDto,
} from '../api/reviews.types';

/** Fixture chấm chéo (p4-05) — chỉ ghi đè trường cần cho ca kiểm. Hình dạng theo `be/.../review.presenter.ts`. */

export const RUBRIC_4_3_3: RubricCriterion[] = [
  { description: 'Đúng yêu cầu đề bài', id: 'r_aaaaaa', label: 'Nội dung', maxScore: 4 },
  { description: null, id: 'r_bbbbbb', label: 'Trình bày', maxScore: 3 },
  { description: null, id: 'r_cccccc', label: 'Đúng hạn', maxScore: 3 },
];

export function makeReview(overrides: Partial<TaskReviewDto> & Pick<TaskReviewDto, 'id'>): TaskReviewDto {
  return {
    assignedAt: '2026-09-24T02:00:00.000Z',
    reviewer: { avatarUrl: null, id: `u-${overrides.id}`, name: `Người chấm ${overrides.id}` },
    roundId: 'round-1',
    status: 'PENDING',
    submittedAt: null,
    version: 1,
    ...overrides,
  };
}

export function makeRound(overrides: Partial<ReviewRoundDto> = {}): ReviewRoundDto {
  return {
    approvedCount: 0,
    assignedCount: 2,
    autoApproved: false,
    closeReason: null,
    closedAt: null,
    configuredReviews: 2,
    id: 'round-1',
    openedAt: '2026-09-24T02:00:00.000Z',
    requiredReviews: 2,
    reviews: [],
    round: 1,
    rubric: [],
    shortage: false,
    status: 'OPEN',
    waived: null,
    ...overrides,
  };
}

export function makeTaskReviews(overrides: Partial<TaskReviewsDto> = {}): TaskReviewsDto {
  return {
    currentRound: makeRound(),
    enabled: true,
    history: [],
    myPermissions: { reassign: false, submit: false, waive: false },
    myReview: null,
    requiredReviews: 2,
    ...overrides,
  };
}

export function makeReviewConfig(overrides: Partial<ReviewConfigDto> = {}): ReviewConfigDto {
  return {
    autoCompleteOnApproval: false,
    eligibleReviewerCount: 4,
    enabled: true,
    openRoundCount: 0,
    requiredReviews: 2,
    rubric: [],
    version: 3,
    ...overrides,
  };
}

/** Lỗi nghiệp vụ dạng `{ error: { code, details } }` như interceptor nhận từ BE. */
export function apiError(code: string, status = 409, details?: unknown): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, details } },
    headers: {},
    status,
    statusText: 'Error',
  });
}
