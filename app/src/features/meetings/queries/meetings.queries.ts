import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { meetingsKeys } from '../api/meetings.keys';
import { meetingsLookupService } from '../api/meetings-lookup.service';
import { meetingsService } from '../api/meetings.service';
import type { MeetingRangeParams } from '../api/meetings.types';

/**
 * Lịch trong khoảng `from..to` — luôn qua `GET /me/meetings` (`scope=MINE` = cuộc họp tôi tham dự; `ALL_VISIBLE` = thêm cuộc
 * họp WORKSPACE tôi được thấy; `workspaceId` lọc theo nhóm). `staleTime` 30 s (README p2-04 §4.1); socket `meeting:*` làm mới.
 */
export function useMeetingsRange(params: MeetingRangeParams, enabled = true) {
  return useQuery({
    enabled,
    // Giữ dữ liệu tuần trước trong lúc tuần mới đang tải — vuốt tuần không nháy trống.
    placeholderData: (previous) => previous,
    queryFn: () => meetingsService.listMine(params),
    queryKey: meetingsKeys.range(params),
    staleTime: 30_000,
  });
}

/** Chi tiết + `myActions` (nguồn sự thật của mọi nút). `staleTime` 30 s. */
export function useMeetingDetail(meetingId: string | undefined) {
  return useQuery({
    enabled: Boolean(meetingId),
    queryFn: () => meetingsService.get(meetingId ?? ''),
    queryKey: meetingsKeys.detail(meetingId ?? ''),
    staleTime: 30_000,
  });
}

/** Danh sách người tham dự (cursor) — chỉ tải khi người xem được xem danh sách (`!isMetadataOnly`). */
export function useMeetingAttendees(meetingId: string | undefined, enabled = true) {
  return useInfiniteQuery({
    enabled: enabled && Boolean(meetingId),
    queryKey: meetingsKeys.attendees(meetingId ?? ''),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      meetingsService.listAttendees(meetingId ?? '', pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    staleTime: 30_000,
  });
}

/** Giải mã họp (`m/<code>`): KHÔNG cache (`staleTime: 0`, `gcTime` ngắn) — quyền/trạng thái đổi theo giờ, không được dùng kết quả cũ. */
export function useResolveMeetingCode(code: string | undefined) {
  return useQuery({
    enabled: Boolean(code),
    gcTime: 5_000,
    queryFn: () => meetingsService.resolve(code ?? ''),
    queryKey: meetingsKeys.resolve(code ?? ''),
    retry: 1,
    staleTime: 0,
  });
}

/** Nhóm của tôi — chọn nhóm khi tạo họp từ tab Lịch. */
export function useMyWorkspacesForMeetings(enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => meetingsLookupService.listMyWorkspaces(),
    queryKey: meetingsKeys.workspaces,
    // 0: nhóm của tôi đổi ở feature KHÁC (tham gia/rời/đổi tên) mà không ai làm mới khoá riêng này — mở tờ chọn là tải lại nền.
    staleTime: 0,
  });
}

/** Tìm thành viên nhóm để mời (q rỗng = 50 người đầu). */
export function useWorkspaceMemberSearch(workspaceId: string | undefined, q: string) {
  return useQuery({
    enabled: Boolean(workspaceId),
    queryFn: () => meetingsLookupService.searchWorkspaceMembers(workspaceId ?? '', q.trim()),
    queryKey: meetingsKeys.members(workspaceId ?? '', q.trim()),
    staleTime: 30_000,
  });
}
