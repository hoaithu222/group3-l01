import { create } from 'zustand';

interface SavedMessagesState {
  /**
   * Tập id tin ĐÃ BIẾT là đã lưu. ⚠️ Vắng mặt = "chưa lưu HOẶC chưa biết": `MessageView` (p1-04) CHƯA có cờ `isSaved`
   * nên app tự theo dõi từ bốn nguồn — trang "Đã lưu" đã tải (`markMany`), thao tác của chính mình (`mark`), socket
   * `saved:updated` (đa thiết bị) và kết quả lưu/bỏ lưu. Tin đã lưu từ phiên trước mà chưa tải trang "Đã lưu" thì menu
   * vẫn hiện "Lưu"; bấm là idempotent (200) rồi menu đổi thành "Bỏ lưu".
   */
  ids: Record<string, true>;
  mark: (messageId: string, saved: boolean) => void;
  /** Mọi id trong danh sách "Đã lưu" (kể cả mục không khả dụng) đều là tin ĐÃ lưu. */
  markMany: (messageIds: readonly string[]) => void;
  clear: () => void;
}

export const useSavedMessagesStore = create<SavedMessagesState>((set) => ({
  ids: {},
  mark: (messageId, saved) =>
    set((state) => {
      if (saved) return state.ids[messageId] ? state : { ids: { ...state.ids, [messageId]: true } };
      if (!state.ids[messageId]) return state;
      const { [messageId]: _removed, ...rest } = state.ids;
      return { ids: rest };
    }),
  markMany: (messageIds) =>
    set((state) => {
      const missing = messageIds.filter((id) => !state.ids[id]);
      if (missing.length === 0) return state;
      return {
        ids: { ...state.ids, ...Object.fromEntries(missing.map((id) => [id, true as const])) },
      };
    }),
  clear: () => set({ ids: {} }),
}));

/** `true` khi tin đã biết là đã lưu — chọn theo id nên chỉ component của ĐÚNG tin đó vẽ lại khi cờ đổi. */
export function useIsSavedMessage(messageId: string | undefined): boolean {
  return useSavedMessagesStore((state) => (messageId ? state.ids[messageId] === true : false));
}

/** Gọi từ `shell/session/useLogout.ts` — người dùng SAU trên cùng máy không được thấy cờ "đã lưu" của người TRƯỚC. */
export function resetSavedStore(): void {
  useSavedMessagesStore.getState().clear();
}
