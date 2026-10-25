import { useEffect } from 'react';

import type { AttendeeLite, LobbyEntry, MuteSource, RoomRole } from '../api/meeting-room.types';
import {
  useAdmitAllMutation,
  useAdmitMutation,
  useDenyMutation,
  useLockMutation,
  useLowerAllHandsMutation,
  useMuteAllMutation,
  useMuteMutation,
  useRemoveMutation,
  useSetRoleMutation,
} from '../queries/meeting-room.mutations';
import { useLowerHandMutation } from '../queries/meeting-room-hand.mutations';
import { useLobbyList, useMeetingAttendees } from '../queries/meeting-room.queries';
import { meetingRoomApi, useMeetingRoomStore } from '../store/meeting-room.store';

export interface MeetingHostControls {
  attendees: AttendeeLite[];
  /** Đang chạy thao tác hàng loạt (tắt mic tất cả/hạ tay/cho tất cả vào). */
  bulkPending: boolean;
  hostLike: boolean;
  isHost: boolean;
  lobby: LobbyEntry[];
  lockedAt: string | null;
  lockPending: boolean;
  /** Người đang được duyệt/từ chối (loading từng hàng ở `LobbyPanel`). */
  pendingUserIds: string[];
  admit: (userId: string) => void;
  admitAll: () => void;
  /** Chỉ CHỦ TRÌ cấp/thu đồng chủ trì, và chỉ với người KHÔNG phải chủ trì/đồng chủ trì THEO LỊCH (vai trò lịch là của p2-04, không đổi trong phòng). */
  canChangeRole: (userId: string) => boolean;
  deny: (userId: string) => void;
  lowerAllHands: () => void;
  /** Đang chạy "Hạ tay tất cả" (riêng — `bulkPending` gộp cả cho tất cả vào/tắt mic tất cả). */
  lowerAllPending: boolean;
  /** Hạ tay MỘT người (người đó nhận `HAND_LOWERED`). Chính mình thì dùng nút Giơ tay của mình, không qua đây. */
  lowerHand: (userId: string) => void;
  /** Người đang được hạ tay (loading đúng hàng ở danh sách "Đang giơ tay"). */
  loweringUserId: string | null;
  mute: (userId: string, source: MuteSource) => void;
  muteAll: () => void;
  removeParticipant: (userId: string, alsoRemoveAttendee: boolean) => void;
  setRole: (userId: string, role: Exclude<RoomRole, 'HOST'>) => void;
  toggleLock: () => void;
}

/**
 * Gói các thao tác chủ trì/đồng chủ trì (app.md §2 `useMeetingHostControls`). Người thường không kích hoạt truy vấn nào (`hostLike` false ⇒ không
 * gọi `GET /lobby`, `GET /attendees`); server vẫn là nơi quyết quyền (403 → toast). Danh sách chờ: tải một lần khi vào phòng rồi socket
 * `meeting:lobby` vá vào store.
 */
export function useMeetingHostControls(): MeetingHostControls {
  const meetingId = useMeetingRoomStore((state) => state.meetingId);
  const role = useMeetingRoomStore((state) => state.role);
  const phase = useMeetingRoomStore((state) => state.phase);
  const lobby = useMeetingRoomStore((state) => state.lobby);
  const lockedAt = useMeetingRoomStore((state) => state.lockedAt);
  const hostLike = role === 'HOST' || role === 'CO_HOST';
  const active = hostLike && (phase === 'IN_ROOM' || phase === 'RECONNECTING');

  const lobbyList = useLobbyList(meetingId, active).data;
  const attendees = useMeetingAttendees(meetingId, active).data ?? [];
  useEffect(() => {
    if (lobbyList) meetingRoomApi.patch({ lobby: lobbyList });
  }, [lobbyList]);

  const admit = useAdmitMutation();
  const admitAll = useAdmitAllMutation();
  const deny = useDenyMutation();
  const lock = useLockMutation();
  const lowerAll = useLowerAllHandsMutation();
  const lowerOne = useLowerHandMutation();
  const mute = useMuteMutation();
  const muteAll = useMuteAllMutation();
  const remove = useRemoveMutation();
  const setRole = useSetRoleMutation();

  const pendingUserIds: string[] = [];
  if (admit.isPending && admit.variables) pendingUserIds.push(admit.variables);
  if (deny.isPending && deny.variables) pendingUserIds.push(deny.variables);

  return {
    admit: (userId) => admit.mutate(userId),
    admitAll: () => admitAll.mutate(),
    attendees,
    bulkPending: admitAll.isPending || lowerAll.isPending || muteAll.isPending,
    canChangeRole: (userId) => {
      const scheduled = attendees.find((a) => a.userId === userId)?.role;
      return role === 'HOST' && scheduled !== 'HOST' && scheduled !== 'CO_HOST';
    },
    deny: (userId) => deny.mutate(userId),
    hostLike,
    isHost: role === 'HOST',
    lobby,
    lockedAt,
    lockPending: lock.isPending,
    lowerAllHands: () => lowerAll.mutate(),
    lowerAllPending: lowerAll.isPending,
    lowerHand: (userId) => lowerOne.mutate(userId),
    loweringUserId: lowerOne.isPending ? (lowerOne.variables ?? null) : null,
    mute: (userId, source) => mute.mutate({ source, userId }),
    muteAll: () => muteAll.mutate(),
    pendingUserIds,
    removeParticipant: (userId, alsoRemoveAttendee) => remove.mutate({ alsoRemoveAttendee, userId }),
    setRole: (userId, next) => setRole.mutate({ role: next, userId }),
    toggleLock: () => lock.mutate(!lockedAt),
  };
}
