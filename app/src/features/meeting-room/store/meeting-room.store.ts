import { create } from 'zustand';

import type { JoinedResult } from '../api/meeting-room.types';
import { MAX_FLOATING_REACTIONS } from '../constants/meeting-room.constants';
import { consentPromptFor } from '../utils/recording-state.utils';
import type { FloatingReaction, MeetingRoomActions, MeetingRoomState, PreJoinPrefs } from './meeting-room.store.types';

export type {
  ConsentPrompt,
  FloatingReaction,
  HandPending,
  MeetingRoomState,
  PreJoinPrefs,
  RoomPhase,
  RoomRecording,
  RoomSheet,
  StageLayout,
} from './meeting-room.store.types';

/**
 * Store phiên phòng họp (app.md p2-05 §5) — MỘT phòng tại một thời điểm, KHÔNG persist. Sống ngoài vòng đời màn hình: controller ở
 * `hooks/meeting-room.session.ts` ghi vào đây nên "thu nhỏ" không làm rớt cuộc họp. Reset khi người dùng rời màn kết thúc và khi
 * đăng xuất/đổi tài khoản (`hooks/reset-meeting-room-stores.ts`).
 */

const initialPreJoin = (): PreJoinPrefs => ({ cam: false, displayName: '', facing: 'front', listenOnly: false, mic: false });

export const initialMeetingRoom = (): MeetingRoomState => ({
  blockedCode: null,
  brief: null,
  busy: false,
  busyConflict: null,
  callId: null,
  camDenied: false,
  camOn: false,
  chatUnread: 0,
  closingAt: null,
  connection: 'idle',
  consentPrompt: 'NONE',
  conversationId: null,
  endedDurationSec: null,
  endedReason: null,
  error: null,
  handPending: null,
  handRaisedAt: null,
  layout: 'GRID',
  lobby: [],
  lockedAt: null,
  meetingId: null,
  micDenied: false,
  micOn: false,
  minimized: false,
  page: 0,
  participants: [],
  phase: 'PREJOIN',
  pinnedUserId: null,
  preJoin: initialPreJoin(),
  publish: { audio: true, screen: true, video: true },
  reactions: [],
  recording: null,
  role: null,
  screenSharing: false,
  serverOffsetMs: 0,
  sheet: 'NONE',
  // Phòng nhiều người: mặc định loa ngoài (giống phòng thoại p2-03); đổi được ở pre-join và trong "Thêm".
  speakerOn: true,
  startedAt: null,
  ticket: null,
  waiting: null,
});

export const useMeetingRoomStore = create<MeetingRoomActions & MeetingRoomState>()((set) => ({
  ...initialMeetingRoom(),
  // Cắt theo trần: quá 20 cảm xúc đang bay thì bỏ cái CŨ nhất, không dồn lại.
  addReaction: (reaction) => set((s) => ({ reactions: [...s.reactions.slice(1 - MAX_FLOATING_REACTIONS), reaction] })),
  applyJoined: (joined, offsetMs) =>
    set({
      callId: joined.callId,
      closingAt: joined.closingAt,
      consentPrompt: consentPromptFor(joined.recording),
      conversationId: joined.conversationId,
      lockedAt: joined.lockedAt,
      publish: joined.publishPermissions,
      // p2-06: người vào sau/nối lại luôn thấy chỉ báo ghi hình từ kết quả VÀO (RR-19), không chờ sự kiện socket.
      recording: joined.recording,
      role: joined.role,
      serverOffsetMs: offsetMs,
      ticket: {
        expiresAt: new Date(joined.tokenExpiresAt).getTime(),
        room: joined.livekitRoom,
        token: joined.token,
        url: joined.livekitUrl,
      },
    }),
  dropReaction: (id) => set((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) })),
  patch: (partial) => set(partial),
  reset: () => set(initialMeetingRoom()),
}));

/** Cửa vào ngoài React (controller, socket handler, test). */
export const meetingRoomApi = {
  addReaction: (reaction: FloatingReaction) => useMeetingRoomStore.getState().addReaction(reaction),
  applyJoined: (joined: JoinedResult, offsetMs: number) => useMeetingRoomStore.getState().applyJoined(joined, offsetMs),
  get: () => useMeetingRoomStore.getState(),
  patch: (partial: Partial<MeetingRoomState>) => useMeetingRoomStore.getState().patch(partial),
  reset: () => useMeetingRoomStore.getState().reset(),
};
