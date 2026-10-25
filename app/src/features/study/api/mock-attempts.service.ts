import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type {
  CreateAttemptPayload,
  CreatedAttemptDto,
  MockAttemptEventInput,
  MockAnswerInput,
  MockAttemptPage,
  MockAttemptSummaryDto,
  MockAttemptView,
  MockResultDto,
} from './mock-attempts.types';

/** Endpoint thi thử (be `mock.routes.ts`). */
export function setMockAttemptsPath(setId: string): string {
  return `/study-sets/${setId}/mock-attempts`;
}

export function mockAttemptPath(attemptId: string): string {
  return `/mock-attempts/${attemptId}`;
}

export const MY_MOCK_ATTEMPTS_PATH = '/me/mock-attempts';

/**
 * Trang lịch sử thi (cursor): `{ data: [...], meta }`. Đọc `response.data.data` / `.meta` thẳng thay vì `unwrapData` —
 * `data` là mảng và `meta` nằm cùng cấp (giống `meetingsService.listAttendees`).
 */
async function fetchPage(url: string, cursor: string | undefined): Promise<MockAttemptPage> {
  const response = await apiClient.get<{
    data: MockAttemptSummaryDto[];
    meta: MockAttemptPage['meta'];
  }>(url, { params: { cursor, limit: 20 }, skipErrorToast: true });
  return { items: response.data.data, meta: response.data.meta };
}

/** Lỗi `MOCK_001..006` là nội dung màn thi (hộp thoại tiếp tục lượt dở, banner) — không toast chung. */
export const mockAttemptsService = {
  /** `Idempotency-Key` theo MỘT lần bấm "Bắt đầu". `MOCK_002` → `details.attemptId` là lượt đang dở. */
  async create(
    setId: string,
    payload: CreateAttemptPayload,
    idempotencyKey: string,
  ): Promise<CreatedAttemptDto> {
    const response = await apiClient.post<CreatedAttemptDto>(setMockAttemptsPath(setId), payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<CreatedAttemptDto>(response);
  },

  /** Lịch sử thi của tôi (mọi bộ). */
  listMine(cursor?: string): Promise<MockAttemptPage> {
    return fetchPage(MY_MOCK_ATTEMPTS_PATH, cursor);
  },

  /** Lịch sử thi của tôi trong MỘT bộ. */
  listBySet(setId: string, cursor?: string): Promise<MockAttemptPage> {
    return fetchPage(setMockAttemptsPath(setId), cursor);
  },

  async get(attemptId: string): Promise<MockAttemptView> {
    const response = await apiClient.get<MockAttemptView>(mockAttemptPath(attemptId), {
      skipErrorToast: true,
    });
    return unwrapData<MockAttemptView>(response);
  },

  /** Lô ≤ 50, idempotent theo câu. `MOCK_003` quá hạn, `MOCK_004` đã nộp. */
  async putAnswers(
    attemptId: string,
    answers: MockAnswerInput[],
  ): Promise<{ answeredCount: number; serverNow: string }> {
    const response = await apiClient.put<{ answeredCount: number; serverNow: string }>(
      `${mockAttemptPath(attemptId)}/answers`,
      { answers },
      { skipErrorToast: true },
    );
    return unwrapData<{ answeredCount: number; serverNow: string }>(response);
  },

  /** Rời/vào app lúc đang thi (204). Idempotent theo `clientEventId`. */
  async recordEvent(attemptId: string, event: MockAttemptEventInput): Promise<void> {
    await apiClient.post(`${mockAttemptPath(attemptId)}/events`, event, { skipErrorToast: true });
  },

  /** Nộp lại trả CÙNG kết quả; `answers` đẩy nốt đáp án chưa lưu trước khi chấm. */
  async submit(attemptId: string, answers?: MockAnswerInput[]): Promise<MockResultDto> {
    const response = await apiClient.post<MockResultDto>(
      `${mockAttemptPath(attemptId)}/submit`,
      answers && answers.length > 0 ? { answers } : {},
      { skipErrorToast: true },
    );
    return unwrapData<MockResultDto>(response);
  },
};
