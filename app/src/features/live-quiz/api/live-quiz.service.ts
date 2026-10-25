import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  LIVE_QUIZ_HISTORY_PATH,
  LIVE_QUIZ_JOIN_PATH,
  LIVE_QUIZ_PATH,
  liveQuizCommandPath,
  liveQuizKickPath,
  liveQuizPath,
  liveQuizResultsPath,
} from './live-quiz.api';
import type { LiveQuizCommand } from './live-quiz.api';
import type {
  CreateLiveQuizPayload,
  CreateLiveQuizResult,
  CursorMeta,
  JoinLiveQuizPayload,
  JoinLiveQuizResult,
  LiveQuizHistoryItemDto,
  LiveQuizHistoryPage,
  LiveQuizResultsDto,
  LiveQuizSnapshot,
} from './live-quiz.types';

/**
 * ⚠️ `skipErrorToast` ở mọi lời gọi: lỗi `QUIZ_*` là NỘI DUNG của màn (hiện tại trường PIN, banner hết giờ…),
 * không phải toast tự tắt — màn tự dịch mã bằng `quizErrorMessage`.
 */
const QUIET = { skipErrorToast: true } as const;

export const liveQuizService = {
  /** `POST /live-quiz` — `Idempotency-Key` theo MỘT lần bấm "Tạo phòng". */
  async create(payload: CreateLiveQuizPayload, idempotencyKey: string): Promise<CreateLiveQuizResult> {
    const response = await apiClient.post(LIVE_QUIZ_PATH, payload, {
      ...QUIET,
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return unwrapData<CreateLiveQuizResult>(response);
  },

  async join(payload: JoinLiveQuizPayload): Promise<JoinLiveQuizResult> {
    const response = await apiClient.post(LIVE_QUIZ_JOIN_PATH, payload, QUIET);
    return unwrapData<JoinLiveQuizResult>(response);
  },

  async get(id: string): Promise<LiveQuizSnapshot> {
    const response = await apiClient.get(liveQuizPath(id), QUIET);
    return unwrapData<LiveQuizSnapshot>(response);
  },

  /** start/next/end/cancel — CAS `expectedVersion`; lệch ⇒ 409 `RES_003`, sai trạng thái ⇒ `QUIZ_007`. */
  async command(id: string, command: LiveQuizCommand, expectedVersion: number): Promise<void> {
    await apiClient.post(liveQuizCommandPath(id, command), { expectedVersion }, QUIET);
  },

  async kick(id: string, userId: string): Promise<void> {
    await apiClient.post(liveQuizKickPath(id), { userId }, QUIET);
  },

  async results(id: string): Promise<LiveQuizResultsDto> {
    const response = await apiClient.get(liveQuizResultsPath(id), QUIET);
    return unwrapData<LiveQuizResultsDto>(response);
  },

  async history(cursor: string | undefined, limit = 20): Promise<LiveQuizHistoryPage> {
    const response = await apiClient.get<{ data: LiveQuizHistoryItemDto[]; meta: CursorMeta }>(
      LIVE_QUIZ_HISTORY_PATH,
      { params: { cursor, limit }, ...QUIET },
    );
    return { items: response.data.data, meta: response.data.meta };
  },
};
