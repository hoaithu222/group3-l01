import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  meetingRecordingsPath,
  recapAttachmentPath,
  recapAttachmentsPath,
  recapPath,
  recapPublishPath,
  recordingPath,
  recordingRetryPath,
  recordingUrlPath,
} from './meeting-recap.api';
import type { RecapDto, RecordingDto, RecordingUrl, RecordingUrlPurpose, UpsertRecapBody } from './meeting-recap.types';

/**
 * `skipErrorToast`: lỗi của biên bản/bản ghi là NỘI DUNG màn (409 `RES_003` → khối "Bản của bạn", `MEET_022` tại khu tệp, `MEET_023`
 * tại ô nội dung, 404 → "không còn khả dụng"), không phải toast tự tắt — màn tự hiện đúng chỗ.
 */
const QUIET = { skipErrorToast: true } as const;

export const meetingRecapService = {
  async get(meetingId: string): Promise<RecapDto> {
    return unwrapData<RecapDto>(await apiClient.get(recapPath(meetingId), QUIET));
  },

  async upsert(meetingId: string, body: UpsertRecapBody): Promise<RecapDto> {
    return unwrapData<RecapDto>(await apiClient.put(recapPath(meetingId), body, QUIET));
  },

  async publish(meetingId: string, expectedVersion: number): Promise<RecapDto> {
    return unwrapData<RecapDto>(await apiClient.post(recapPublishPath(meetingId), { expectedVersion }, QUIET));
  },

  /** Asset phải READY, scope `MEETING`, của CHÍNH mình — BE trả `RecapDto` mới (`version` tăng). */
  async attach(meetingId: string, assetId: string): Promise<RecapDto> {
    return unwrapData<RecapDto>(await apiClient.post(recapAttachmentsPath(meetingId), { assetId }, QUIET));
  },

  async detach(meetingId: string, assetId: string): Promise<RecapDto> {
    return unwrapData<RecapDto>(await apiClient.delete(recapAttachmentPath(meetingId, assetId), QUIET));
  },
};

export const meetingRecordingService = {
  async list(meetingId: string): Promise<RecordingDto[]> {
    return unwrapData<RecordingDto[]>(await apiClient.get(meetingRecordingsPath(meetingId), QUIET));
  },

  async get(recordingId: string): Promise<RecordingDto> {
    return unwrapData<RecordingDto>(await apiClient.get(recordingPath(recordingId), QUIET));
  },

  /** KHÔNG cache (app.md §4.1): gọi mỗi lần mở player/tải về — URL ký có hạn, thu hồi quyền phải có hiệu lực. */
  async url(recordingId: string, purpose: RecordingUrlPurpose): Promise<RecordingUrl> {
    return unwrapData<RecordingUrl>(await apiClient.get(recordingUrlPath(recordingId), { params: { purpose }, ...QUIET }));
  },

  /** 204. `reason` bắt buộc (≥ 10 ký tự) khi OWNER workspace không phải chủ trì xoá — BE quyết, app chỉ hỏi khi được yêu cầu. */
  async remove(recordingId: string, reason?: string): Promise<void> {
    await apiClient.delete(recordingPath(recordingId), { params: reason ? { reason } : undefined, ...QUIET });
  },

  async retryImport(recordingId: string): Promise<RecordingDto> {
    return unwrapData<RecordingDto>(await apiClient.post(recordingRetryPath(recordingId), {}, QUIET));
  },
};
