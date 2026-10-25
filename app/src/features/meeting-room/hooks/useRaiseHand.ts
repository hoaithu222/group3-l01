import { useMeetingRoomStore } from '../store/meeting-room.store';
import { toggleHand } from './meeting-room.hand';

/**
 * Giơ tay = attribute `handRaisedAt` (ISO theo GIỜ SERVER) của CHÍNH MÌNH trên LiveKit — người khác thấy qua `ParticipantAttributesChanged`,
 * chủ trì hạ tay qua `call:host-action` (`LOWER_ALL_HANDS` · `HAND_LOWERED`). `raised` đổi NGAY khi bấm; chờ LiveKit xác nhận, bấm dồn,
 * mạng chậm (không hoàn lại mù quáng) do `meeting-room.hand.ts` lo — snapshot media không còn bật nút ngược lại giữa chừng.
 */
export function useRaiseHand(): { raised: boolean; toggle: () => Promise<void> } {
  const raised = useMeetingRoomStore((state) => state.handRaisedAt !== null);
  return { raised, toggle: toggleHand };
}
