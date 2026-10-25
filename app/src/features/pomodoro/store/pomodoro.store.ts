import { create } from 'zustand';

import type { CallMediaConnectionState, CallMediaParticipant } from '@/core/media/call-media.types';

import { pushSample } from '../utils/clock';

/**
 * Phiên MEDIA của phòng học đang vào (một lúc chỉ MỘT phòng — cổng `CallMediaPort` là singleton). Cập nhật theo SDK (ồn: người nói,
 * track) nên tách khỏi cache React Query của snapshot (đổi theo tín hiệu server, có `version`).
 */
export interface PomodoroRoomState {
  callId: string | null;
  cameraOn: boolean;
  channelId: string | null;
  connection: CallMediaConnectionState;
  /** Kết nối media hỏng hẳn (hết lần thử / thiếu module native / bị ngắt lạ) — màn phòng hiện "Thử lại" hoặc "Rời". */
  failed: boolean;
  micDenied: boolean;
  micOn: boolean;
  participants: CallMediaParticipant[];
  /** `Date.now()` lúc bắt đầu `reconnecting`; `null` khi ổn định. Quá 30 s controller tự rời phòng (app.md §3). */
  reconnectingSince: number | null;
  speakerOn: boolean;
}

/** Phiên vừa kết thúc mà TÔI đang ở trong phòng — màn phòng mở tấm "Kết quả phiên" cho đúng phiên này tới khi đóng. */
export interface EndedSession {
  channelId: string;
  sessionId: string;
}

interface PomodoroState {
  ended: EndedSession | null;
  /** Nháp mục tiêu theo phiên (hoặc theo kênh khi chưa có phiên) — đóng tấm/mất mạng không mất chữ đã gõ. */
  goalDraft: Record<string, string>;
  /** Vài mẫu lệch đồng hồ `serverNow − Date.now()` gần nhất theo kênh; hiển thị dùng TRUNG VỊ (`medianOffset`). */
  offsetSamples: Record<string, number[]>;
  room: PomodoroRoomState;
}

interface PomodoroActions {
  clearChannel: (channelId: string) => void;
  clearEnded: () => void;
  clearGoalDraft: (key: string) => void;
  patchRoom: (partial: Partial<PomodoroRoomState>) => void;
  pushOffset: (channelId: string, offsetMs: number) => void;
  /** Xoá sạch (đăng xuất/đổi tài khoản). */
  reset: () => void;
  resetRoom: () => void;
  setEnded: (ended: EndedSession) => void;
  setGoalDraft: (key: string, text: string) => void;
}

export const EMPTY_ROOM: PomodoroRoomState = {
  callId: null,
  cameraOn: false,
  channelId: null,
  connection: 'idle',
  failed: false,
  micDenied: false,
  micOn: false,
  participants: [],
  reconnectingSince: null,
  speakerOn: false,
};

/**
 * State client của `pomodoro` (app.md p5-02 §5) — CHỈ trong bộ nhớ, không persist. Xoá khi rời màn (`clearChannel`) và khi đăng xuất
 * (`resetPomodoroStores`, nối ở `shell/session/wipe-steps.ts`). ⚠️ Kết nối media do controller ngoài React (`pomodoro-session.controller`)
 * giữ; store chỉ phản chiếu trạng thái cho UI.
 */
export const usePomodoroStore = create<PomodoroActions & PomodoroState>()((set) => ({
  clearChannel: (channelId) =>
    set((state) => {
      const offsetSamples = { ...state.offsetSamples };
      delete offsetSamples[channelId];
      return { ended: state.ended?.channelId === channelId ? null : state.ended, goalDraft: {}, offsetSamples };
    }),
  clearEnded: () => set({ ended: null }),
  clearGoalDraft: (key) =>
    set((state) => {
      const goalDraft = { ...state.goalDraft };
      delete goalDraft[key];
      return { goalDraft };
    }),
  ended: null,
  goalDraft: {},
  offsetSamples: {},
  patchRoom: (partial) => set((state) => ({ room: { ...state.room, ...partial } })),
  pushOffset: (channelId, offsetMs) =>
    set((state) => ({
      offsetSamples: { ...state.offsetSamples, [channelId]: pushSample(state.offsetSamples[channelId] ?? [], offsetMs) },
    })),
  reset: () => set({ ended: null, goalDraft: {}, offsetSamples: {}, room: { ...EMPTY_ROOM } }),
  resetRoom: () => set({ room: { ...EMPTY_ROOM } }),
  room: { ...EMPTY_ROOM },
  setEnded: (ended) => set({ ended }),
  setGoalDraft: (key, text) => set((state) => ({ goalDraft: { ...state.goalDraft, [key]: text } })),
}));
