import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  recordingConsentPath,
  recordingConsentRequestPath,
  recordingConsentStatusPath,
  recordingStartPath,
  recordingStopPath,
} from './meeting-room.api';
import type { ConsentStatus, RoomRecordingStatus } from './meeting-room.types';

/** `skipErrorToast`: `REC_001` (còn người chưa đồng ý), `REC_008` (yêu cầu hết hạn)… là NỘI DUNG của tấm/hộp thoại, không phải toast chung. */
const QUIET = { skipErrorToast: true } as const;

/** Phần `RecordingDto` phòng họp cần sau khi bắt đầu/dừng (danh sách/phát bản ghi thuộc `features/meeting-recap`). */
export interface StartedRecording {
  id: string;
  startedAt: string;
  status: RoomRecordingStatus;
}

/** Ghi hình TRONG PHÒNG (p2-06 be.md §4): hỏi ý kiến → trả lời → tiến độ → bắt đầu → dừng. */
export const meetingRoomRecordingService = {
  /** Chủ trì/đồng chủ trì hỏi ý kiến cả phòng (người hỏi tự đồng ý) — hết hạn sau `consentRequestTtlSeconds` (120 s). */
  async requestConsent(meetingId: string): Promise<{ expiresAt: string; pendingCount: number; requestId: string }> {
    return unwrapData(await apiClient.post(recordingConsentRequestPath(meetingId), {}, QUIET));
  },

  /** Trả lời: `requestId` bỏ trống = người vào SAU khi bản ghi đã chạy (đồng ý → được bật mic/camera). */
  async respond(meetingId: string, accept: boolean, requestId?: string): Promise<{ accepted: boolean; canPublish: boolean }> {
    return unwrapData(await apiClient.post(recordingConsentPath(meetingId), requestId ? { accept, requestId } : { accept }, QUIET));
  },

  async consentStatus(meetingId: string): Promise<ConsentStatus> {
    return unwrapData<ConsentStatus>(await apiClient.get(recordingConsentStatusPath(meetingId), QUIET));
  },

  async start(meetingId: string, requestId: string): Promise<StartedRecording> {
    return unwrapData<StartedRecording>(await apiClient.post(recordingStartPath(meetingId), { layout: 'GRID', requestId }, QUIET));
  },

  /** Idempotent ở BE (đã dừng/đang xử lý → trả trạng thái hiện tại). */
  async stop(recordingId: string): Promise<StartedRecording> {
    return unwrapData<StartedRecording>(await apiClient.post(recordingStopPath(recordingId), {}, QUIET));
  },
};
