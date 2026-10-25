import { useMutation, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomKeys, MEETINGS_DETAIL_KEY } from '../api/meeting-room.keys';
import { meetingRoomHostService as host } from '../api/meeting-room-host.service';
import type { MuteSource, RoomRole } from '../api/meeting-room.types';
import { meetingRoomApi } from '../store/meeting-room.store';
import { hostActionMessage } from '../utils/meeting-room-errors';

/**
 * Thao tác chủ trì/đồng chủ trì (app.md §4.2): KHÔNG optimistic cho mời ra/khoá — chờ server; lỗi luôn thành toast tiếng Việt qua
 * `hostActionMessage` (`MEET_020` "đã rời phòng", `MEET_019` "không thể với chủ trì"…). Mỗi hook trả một `useMutation` để hàng/nút tự có
 * `isPending`. Thành công thì làm mới ảnh chụp phòng (vai trò/`mutedByHost`/số người chờ).
 */
function useHostAction<TVars, TData = unknown>(
  run: (meetingId: string, vars: TVars) => Promise<TData>,
  after?: (data: TData, vars: TVars) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => {
      const meetingId = meetingRoomApi.get().meetingId;
      if (!meetingId) return Promise.reject(new Error('Chưa ở trong cuộc họp'));
      return run(meetingId, vars);
    },
    onError: (error) => showToast('error', hostActionMessage(error)),
    onSuccess: (data, vars) => {
      after?.(data, vars);
      const meetingId = meetingRoomApi.get().meetingId;
      if (meetingId) void queryClient.invalidateQueries({ queryKey: meetingRoomKeys.room(meetingId) });
    },
  });
}

const dropFromLobby = (userIds: readonly string[]): void =>
  meetingRoomApi.patch({ lobby: meetingRoomApi.get().lobby.filter((entry) => !userIds.includes(entry.userId)) });

export const useAdmitMutation = () =>
  useHostAction((id, userId: string) => host.admit(id, userId), (_data, userId) => dropFromLobby([userId]));

export const useDenyMutation = () =>
  useHostAction((id, userId: string) => host.deny(id, userId), (_data, userId) => dropFromLobby([userId]));

export const useAdmitAllMutation = () =>
  useHostAction((id, _vars: void) => host.admitAll(id), (data) => dropFromLobby(data.admittedUserIds));

export const useLockMutation = () =>
  useHostAction(
    (id, locked: boolean) => host.setLocked(id, locked),
    (data) => {
      meetingRoomApi.patch({ lockedAt: data.lockedAt });
      showToast('success', data.lockedAt ? 'Đã khoá phòng họp. Người mới không vào được nữa.' : 'Đã mở khoá phòng họp.');
    },
  );

export const useMuteMutation = () =>
  useHostAction((id, vars: { source: MuteSource; userId: string }) => host.mute(id, vars.userId, vars.source));

export const useMuteAllMutation = () =>
  useHostAction(
    (id, _vars: void) => host.muteAll(id),
    (data) => showToast('success', data.mutedCount > 0 ? `Đã tắt mic của ${data.mutedCount} người.` : 'Không có ai đang bật mic.'),
  );

export const useRemoveMutation = () => {
  const queryClient = useQueryClient();
  return useHostAction(
    (id, vars: { alsoRemoveAttendee: boolean; userId: string }) => host.remove(id, vars.userId, vars.alsoRemoveAttendee),
    (_data, vars) => {
      showToast('success', 'Đã mời người này ra khỏi cuộc họp.');
      const meetingId = meetingRoomApi.get().meetingId;
      // Gỡ luôn khỏi danh sách mời ⇒ "Được mời" của phòng và số người tham dự ở chi tiết (lịch họp) đổi theo.
      if (!vars.alsoRemoveAttendee || !meetingId) return;
      void queryClient.invalidateQueries({ queryKey: meetingRoomKeys.attendees(meetingId) });
      void queryClient.invalidateQueries({ queryKey: MEETINGS_DETAIL_KEY(meetingId) });
    },
  );
};

export const useSetRoleMutation = () =>
  useHostAction((id, vars: { role: Exclude<RoomRole, 'HOST'>; userId: string }) => host.setRole(id, vars.userId, vars.role));

export const useLowerAllHandsMutation = () =>
  useHostAction((id, _vars: void) => host.lowerAllHands(id), () => showToast('success', 'Đã hạ tay mọi người.'));
