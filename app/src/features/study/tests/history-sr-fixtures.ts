import type { MockAttemptSummaryDto } from '../api/mock-attempts.types';
import type { SrDueItemDto } from '../api/sr.types';

/** Dữ liệu giả lịch sử thi + thẻ SR (không phải test) — hình dạng đúng như BE (`toSummaryDto`, `sr.presenter.ts`). */

export function makeSummaryRow(
  id: string,
  overrides: Partial<MockAttemptSummaryDto> = {},
): MockAttemptSummaryDto {
  return {
    correctCount: 8,
    id,
    passed: true,
    scorePct: 80,
    setId: 's1',
    setTitle: 'Bộ học thử',
    startedAt: '2026-09-20T08:00:00.000Z',
    status: 'SUBMITTED',
    submitMode: 'MANUAL',
    submittedAt: '2026-09-20T08:10:00.000Z',
    total: 10,
    ...overrides,
  };
}

export function makeSrCard(itemId: string, overrides: Partial<SrDueItemDto> = {}): SrDueItemDto {
  return {
    acceptedAnswers: [],
    answerText: `Định nghĩa ${itemId}`,
    audioAssetId: null,
    backMediaAssetId: null,
    correctOptionIds: [],
    easiness: 2.5,
    explanation: null,
    frontMediaAssetId: null,
    interval: 0,
    itemId,
    lapses: 0,
    lastRating: null,
    lastReviewedAt: null,
    matchMode: 'IGNORE_CASE',
    nextReviewAt: '2026-09-25T00:00:00.000Z',
    options: [],
    prompt: `Thuật ngữ ${itemId}`,
    repetition: 0,
    setId: 's1',
    setTitle: 'Bộ học thử',
    status: 'NEW',
    tags: [],
    type: 'FLASHCARD',
    ...overrides,
  };
}
