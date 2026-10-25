import { create } from 'zustand';

/**
 * Tin của người BỊ CHẶN mà người dùng đã bấm "Xem" trong phiên này (p1-08 app.md §3 "Chạm để xem").
 *
 * Giữ theo `messageId` trong store thay vì `useState` trong bong bóng (app.md §5 nói "state component"):
 * `MessageList` là `FlashList` TÁI DÙNG view — `useState` của một bong bóng có thể theo view sang tin KHÁC khi
 * cuộn, và tin của người bị chặn bung ra mà chưa ai bấm. Theo id thì bung đúng tin đã chọn.
 *
 * Không lưu bền (app.md: "chỉ hiện nội dung trong phiên, không lưu"): thoát app là thu gọn lại; xoá khi
 * đăng xuất qua `resetChatStores`.
 */
interface BlockedRevealState {
  ids: ReadonlySet<string>;
  reveal: (messageId: string) => void;
  clear: () => void;
}

const EMPTY: ReadonlySet<string> = new Set<string>();

export const useBlockedRevealStore = create<BlockedRevealState>((set) => ({
  ids: EMPTY,
  reveal: (messageId) =>
    set((state) => {
      if (state.ids.has(messageId)) return state;
      const next = new Set(state.ids);
      next.add(messageId);
      return { ids: next };
    }),
  clear: () => set({ ids: EMPTY }),
}));
