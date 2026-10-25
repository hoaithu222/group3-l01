import { create } from 'zustand';

import type { MessageMention } from '../api/chat.types';

/** Đích đang thao tác trên composer của một scope — Trả lời hoặc Sửa (app.md §3 `ReplyStrip`/`EditStrip`). */
export type ComposerTarget =
  | { type: 'reply'; messageId: string }
  | {
      type: 'edit';
      messageId: string;
      /** Nội dung GỐC từ server — còn nguyên marker `@{u:…}`; `Composer` parse ngược thành chữ + chip. */
      content: string;
      /** Ảnh chụp tên (`label`) để dựng lại chip khi sửa — thiếu thì chip hiện `@người dùng`. */
      mentions?: MessageMention[];
      expectedVersion: number;
    };

interface ComposerStoreShape {
  byScope: Record<string, ComposerTarget | undefined>;
  setTarget: (scopeKey: string, target: ComposerTarget | undefined) => void;
  clear: () => void;
}

export const useComposerStore = create<ComposerStoreShape>((set) => ({
  byScope: {},

  setTarget: (scopeKey, target) => set((state) => ({ byScope: { ...state.byScope, [scopeKey]: target } })),

  clear: () => set({ byScope: {} }),
}));
