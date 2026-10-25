import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { readJson, removeKey, writeJson } from '@/core/storage';
import { logger } from '@/shared/utils/logger';

import { RECENT_SEARCH_MAX, RECENT_SEARCH_PREFIX } from '../constants/workspace-search.constants';

/** `recent-search:{userId}:{wsId}` (app.md p5-04 §5) — theo NGƯỜI DÙNG: máy dùng chung không lộ từ khoá của người trước. */
export function recentSearchKey(userId: string, workspaceId: string): string {
  return `${RECENT_SEARCH_PREFIX}${userId}:${workspaceId}`;
}

interface WorkspaceSearchState {
  /** Chỉ chứa khoá ĐÃ NẠP — `undefined` nghĩa là chưa biết, KHÔNG phải "chưa từng tìm". */
  recents: Record<string, string[]>;
  /** AsyncStorage bất đồng bộ: khung hình đầu còn rỗng, bản trong bộ nhớ (người dùng vừa tìm) thắng bản trên đĩa. */
  hydrate: (key: string) => Promise<void>;
  add: (key: string, term: string) => void;
  remove: (key: string, term: string) => void;
  clear: (key: string) => void;
}

const sameTerm = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function persist(key: string, terms: string[]): void {
  if (terms.length === 0) void removeKey(key);
  else void writeJson(key, terms);
}

/**
 * Tìm gần đây (app.md p5-04 §5). Chỉ giữ TỪ KHOÁ người dùng đã chủ động chốt (nhấn "Tìm" trên bàn phím hoặc mở một kết
 * quả) — không lưu từng nhịp debounce ("ki" → "kiể" → "kiểm"), nếu không danh sách chỉ toàn mảnh vụn.
 *
 * Bộ nhớ + đĩa cùng dọn khi rời phiên: `resetWorkspaceSearchStore` (đăng ký ở `shell/session/wipe-steps.ts`).
 */
export const useWorkspaceSearchStore = create<WorkspaceSearchState>()((set, get) => ({
  recents: {},

  async hydrate(key) {
    if (get().recents[key]) return;
    const stored = await readJson<unknown>(key);
    const loaded = Array.isArray(stored)
      ? stored
          .filter((item): item is string => typeof item === 'string')
          .slice(0, RECENT_SEARCH_MAX)
      : [];
    set((state) => (state.recents[key] ? state : { recents: { ...state.recents, [key]: loaded } }));
  },

  add(key, term) {
    const text = term.trim();
    if (!text) return;
    const next = [
      text,
      ...(get().recents[key] ?? []).filter((item) => !sameTerm(item, text)),
    ].slice(0, RECENT_SEARCH_MAX);
    set((state) => ({ recents: { ...state.recents, [key]: next } }));
    persist(key, next);
  },

  remove(key, term) {
    const next = (get().recents[key] ?? []).filter((item) => !sameTerm(item, term));
    set((state) => ({ recents: { ...state.recents, [key]: next } }));
    persist(key, next);
  },

  clear(key) {
    set((state) => ({ recents: { ...state.recents, [key]: [] } }));
    persist(key, []);
  },
}));

/**
 * Xoá MỌI từ khoá đã lưu — bộ nhớ lẫn đĩa. Xoá theo tiền tố `recent-search:` chứ không theo danh sách khoá đã nạp: khoá
 * của nhóm CHƯA mở trong phiên này vẫn nằm trên đĩa và phải đi cùng.
 */
export async function resetWorkspaceSearchStore(): Promise<void> {
  useWorkspaceSearchStore.setState({ recents: {} });
  try {
    const keys = await AsyncStorage.getAllKeys();
    await Promise.all(
      keys.filter((key) => key.startsWith(RECENT_SEARCH_PREFIX)).map((key) => removeKey(key)),
    );
  } catch (error) {
    if (__DEV__) logger.warn('[workspace-search.store] không dọn được khoá recent-search:', error);
  }
}
