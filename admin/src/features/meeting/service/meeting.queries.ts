import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

import { extractErrorCode } from '@/core/api/error.handler';
import { auditLogKeys } from '@/features/audit-log';
import { showErrorToast, showToast } from '@/shared/utils/toast.utils';

import {
  CALL_STATS_STALE_MS,
  LIST_STALE_MS,
  MEDIA_HEALTH_REFRESH_MS,
} from '../constants/meeting.constants';
import type { AdminCallListParams, CallStatsParams } from '../types/call.types';
import type { AdminMeetingListParams } from '../types/meeting.types';
import { meetingService } from './meeting.service';

/**
 * Query key của phân hệ `meeting` (admin.md p2-07 §3). `all` là gốc để một lần `invalidate` làm mới mọi thứ; `calls` gom danh sách + chi tiết +
 * thống kê cuộc gọi (socket `admin:media-updated kind=CALL`). Bản ghi hình dùng key của `features/workspace` (`workspaceRecordingsKeys`).
 */
export const meetingKeys = {
  all: ['meeting'] as const,
  meetingList: ['meeting', 'list'] as const,
  list: (params: AdminMeetingListParams) => ['meeting', 'list', params] as const,
  detail: (meetingId: string) => ['meeting', 'detail', meetingId] as const,
  calls: ['meeting', 'calls'] as const,
  callList: (params: AdminCallListParams) => ['meeting', 'calls', 'list', params] as const,
  callDetail: (callId: string) => ['meeting', 'calls', 'detail', callId] as const,
  callStats: (params: CallStatsParams) => ['meeting', 'calls', 'stats', params] as const,
  health: ['meeting', 'media-health'] as const,
};

/**
 * Danh sách cuộc họp toàn nền tảng. Đổi trang/lọc giữ bảng cũ mờ đi thay vì nháy trắng (`keepPreviousData`); `retry: false` — lỗi thật (403,
 * 404 `CFG_005` khi cờ tắt giữa chừng) không nên thử lại lặp.
 */
export const useAdminMeetings = (params: AdminMeetingListParams) =>
  useQuery({
    queryKey: meetingKeys.list(params),
    queryFn: () => meetingService.listMeetings(params),
    placeholderData: keepPreviousData,
    staleTime: LIST_STALE_MS,
    retry: false,
  });

/** Chi tiết một cuộc họp cho ngăn kéo (mở thẳng được từ `?id=`). */
export const useAdminMeeting = (meetingId: string | undefined) =>
  useQuery({
    queryKey: meetingKeys.detail(meetingId ?? ''),
    queryFn: () => meetingService.meeting(meetingId as string),
    select: (res) => res.data,
    enabled: !!meetingId,
    staleTime: LIST_STALE_MS,
    retry: false,
  });

export const useAdminCalls = (params: AdminCallListParams) =>
  useQuery({
    queryKey: meetingKeys.callList(params),
    queryFn: () => meetingService.listCalls(params),
    placeholderData: keepPreviousData,
    staleTime: LIST_STALE_MS,
    retry: false,
  });

export const useAdminCall = (callId: string | undefined) =>
  useQuery({
    queryKey: meetingKeys.callDetail(callId ?? ''),
    queryFn: () => meetingService.call(callId as string),
    select: (res) => res.data,
    enabled: !!callId,
    staleTime: LIST_STALE_MS,
    retry: false,
  });

/** Thống kê cuộc gọi. Cache 5 phút — khớp cache Redis phía BE (`statsCacheSeconds`), gọi lại sớm hơn chỉ nhận cùng kết quả. */
export const useCallStats = (params: CallStatsParams) =>
  useQuery({
    queryKey: meetingKeys.callStats(params),
    queryFn: () => meetingService.callStats(params),
    select: (res) => res.data,
    placeholderData: keepPreviousData,
    staleTime: CALL_STATS_STALE_MS,
    retry: false,
  });

/** Sức khoẻ hạ tầng media — tự làm mới ~15 giây (cache BE 15 giây); refetch lỗi giữ số liệu cũ thay vì thay bằng khối lỗi. */
export const useMediaHealth = () =>
  useQuery({
    queryKey: meetingKeys.health,
    queryFn: () => meetingService.mediaHealth(),
    select: (res) => res.data,
    staleTime: MEDIA_HEALTH_REFRESH_MS,
    refetchInterval: MEDIA_HEALTH_REFRESH_MS,
    retry: false,
  });

/**
 * Kết thúc cưỡng bức cuộc họp (`POST …/force-end` → 202, xử lý qua outbox nên trạng thái đổi sau vài giây và về bảng bằng socket).
 * `MEET_009` (không còn LIVE) là ca "đã đổi ở nơi khác" — báo nhẹ + làm mới, nơi gọi tự đóng hộp thoại. Lỗi khác toast thông điệp BE. Thành công hay
 * lỗi đều làm mới chi tiết/danh sách/nhật ký (ngăn kéo hiện dòng `meeting.force-end` vừa ghi).
 */
export const useForceEndMeeting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: meetingService.forceEndMeeting,
    onSuccess: () => showToast('success', 'Đã gửi yêu cầu kết thúc — cập nhật trong vài giây'),
    onError: (err) => {
      if (extractErrorCode(err as AxiosError) === 'MEET_009') {
        showToast('warning', 'Cuộc họp không còn diễn ra');
      } else {
        showErrorToast(err, 'Không kết thúc được cuộc họp');
      }
    },
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: meetingKeys.detail(vars.id) });
      void qc.invalidateQueries({ queryKey: meetingKeys.meetingList });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};

/**
 * Kết thúc cưỡng bức cuộc gọi. `ADMIN_MEDIA_002` (cuộc gọi của một cuộc họp) KHÔNG toast ở đây: nơi gọi hiện khung "Mở cuộc họp" kèm
 * `details.meetingId`. `CALL_005` (đã kết thúc) báo bằng thông điệp BE rồi làm mới.
 */
export const useForceEndCall = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: meetingService.forceEndCall,
    onSuccess: () => showToast('success', 'Đã gửi yêu cầu kết thúc — cập nhật trong vài giây'),
    onError: (err) => {
      if (extractErrorCode(err as AxiosError) !== 'ADMIN_MEDIA_002') {
        showErrorToast(err, 'Không kết thúc được cuộc gọi');
      }
    },
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: meetingKeys.callDetail(vars.id) });
      void qc.invalidateQueries({ queryKey: meetingKeys.calls });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};
