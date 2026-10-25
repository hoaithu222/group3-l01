import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { callActionPath } from '../../api/calls.api';
import type { CallDto } from '../../api/calls.types';
import { callHostPath, channelVoicePath } from './voice-room.api';
import type { HostAction, HostActionPayload, LeaveRoomPayload, VoicePreview } from './voice-room.types';

/**
 * `skipErrorToast`: mã `CALL_*` là NỘI DUNG của luồng (hộp thoại/nhãn tại chỗ), không phải toast — xem `calls.service.ts`.
 */
const QUIET = { skipErrorToast: true } as const;

export const voiceRoomService = {
  /** `GET /channels/:id/voice` — chỉ XEM: không tạo phiên, không cấp token, không xin quyền (VR-01). */
  async getPreview(channelId: string): Promise<VoicePreview> {
    return unwrapData<VoicePreview>(await apiClient.get(channelVoicePath(channelId), QUIET));
  },

  /** Giơ/hạ tay — idempotent; thứ tự hàng đợi theo giờ SERVER (`handRaisedAt`). */
  async setHand(callId: string, raised: boolean): Promise<void> {
    await apiClient.post(callActionPath(callId, 'hand'), { raised }, QUIET);
  },

  /** Thao tác của chủ phòng; trả `call` mới (`version` đã tăng). */
  async hostAction(callId: string, action: HostAction, payload: HostActionPayload): Promise<CallDto> {
    const response = await apiClient.post(callHostPath(callId, action), payload, QUIET);
    return unwrapData<{ call: CallDto }>(response).call;
  },

  /** Rời phòng; chủ phòng kèm `transferToUserId`/`endForEveryone` (thân rỗng vẫn hợp lệ). */
  async leaveRoom(callId: string, payload: LeaveRoomPayload = {}): Promise<CallDto> {
    const response = await apiClient.post(callActionPath(callId, 'leave'), payload, QUIET);
    return unwrapData<{ call: CallDto }>(response).call;
  },
};
