import { useBlockedRevealStore } from './blocked-reveal.store';
import { useComposerStore } from './composer.store';
import { useDraftsStore } from './drafts.store';
import { useOutboxStore } from './outbox.store';

/**
 * Xoá TOÀN BỘ state cục bộ của `chat` — gọi từ `shell/session/useLogout.ts`
 * cùng `queryClient.clear()` (app.md §5, bài học Sun: xoá cache theo user).
 * Không gọi `useTypingStore.reset()`/upload store ở đây: chúng thuộc hạ tầng
 * dùng chung (`core/socket`, `core/uploads`) và đã có chỗ dọn riêng của chính
 * chúng (`AppProviders`/logout hiện có).
 */
export function resetChatStores(): void {
  useOutboxStore.getState().clear();
  useDraftsStore.getState().clear();
  useComposerStore.getState().clear();
  useBlockedRevealStore.getState().clear();
}
