import { create } from 'zustand';

/** Khớp enum `PresenceState` phía BE (`docs/plan/config-be.md` §7). */
export type PresenceState = 'DND' | 'HIDDEN' | 'IDLE' | 'OFFLINE' | 'ONLINE';

export interface PresenceEntry {
  state: PresenceState;
  updatedAt: number;
}

interface PresenceStoreShape {
  byUserId: Record<string, PresenceEntry>;
  /** Xoá sạch — gọi khi logout (`AppProviders`), dữ liệu presence của phiên cũ không còn nghĩa. */
  reset: () => void;
  set: (userId: string, entry: PresenceEntry) => void;
  setMany: (entries: Record<string, PresenceEntry>) => void;
}

/**
 * `userId → {state, updatedAt}` — nạp từ sự kiện `presence:updated` (đăng ký ở
 * `presence-heartbeat.ts`, cùng module điều khiển vòng đời gửi heartbeat).
 *
 * Zustand thuần (không `persist`): presence là dữ liệu SỐNG, cache qua lần mở
 * app chỉ tổ hiện trạng thái CŨ sai trước khi có `presence:updated` đầu tiên.
 */
export const usePresenceStore = create<PresenceStoreShape>((set) => ({
  byUserId: {},

  set: (userId, entry) =>
    set((state) => ({ byUserId: { ...state.byUserId, [userId]: entry } })),

  setMany: (entries) =>
    set((state) => ({ byUserId: { ...state.byUserId, ...entries } })),

  reset: () => set({ byUserId: {} }),
}));
