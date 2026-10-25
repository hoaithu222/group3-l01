import type { QueryClient } from '@tanstack/react-query';

import { meetingsKeys } from '../api/meetings.keys';
import type { MeetingDetailDto, MeetingListItemDto, MeetingRsvp } from '../api/meetings.types';

/**
 * Vá cache `meetings` — hàm THUẦN theo `QueryClient` (không React) để socket + mutation dùng CHUNG một cách vá, và để không phải
 * refetch cả tuần khi chỉ đổi RSVP/huỷ. Mọi list ở khoá `meetings/range/*` là MẢNG `MeetingListItemDto` (BE trả mảng thuần).
 */

type ListPatch = (item: MeetingListItemDto) => MeetingListItemDto | null;

/** Vá một cuộc họp trong MỌI cửa sổ lịch đã cache; trả `null` từ `patch` = loại khỏi danh sách. */
export function patchRanges(queryClient: QueryClient, meetingId: string, patch: ListPatch): void {
  queryClient.setQueriesData<MeetingListItemDto[]>({ queryKey: meetingsKeys.ranges() }, (old) => {
    if (!old) return old;
    return old.flatMap((item) => {
      if (item.id !== meetingId) return [item];
      const next = patch(item);
      return next ? [next] : [];
    });
  });
}

export function patchDetail(
  queryClient: QueryClient,
  meetingId: string,
  patch: (detail: MeetingDetailDto) => MeetingDetailDto,
): void {
  queryClient.setQueryData<MeetingDetailDto>(meetingsKeys.detail(meetingId), (old) =>
    old ? patch(old) : old,
  );
}

/** Đổi RSVP của mình: `myRsvp` + đếm tổng hợp (giảm nhãn cũ, tăng nhãn mới; không xuống dưới 0). */
export function withRsvp(detail: MeetingDetailDto, next: MeetingRsvp): MeetingDetailDto {
  const previous = detail.myRsvp;
  if (previous === next) return detail;
  const summary = { ...detail.rsvpSummary };
  if (previous) summary[previous] = Math.max(0, (summary[previous] ?? 0) - 1);
  summary[next] = (summary[next] ?? 0) + 1;
  return { ...detail, myRsvp: next, rsvpSummary: summary };
}

/** Sau mutation thành công: ghi bản chi tiết mới (server trả `myActions` mới) + làm mới mọi cửa sổ lịch. */
export function applyMeetingDetail(queryClient: QueryClient, detail: MeetingDetailDto): void {
  queryClient.setQueryData(meetingsKeys.detail(detail.id), detail);
  void queryClient.invalidateQueries({ queryKey: meetingsKeys.ranges() });
  // Tiêu đề ở đầu màn biên bản/bản ghi dùng khoá RIÊNG của `meeting-recap` (`meeting-title.queries.ts`, `staleTime` 5 phút) —
  // sửa tên xong mở biên bản vẫn tên cũ nếu không làm mới. Ghi tay vì không import chéo feature.
  void queryClient.invalidateQueries({ queryKey: ['meetings', 'recap-title', detail.id] });
}

/** Xoá dấu vết một cuộc họp khỏi cache (bị loại khỏi danh sách/xoá) — lịch không còn hiện, chi tiết không còn mở được. */
export function forgetMeeting(queryClient: QueryClient, meetingId: string): void {
  patchRanges(queryClient, meetingId, () => null);
  queryClient.removeQueries({ queryKey: meetingsKeys.detail(meetingId) });
  queryClient.removeQueries({ queryKey: meetingsKeys.attendees(meetingId) });
}
