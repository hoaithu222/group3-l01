import { useActiveConversationStore } from './active-conversation.store';
import { useConversationDraftTargetStore } from './conversation-draft-target.store';

/**
 * Xoá TOÀN BỘ state cục bộ của `conversations` — gọi từ `shell/session/useLogout.ts`
 * cạnh `resetChatStores()` (app.md §5, cùng lý do `reset-chat-stores.ts`).
 */
export function resetConversationStores(): void {
  useActiveConversationStore.setState({ id: null });
  useConversationDraftTargetStore.getState().clear();
}
