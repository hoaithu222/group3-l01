import { useCallback, useRef } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import { REACTION_THROTTLE_MS } from '../constants/meeting-room.constants';
import { getMeetingMedia } from '../media/meeting-media.registry';
import { meetingRoomApi, useMeetingRoomStore, type FloatingReaction } from '../store/meeting-room.store';

export interface MeetingReactions {
  reactions: FloatingReaction[];
  drop: (id: string) => void;
  nameOf: (identity: string) => string;
  send: (emoji: string) => Promise<void>;
}

/**
 * Cảm xúc (data topic `meeting.reaction`): gửi tối đa 1 lần/giây/người (app.md §2); LiveKit KHÔNG phát lại cho người gửi nên tự thêm bản
 * cục bộ. Nhận từ người khác đã vào store ở `meeting-room.media-events.ts` (chỉ emoji trong danh sách cho phép). Mất gói không đáng báo lỗi.
 */
export function useMeetingReactions(): MeetingReactions {
  const reactions = useMeetingRoomStore((state) => state.reactions);
  const meId = useAuthStore((state) => state.user?.id ?? 'me');
  const lastSentAt = useRef(0);

  const send = useCallback(
    async (emoji: string) => {
      const now = Date.now();
      if (now - lastSentAt.current < REACTION_THROTTLE_MS) return;
      lastSentAt.current = now;
      meetingRoomApi.addReaction({ at: now, emoji, id: `${meId}:${now}`, identity: meId });
      await getMeetingMedia().sendReaction(emoji).catch(() => undefined);
    },
    [meId],
  );

  const nameOf = useCallback(
    (identity: string) =>
      identity === meId ? 'Bạn' : (meetingRoomApi.get().participants.find((p) => p.identity === identity)?.name ?? 'Thành viên'),
    [meId],
  );

  return { drop: (id) => useMeetingRoomStore.getState().dropReaction(id), nameOf, reactions, send };
}
