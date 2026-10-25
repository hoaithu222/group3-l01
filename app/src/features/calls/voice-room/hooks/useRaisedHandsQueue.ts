import { useMemo } from 'react';

import type { CallParticipantDto } from '../../api/calls.types';

/**
 * Danh sách đang giơ tay theo THỨ TỰ SERVER (`handRaisedAt` tăng dần) — bất kể thứ tự sự kiện tới máy này hay đồng hồ máy khách
 * lệch thế nào (VR-10). Chỉ người còn trong phòng; cùng mốc thì theo `userId` để thứ tự ổn định giữa các lần vẽ.
 */
export function sortRaisedHands<T extends Pick<CallParticipantDto, 'handRaisedAt' | 'state' | 'userId'>>(participants: readonly T[]): T[] {
  return participants
    .filter((p) => p.handRaisedAt !== null && (p.state === 'CONNECTED' || p.state === 'JOINING' || p.state === 'RECONNECTING'))
    .sort((a, b) => Date.parse(a.handRaisedAt ?? '') - Date.parse(b.handRaisedAt ?? '') || a.userId.localeCompare(b.userId));
}

export function useRaisedHandsQueue<T extends Pick<CallParticipantDto, 'handRaisedAt' | 'state' | 'userId'>>(participants: readonly T[]): T[] {
  return useMemo(() => sortRaisedHands(participants), [participants]);
}
