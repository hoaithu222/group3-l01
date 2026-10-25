import { useQuery } from '@tanstack/react-query';

import { meetingRoomKeys } from '../api/meeting-room.keys';
import { meetingRoomHostService } from '../api/meeting-room-host.service';
import { meetingRoomService } from '../api/meeting-room.service';

/**
 * Chi tiết cuộc họp cho pre-join (`myActions`, giờ mở phòng, `lobbyMode`): KHÔNG dùng lại dữ liệu cũ — quyền/trạng thái đổi theo giờ
 * (chủ trì vừa bắt đầu, phòng vừa khoá), nên `staleTime: 0` và tải lại mỗi lần mở màn. Lỗi nghiệp vụ (404/403) do hook luồng vào xử lý.
 */
export function useMeetingBrief(meetingId: string | undefined) {
  return useQuery({
    enabled: Boolean(meetingId),
    gcTime: 30_000,
    queryFn: () => meetingRoomService.getBrief(meetingId ?? ''),
    queryKey: meetingRoomKeys.brief(meetingId ?? ''),
    refetchOnMount: 'always',
    retry: 1,
    staleTime: 0,
  });
}

/**
 * Ảnh chụp phòng (`GET /meetings/:id/room`): vai trò, `mutedByHost`, số người chờ. Hình ảnh/tiếng lấy TRỰC TIẾP từ `Room` cục bộ — snapshot
 * chỉ bổ sung những gì SDK không biết. `call:participant-updated` vá tại chỗ; nối lại thì `invalidate` (`meeting-room.media-events.ts`).
 */
export function useRoomSnapshot(meetingId: string | null, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(meetingId),
    queryFn: () => meetingRoomService.snapshot(meetingId ?? ''),
    queryKey: meetingRoomKeys.room(meetingId ?? ''),
    retry: 1,
    staleTime: 10_000,
  });
}

/** Hàng chờ của chủ trì/đồng chủ trì — chỉ tải khi có quyền (server 403 với người khác). Socket `meeting:lobby` vá vào store. */
export function useLobbyList(meetingId: string | null, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(meetingId),
    queryFn: () => meetingRoomHostService.listLobby(meetingId ?? ''),
    queryKey: meetingRoomKeys.lobby(meetingId ?? ''),
    retry: 1,
    staleTime: 5_000,
  });
}

/** Người được mời (tab "Được mời" + tên tác giả tin nhắn). Cùng khoá/hình dạng với `MeetingChatSheet` — hai nơi dùng chung một bản cache. */
export function useMeetingAttendees(meetingId: string | null, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(meetingId),
    queryFn: () => meetingRoomService.listAllAttendees(meetingId ?? ''),
    queryKey: meetingRoomKeys.attendees(meetingId ?? ''),
    staleTime: 30_000,
  });
}
