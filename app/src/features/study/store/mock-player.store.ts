import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createPersistStorage } from '@/core/storage/app-storage';

import type { MockAnswerInput } from '../api/mock-attempts.types';
import { patchEntry, pruneStaleAttempts, sameAnswer } from '../utils/mock-player-utils';
import { MOCK_PLAYER_STORAGE_KEY } from './mock-player.constants';
import type { MockPlayerEntry, PendingMockEvent } from './mock-player.types';

interface MockPlayerState {
  attempts: Record<string, MockPlayerEntry>;
  /** Xoá mục của một lượt (nộp xong / lượt đã kết thúc). */
  clear: (attemptId: string) => void;
  /** Server xác nhận `sent`: chỉ gỡ pending của câu mà giá trị KHÔNG bị đổi trong lúc bay. */
  confirm: (attemptId: string, sent: readonly MockAnswerInput[]) => void;
  /** Bỏ pending mà không xác nhận (lô bị BE từ chối `MOCK_005` — gửi lại vô ích). */
  dropPending: (attemptId: string, itemIds: readonly string[]) => void;
  pushEvent: (attemptId: string, event: PendingMockEvent) => void;
  removeEvents: (attemptId: string, ids: readonly string[]) => void;
  reset: () => void;
  saveAnswer: (attemptId: string, answer: MockAnswerInput) => void;
  setIndex: (attemptId: string, index: number) => void;
  toggleFlag: (attemptId: string, itemId: string) => void;
}

/**
 * Đáp án chờ gửi + vị trí làm bài theo `attemptId` (app.md p4-02 §5) — BỀN qua `AsyncStorage` (không phải kho khoá:
 * đây là đáp án của chính người dùng, không phải bí mật) để tắt/bị giết app giữa bài không mất đáp án chưa lên
 * server (ST-05). Nộp xong → `clear`; đăng xuất → `resetStudyStores()` (`set-editor.store.ts`) → `resetMockPlayerStore`.
 *
 * ⚠️ AsyncStorage bất đồng bộ: khung hình đầu store còn RỖNG — nơi dùng chờ `useMockPlayerHydrated()`.
 */
export const useMockPlayerStore = create<MockPlayerState>()(
  persist(
    (set) => {
      const edit = (attemptId: string, update: (entry: MockPlayerEntry) => MockPlayerEntry) =>
        set((state) => patchEntry(state.attempts, attemptId, update));
      return {
        attempts: {},
        clear: (attemptId) =>
          set((state) => {
            if (!(attemptId in state.attempts)) return state;
            const attempts = { ...state.attempts };
            delete attempts[attemptId];
            return { attempts };
          }),
        confirm: (attemptId, sent) =>
          edit(attemptId, (entry) => {
            const settled = new Set(
              sent.filter((a) => sameAnswer(a, entry.answers[a.itemId])).map((a) => a.itemId),
            );
            return { ...entry, pending: entry.pending.filter((id) => !settled.has(id)) };
          }),
        dropPending: (attemptId, ids) =>
          edit(attemptId, (e) => ({ ...e, pending: e.pending.filter((id) => !ids.includes(id)) })),
        pushEvent: (attemptId, event) =>
          edit(attemptId, (e) => ({ ...e, events: [...e.events, event] })),
        removeEvents: (attemptId, ids) =>
          edit(attemptId, (e) => ({
            ...e,
            events: e.events.filter((ev) => !ids.includes(ev.clientEventId)),
          })),
        reset: () => set({ attempts: {} }),
        saveAnswer: (attemptId, answer) =>
          edit(attemptId, (entry) => ({
            ...entry,
            answers: { ...entry.answers, [answer.itemId]: answer },
            pending: entry.pending.includes(answer.itemId)
              ? entry.pending
              : [...entry.pending, answer.itemId],
          })),
        setIndex: (attemptId, index) => edit(attemptId, (e) => ({ ...e, currentIndex: index })),
        toggleFlag: (attemptId, itemId) =>
          edit(attemptId, (e) => ({
            ...e,
            flagged: e.flagged.includes(itemId)
              ? e.flagged.filter((id) => id !== itemId)
              : [...e.flagged, itemId],
          })),
      };
    },
    {
      // Hợp nhất thay vì ghi đè: mục tạo TRƯỚC khi đĩa trả về vẫn sống; mục trên đĩa quá 24 giờ bị bỏ.
      merge: (persisted, current) => ({
        ...current,
        attempts: {
          ...pruneStaleAttempts((persisted as Partial<MockPlayerState> | undefined)?.attempts),
          ...current.attempts,
        },
      }),
      name: MOCK_PLAYER_STORAGE_KEY,
      partialize: (state) => ({ attempts: state.attempts }),
      storage: createPersistStorage(),
      version: 1,
    },
  ),
);

/**
 * Xoá MỌI đáp án chờ gửi — bộ nhớ lẫn bản trên đĩa. Gọi từ `resetStudyStores()` khi đăng xuất/đổi tài khoản: đáp án
 * dở của người trước không được lọt sang người sau.
 */
export function resetMockPlayerStore(): void {
  useMockPlayerStore.getState().reset();
  void useMockPlayerStore.persist.clearStorage();
}
