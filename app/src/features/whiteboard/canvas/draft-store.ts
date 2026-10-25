import { useSyncExternalStore } from 'react';

import type { Draft } from './interaction/interaction.types';

/**
 * Nơi giữ BẢN NHÁP đang kéo — nguồn ngoài React (`useSyncExternalStore`) chứ không phải `useState` của màn: mỗi lần rê ngón tay (60 lần/giây)
 * bản nháp đổi, và nếu nó nằm ở state của màn thì thanh công cụ, tiêu đề, banner… vẽ lại 60 lần/giây. Ở đây chỉ lớp canvas đăng ký nghe.
 * Không phải store zustand (không lưu, không chứa dữ liệu người dùng): sống theo màn vẽ (`useMemo`), gỡ cùng màn.
 */
export interface DraftStore {
  get: () => Draft | null;
  set: (draft: Draft | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createDraftStore(): DraftStore {
  let current: Draft | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (draft) => {
      if (draft === current) return;
      current = draft;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useDraft = (store: DraftStore): Draft | null =>
  useSyncExternalStore(store.subscribe, store.get, store.get);
