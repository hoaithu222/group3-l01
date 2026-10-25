import { create } from 'zustand';

import type { MentionPick } from '../utils/mention-compose';

/** Nháp bình luận CHƯA gửi của một thẻ — chữ hiển thị + danh sách người đã chọn khi gõ `@`. */
export interface CommentDraft {
  picks: MentionPick[];
  text: string;
}

const EMPTY_DRAFT: CommentDraft = { picks: [], text: '' };

interface DraftsShape {
  clearDraft: (key: string) => void;
  drafts: Record<string, CommentDraft>;
  setDraft: (key: string, draft: CommentDraft) => void;
}

/**
 * Nháp theo `<userId>:<taskId>` — bộ nhớ, KHÔNG lưu bền (app.md §4 "Draft bình luận": đóng chi tiết rồi mở lại
 * vẫn còn nháp trong phiên). Khoá có `userId` để người dùng SAU trên cùng máy không thấy nháp của người
 * TRƯỚC (đăng xuất không dọn store này — không cần chạm `useLogout` của shell).
 */
export const useTaskDraftStore = create<DraftsShape>((set) => ({
  clearDraft: (key) =>
    set((state) => {
      if (!(key in state.drafts)) return state;
      const drafts = { ...state.drafts };
      delete drafts[key];
      return { drafts };
    }),
  drafts: {},
  setDraft: (key, draft) => set((state) => ({ drafts: { ...state.drafts, [key]: draft } })),
}));

export const draftKeyOf = (userId: string, taskId: string): string => `${userId}:${taskId}`;

export { EMPTY_DRAFT };
