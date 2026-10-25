import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  POMODORO_HISTORY_PATH,
  callLeavePath,
  callTokenPath,
  pomodoroCommandPath,
  pomodoroConfigPath,
  pomodoroGoalPath,
  pomodoroJoinPath,
  pomodoroPath,
  pomodoroResultPath,
} from './pomodoro.api';
import type {
  PomodoroCommandBody,
  PomodoroCommandKind,
  PomodoroConfigPayload,
  PomodoroGoalPayload,
  PomodoroHistoryItem,
  PomodoroHistoryPage,
  PomodoroJoinResult,
  PomodoroSessionResult,
  PomodoroSnapshot,
  PomodoroTokenResult,
  CursorMeta,
} from './pomodoro.types';

/**
 * ⚠️ `skipErrorToast` ở mọi lời gọi: lỗi `CALL_POMO_*`/`RES_003` là NỘI DUNG của màn (toast "Phiên vừa thay đổi", dòng lỗi
 * trong tấm cấu hình…) — màn tự dịch mã bằng `pomodoroErrorMessage`, interceptor không toast thêm lần nữa.
 */
const QUIET = { skipErrorToast: true } as const;

export const pomodoroService = {
  /** `GET /channels/:id/pomodoro` — preview + phòng (WAITING ảo `version = 0` khi kênh chưa có phiên). */
  async getSnapshot(channelId: string): Promise<PomodoroSnapshot> {
    const response = await apiClient.get(pomodoroPath(channelId), QUIET);
    return unwrapData<PomodoroSnapshot>(response);
  },

  /** start/pause/resume/skip/end — CAS `expectedVersion` + `commandId` idempotent (cùng id gửi lại trả cùng kết quả). */
  async command(channelId: string, kind: PomodoroCommandKind, body: PomodoroCommandBody): Promise<PomodoroSnapshot> {
    const response = await apiClient.post(pomodoroCommandPath(channelId, kind), body, QUIET);
    return unwrapData<PomodoroSnapshot>(response);
  },

  async updateConfig(channelId: string, payload: PomodoroConfigPayload): Promise<PomodoroSnapshot> {
    const response = await apiClient.patch(pomodoroConfigPath(channelId), payload, QUIET);
    return unwrapData<PomodoroSnapshot>(response);
  },

  async setGoal(channelId: string, payload: PomodoroGoalPayload): Promise<{ goal: string; shared: boolean }> {
    const response = await apiClient.put(pomodoroGoalPath(channelId), payload, QUIET);
    return unwrapData<{ goal: string; shared: boolean }>(response);
  },

  /** "Vào học" — mở phiên WAITING nếu kênh chưa có, tạo/vào phòng media, trả token với quyền publish THEO PHASE hiện tại. */
  async join(channelId: string, deviceId: string, force = false): Promise<PomodoroJoinResult> {
    const response = await apiClient.post(pomodoroJoinPath(channelId), { deviceId, force }, QUIET);
    return unwrapData<PomodoroJoinResult>(response);
  },

  /** Rời phòng — endpoint của lõi `calls` (theo `callId`); idempotent. */
  async leave(callId: string): Promise<void> {
    await apiClient.post(callLeavePath(callId), {}, QUIET);
  },

  /** Token có TTL ngắn (chỉ để KẾT NỐI) — lần thử kết nối sau xin token mới. */
  async renewToken(callId: string): Promise<PomodoroTokenResult> {
    const response = await apiClient.post(callTokenPath(callId), {}, QUIET);
    return unwrapData<PomodoroTokenResult>(response);
  },

  async sessionResult(channelId: string, sessionId: string): Promise<PomodoroSessionResult> {
    const response = await apiClient.get(pomodoroResultPath(channelId, sessionId), QUIET);
    return unwrapData<PomodoroSessionResult>(response);
  },

  async history(cursor: string | undefined, limit = 20): Promise<PomodoroHistoryPage> {
    const response = await apiClient.get<{ data: PomodoroHistoryItem[]; meta: CursorMeta }>(POMODORO_HISTORY_PATH, {
      params: { cursor, limit },
      ...QUIET,
    });
    return { items: response.data.data, meta: response.data.meta };
  },
};
