import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminCallDetail,
  AdminCallListParams,
  AdminCallRow,
  CallStats,
  CallStatsParams,
} from '../types/call.types';
import type { MediaHealth } from '../types/media-health.types';
import type {
  AdminMeetingDetail,
  AdminMeetingListParams,
  AdminMeetingRow,
} from '../types/meeting.types';
import { meetingApi } from './meeting.api';

/**
 * Bảng/ngăn kéo/khối tự vẽ trạng thái lỗi (403, 404 `CFG_005` khi cờ tắt giữa chừng là ca bình thường) — interceptor toast thêm là hai thông báo
 * cho một lỗi.
 */
const OWN_ERROR_UI = { skipErrorToast: true } as RequestConfig;
/** Kết thúc cưỡng bức: `MEET_009`/`CALL_005`/`ADMIN_MEDIA_002` có cách báo riêng ở hộp thoại (`useForceEnd*`), nên bỏ toast mặc định. */
const FORCE_END_UI = { skipErrorToast: true } as RequestConfig;

export interface ForceEndInput {
  id: string;
  reason: string;
}

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const meetingService = {
  listMeetings: async (params: AdminMeetingListParams): Promise<ApiResponse<AdminMeetingRow[]>> =>
    (
      await apiClient.get<ApiResponse<AdminMeetingRow[]>>(meetingApi.meetings, {
        params,
        ...OWN_ERROR_UI,
      } as RequestConfig)
    ).data,

  meeting: async (meetingId: string): Promise<ApiResponse<AdminMeetingDetail>> =>
    (
      await apiClient.get<ApiResponse<AdminMeetingDetail>>(
        meetingApi.meeting(meetingId),
        OWN_ERROR_UI,
      )
    ).data,

  forceEndMeeting: async ({ id, reason }: ForceEndInput): Promise<void> => {
    await apiClient.post(meetingApi.meetingForceEnd(id), { reason }, FORCE_END_UI);
  },

  listCalls: async (params: AdminCallListParams): Promise<ApiResponse<AdminCallRow[]>> =>
    (
      await apiClient.get<ApiResponse<AdminCallRow[]>>(meetingApi.calls, {
        params,
        ...OWN_ERROR_UI,
      } as RequestConfig)
    ).data,

  call: async (callId: string): Promise<ApiResponse<AdminCallDetail>> =>
    (await apiClient.get<ApiResponse<AdminCallDetail>>(meetingApi.call(callId), OWN_ERROR_UI)).data,

  callStats: async (params: CallStatsParams): Promise<ApiResponse<CallStats>> =>
    (
      await apiClient.get<ApiResponse<CallStats>>(meetingApi.callStats, {
        params,
        ...OWN_ERROR_UI,
      } as RequestConfig)
    ).data,

  forceEndCall: async ({ id, reason }: ForceEndInput): Promise<void> => {
    await apiClient.post(meetingApi.callForceEnd(id), { reason }, FORCE_END_UI);
  },

  mediaHealth: async (): Promise<ApiResponse<MediaHealth>> =>
    (await apiClient.get<ApiResponse<MediaHealth>>(meetingApi.mediaHealth, OWN_ERROR_UI)).data,
};
