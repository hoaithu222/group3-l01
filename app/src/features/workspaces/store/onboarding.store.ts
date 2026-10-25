import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { readJson, removeKey, writeJson } from '@/core/storage';
import { logger } from '@/shared/utils/logger';

/**
 * Ba việc của checklist nhóm mới (app.md p1-01 §3): Mời → Kênh → Tin đầu.
 * `invite` còn được SUY từ dữ liệu (`memberCount > 1`), hai việc kia chỉ có thể
 * ghi nhận "người dùng đã mở tới đó" — không có API nào trả "nhóm đã có tin".
 */
export type OnboardingStepId = 'invite' | 'channel' | 'message';

export interface OnboardingRecord {
  /** Bấm "Để sau" — ẩn hẳn, không hiện lại (app.md §5: "đã bỏ qua checklist theo (userId, wsId)"). */
  dismissed: boolean;
  done: OnboardingStepId[];
}

const PREFIX = 'onboarding:';
const EMPTY: OnboardingRecord = { dismissed: false, done: [] };

/** `onboarding:{userId}:{wsId}` (app.md §2) — theo NGƯỜI DÙNG: máy dùng chung không lộ trạng thái của người trước. */
export function onboardingKey(userId: string, workspaceId: string): string {
  return `${PREFIX}${userId}:${workspaceId}`;
}

interface OnboardingState {
  /** Chỉ chứa khoá ĐÃ NẠP — `undefined` nghĩa là chưa biết, KHÔNG phải "chưa từng bỏ qua". */
  records: Record<string, OnboardingRecord>;
  /**
   * AsyncStorage bất đồng bộ (`app-storage.ts`): khung hình đầu store còn rỗng.
   * ⛔ Nơi gọi KHÔNG được hiện checklist trước khi `records[key]` có giá trị —
   * hiện rồi mới nạp ra "đã bỏ qua" là checklist chớp lên mỗi lần mở màn.
   */
  hydrate: (key: string) => Promise<void>;
  dismiss: (key: string) => void;
  markDone: (key: string, step: OnboardingStepId) => void;
}

function persist(key: string, record: OnboardingRecord): void {
  void writeJson(key, record);
}

export const useOnboardingStore = create<OnboardingState>()((set, get) => ({
  records: {},

  async hydrate(key) {
    if (get().records[key]) return;
    const stored = await readJson<Partial<OnboardingRecord>>(key);
    const loaded: OnboardingRecord = {
      dismissed: stored?.dismissed === true,
      done: Array.isArray(stored?.done) ? stored.done : [],
    };
    // Người dùng có thể đã bấm trong lúc đọc — bản trong bộ nhớ thắng bản trên đĩa.
    set((state) => (state.records[key] ? state : { records: { ...state.records, [key]: loaded } }));
  },

  dismiss(key) {
    const next: OnboardingRecord = { ...(get().records[key] ?? EMPTY), dismissed: true };
    set((state) => ({ records: { ...state.records, [key]: next } }));
    persist(key, next);
  },

  markDone(key, step) {
    const current = get().records[key] ?? EMPTY;
    if (current.done.includes(step)) return;
    const next: OnboardingRecord = { ...current, done: [...current.done, step] };
    set((state) => ({ records: { ...state.records, [key]: next } }));
    persist(key, next);
  },
}));

/**
 * Xoá MỌI trạng thái onboarding — bộ nhớ lẫn đĩa. Gọi từ `useLogout` (app.md
 * §5: "khi logout/đổi tài khoản xoá"). Xoá theo tiền tố `onboarding:` chứ không
 * theo danh sách khoá đã nạp: khoá của nhóm CHƯA mở trong phiên này vẫn nằm trên
 * đĩa và phải đi cùng.
 */
export async function resetOnboardingStore(): Promise<void> {
  useOnboardingStore.setState({ records: {} });
  try {
    const keys = await AsyncStorage.getAllKeys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX)).map((key) => removeKey(key)));
  } catch (error) {
    if (__DEV__) logger.warn('[onboarding.store] không dọn được khoá onboarding:', error);
  }
}
