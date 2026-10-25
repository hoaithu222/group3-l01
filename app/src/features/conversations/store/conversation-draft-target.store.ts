import { create } from 'zustand';

interface ConversationDraftTargetState {
  /** `draft:<userId> → conversationId` sau khi `POST /conversations/direct` thành công (app.md §5) — "Thử lại" một tin ĐẦU thất bại không gọi lại `createDirect`. */
  byDraftKey: Record<string, string>;
  setTarget: (draftKey: string, conversationId: string) => void;
  clear: () => void;
}

export const useConversationDraftTargetStore = create<ConversationDraftTargetState>((set) => ({
  byDraftKey: {},
  setTarget: (draftKey, conversationId) =>
    set((state) => ({ byDraftKey: { ...state.byDraftKey, [draftKey]: conversationId } })),
  clear: () => set({ byDraftKey: {} }),
}));
