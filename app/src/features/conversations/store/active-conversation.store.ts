import { AppState } from 'react-native';
import { create } from 'zustand';

interface ActiveConversationState {
  /** id hội thoại đang mở ở `ConversationScreen`, `null` khi không có màn nào mở. */
  id: string | null;
  isForeground: boolean;
  setActive: (id: string | null) => void;
  setForeground: (isForeground: boolean) => void;
}

/**
 * app.md §5 — dùng cho unread cục bộ (`applyConversationActivity` không tăng
 * `unreadCount` khi hội thoại đang mở Ở FOREGROUND) và tương lai p1-07 báo
 * "đang xem". `ConversationScreen` set `id` lúc mount, `null` lúc unmount.
 */
export const useActiveConversationStore = create<ActiveConversationState>((set) => ({
  id: null,
  isForeground: AppState.currentState === 'active',
  setActive: (id) => set({ id }),
  setForeground: (isForeground) => set({ isForeground }),
}));

/** Gọi MỘT lần ở `(app)/_layout.tsx` — theo dõi AppState suốt vòng đời app, không lệ thuộc vào `ConversationScreen` có đang mount hay không. */
export function bindActiveConversationAppState(): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    useActiveConversationStore.getState().setForeground(state === 'active');
  });
  return () => sub.remove();
}

/** Hội thoại `id` có đang mở VÀ app ở foreground hay không — điều kiện app.md §4.2 dùng để quyết định `unreadCount`. */
export function isConversationOpenForeground(id: string): boolean {
  const state = useActiveConversationStore.getState();
  return state.id === id && state.isForeground;
}
