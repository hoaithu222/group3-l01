import { create } from 'zustand';

import type { AssetScope, UploadItem } from './upload.types';

interface UploadStoreShape {
  items: Record<string, UploadItem>;
  addItem: (item: UploadItem) => void;
  updateItem: (localId: string, patch: Partial<UploadItem>) => void;
  removeItem: (localId: string) => void;
  /** Đánh dấu `cancelled` mọi item của một scope (vd mất quyền kênh, p0-02) — trả `localId` đã đổi để nơi gọi huỷ luôn task native. */
  cancelByScope: (scope: AssetScope, scopeKey?: string) => string[];
  /** Logout — huỷ hàng đợi upload của phiên cũ (app.md §5, không persist qua lần mở app). */
  clear: () => void;
}

/**
 * `localId → UploadItem` — Zustand THUẦN, không `persist`.
 *
 * ⛔ Cố ý KHÔNG lưu bền: app.md §5 "Không persist hàng đợi upload qua lần mở
 * app ở P0" (đặc tả không lưu nội dung chat bền trên thiết bị). `upload.runner.ts`
 * đọc/ghi qua `getState()` NGOÀI React (nó không phải component), giống cách
 * `presence.store.ts` chỉ được React đọc còn `presence-heartbeat.ts` ghi từ xa.
 */
export const useUploadStore = create<UploadStoreShape>((set, get) => ({
  items: {},

  addItem: (item) => set((state) => ({ items: { ...state.items, [item.localId]: item } })),

  updateItem: (localId, patch) =>
    set((state) => {
      const current = state.items[localId];
      if (!current) return state;
      return { items: { ...state.items, [localId]: { ...current, ...patch } } };
    }),

  removeItem: (localId) =>
    set((state) => {
      const next = { ...state.items };
      delete next[localId];
      return { items: next };
    }),

  cancelByScope: (scope, scopeKey) => {
    const ids = Object.values(get().items)
      .filter((item) => item.scope === scope && (scopeKey === undefined || item.scopeKey === scopeKey))
      .map((item) => item.localId);

    set((state) => {
      const items = { ...state.items };
      ids.forEach((id) => {
        const current = items[id];
        if (current) items[id] = { ...current, status: 'cancelled' };
      });
      return { items };
    });

    return ids;
  },

  clear: () => set({ items: {} }),
}));
