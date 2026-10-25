import { create } from 'zustand';

import { createEditorDraft, type EditorDraft } from '../utils/editor-draft';
import type { StudyItemDto } from '../api/study.types';
import type { ItemErrors } from '../utils/map-bulk-errors';
import { resetMockPlayerStore } from './mock-player.store';

/**
 * Bản nháp của trình soạn theo `setId` (app.md p4-01 §5) — CHỈ BỘ NHỚ: đóng app là mất, đúng lựa chọn P0 của README
 * §10 ("lưu nháp cục bộ theo phiên, không bền"). Rời màn khi còn thay đổi → hộp thoại "Bỏ thay đổi?" (màn lo).
 *
 * `errors` là lỗi do SERVER trả (`STUDY_001`) theo `clientItemKey`; lỗi kiểm cục bộ tính lại mỗi lần vẽ từ nháp nên
 * không nằm ở đây.
 */
interface SetEditorState {
  drafts: Record<string, EditorDraft>;
  errors: Record<string, Record<string, ItemErrors>>;
  /** Nạp/nạp lại từ server: bỏ nháp cũ, xoá lỗi. */
  load: (setId: string, version: number, items: readonly StudyItemDto[]) => void;
  /** Áp một phép biến đổi thuần lên nháp (`editor-ops`). */
  apply: (setId: string, update: (draft: EditorDraft) => EditorDraft) => void;
  setErrors: (setId: string, errors: Record<string, ItemErrors>) => void;
  clearItemError: (setId: string, key: string) => void;
  drop: (setId: string) => void;
  reset: () => void;
}

export const useSetEditorStore = create<SetEditorState>((set) => ({
  apply: (setId, update) =>
    set((state) => {
      const draft = state.drafts[setId];
      return draft ? { drafts: { ...state.drafts, [setId]: update(draft) } } : state;
    }),
  clearItemError: (setId, key) =>
    set((state) => {
      const current = state.errors[setId];
      if (!current || !(key in current)) return state;
      const next = { ...current };
      delete next[key];
      return { errors: { ...state.errors, [setId]: next } };
    }),
  drafts: {},
  drop: (setId) =>
    set((state) => {
      const drafts = { ...state.drafts };
      const errors = { ...state.errors };
      delete drafts[setId];
      delete errors[setId];
      return { drafts, errors };
    }),
  errors: {},
  load: (setId, version, items) =>
    set((state) => ({
      drafts: { ...state.drafts, [setId]: createEditorDraft(version, items) },
      errors: { ...state.errors, [setId]: {} },
    })),
  reset: () => set({ drafts: {}, errors: {} }),
  setErrors: (setId, errors) => set((state) => ({ errors: { ...state.errors, [setId]: errors } })),
}));

/**
 * Xoá toàn bộ state cục bộ của Học — gọi khi đăng xuất/đổi tài khoản (nháp và đáp án thi dở là dữ liệu riêng của
 * người dùng cũ). `shell/session/useLogout` chỉ gọi hàm này, nên `mock-player.store` (bền trên đĩa) dọn theo ở đây.
 */
export function resetStudyStores(): void {
  useSetEditorStore.getState().reset();
  resetMockPlayerStore();
}
