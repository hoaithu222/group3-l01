import { create } from 'zustand';

import type { MentionRange } from '../api/chat.types';

/** Nháp CHƯA gửi của một scope — app.md §5 "P0 bộ nhớ" (đổi kênh vẫn giữ trong phiên, KHÔNG lưu bền qua lần mở app). */
export interface Draft {
  text: string;
  /**
   * Các cụm nhắc tên ĐANG NẰM TRONG `text` (vị trí + tên + userId). Phải lưu cùng
   * `text` chứ không dựng lại từ nội dung: nháp chỉ là chữ hiển thị (`@Minh`), mất
   * range thì khi quay lại từ màn luồng chip biến thành chữ thường — gửi đi sẽ
   * KHÔNG nhắc ai (WS-02 "quay lại giữ nháp").
   */
  mentionRanges: MentionRange[];
  /** `localId` trong `core/uploads` upload store — chưa có `assetId` thì chưa gửi được. */
  attachmentsLocalIds: string[];
  replyToId?: string;
}

const EMPTY_DRAFT: Draft = { text: '', mentionRanges: [], attachmentsLocalIds: [] };

interface DraftsStoreShape {
  byScope: Record<string, Draft>;
  setDraft: (scopeKey: string, patch: Partial<Draft>) => void;
  clearDraft: (scopeKey: string) => void;
  clear: () => void;
}

export const useDraftsStore = create<DraftsStoreShape>((set) => ({
  byScope: {},

  setDraft: (scopeKey, patch) =>
    set((state) => ({
      byScope: { ...state.byScope, [scopeKey]: { ...(state.byScope[scopeKey] ?? EMPTY_DRAFT), ...patch } },
    })),

  clearDraft: (scopeKey) =>
    set((state) => {
      if (!(scopeKey in state.byScope)) return state;
      const next = { ...state.byScope };
      delete next[scopeKey];
      return { byScope: next };
    }),

  clear: () => set({ byScope: {} }),
}));

export function getDraft(scopeKey: string): Draft {
  return useDraftsStore.getState().byScope[scopeKey] ?? EMPTY_DRAFT;
}
