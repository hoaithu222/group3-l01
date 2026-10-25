import { useMemo } from 'react';

import type { RoomSnapshot } from '../api/meeting-room.types';
import { useRoomSnapshot } from '../queries/meeting-room.queries';
import { useMeetingRoomStore } from '../store/meeting-room.store';
import { mergePeople, sortForStage, type RoomPerson } from '../utils/room-people.utils';

export interface MeetingPeople {
  /** Đã sắp theo thứ tự ô trong lưới: ghim → đang nói → giơ tay → camera bật → vào trước. */
  ordered: RoomPerson[];
  snapshot: RoomSnapshot | undefined;
}

/**
 * Người trong phòng cho UI = GHÉP media (tức thời: tên, mic, camera, người nói, giơ tay) với ảnh chụp server (vai trò, `mutedByHost`). Ảnh chụp
 * KHÔNG ghi store (đối soát vai trò/khoá phòng do `refreshRoomSnapshot` ở controller lo — nếu hook này ghi theo mỗi lần snapshot đổi thì bản vá
 * tại chỗ từ socket sẽ bị bản chụp cũ đè lại).
 */
export function useMeetingPeople(enabled: boolean): MeetingPeople {
  const meetingId = useMeetingRoomStore((state) => state.meetingId);
  const participants = useMeetingRoomStore((state) => state.participants);
  const pinnedUserId = useMeetingRoomStore((state) => state.pinnedUserId);
  const snapshot = useRoomSnapshot(meetingId, enabled).data;

  const ordered = useMemo(
    () => sortForStage(mergePeople(participants, snapshot?.participants ?? []), pinnedUserId),
    [participants, pinnedUserId, snapshot?.participants],
  );
  return { ordered, snapshot };
}
