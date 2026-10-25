import { create } from 'zustand';

import { readScoped, writeScoped } from '@/core/storage';

/** Tên khoá trong kho theo người dùng (`u:<userId>:home.module-usage.v1`). Đổi cấu trúc dữ liệu thì nâng `v1`. */
const STORAGE_NAME = 'home.module-usage.v1';

export interface ModuleUsage {
  /** Tổng số lượt mở. */
  count: number;
  /** Mốc ms của lượt mở gần nhất. */
  lastAt: number;
}

export type ModuleUsageMap = Readonly<Record<string, ModuleUsage>>;

interface ModuleUsageState {
  hydrated: boolean;
  /** Xem `module-pins.store`: `undefined` = chưa nạp cho ai, `null` = không đăng nhập. */
  ownerId: string | null | undefined;
  /**
   * ẢNH CHỤP ĐÓNG BĂNG của `usage` lúc nạp xong — thứ DUY NHẤT thứ hạng đọc.
   *
   * Nếu thứ hạng đọc bảng SỐNG thì mở một phân hệ xong bấm quay về là ô đã đổi chỗ, lần sau người dùng bấm trượt —
   * đúng kiểu "đổi chỗ tự động" chậm nhất trong ba kiểu menu (Findlater & McGrenere, CHI 2004). Đóng băng ở ĐÂY
   * (không phải `useRef` trong hook): ref reset mỗi lần cây Trang chủ dựng lại, còn ngữ nghĩa đúng là "một lần mỗi
   * PHIÊN" — thứ hạng mới chỉ áp ở lần nạp kế tiếp (mở app / đăng nhập lại).
   */
  ranking: ModuleUsageMap;
  usage: Record<string, ModuleUsage>;
  hydrate: (userId: string | null) => Promise<void>;
  /** Ghi một lượt mở. Bỏ qua khi chưa nạp xong (ghi lúc đó là đè mất bảng đã lưu bằng một bảng thiếu). */
  record: (moduleId: string) => void;
  reset: () => void;
}

/** Dữ liệu đọc từ đĩa là đầu vào KHÔNG tin được: chỉ nhận mục có `count`/`lastAt` là số hữu hạn không âm. */
export function sanitizeUsage(raw: unknown): Record<string, ModuleUsage> {
  const result: Record<string, ModuleUsage> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return result;
  for (const [id, entry] of Object.entries(raw)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { count, lastAt } = entry as { count?: unknown; lastAt?: unknown };
    if (typeof count !== 'number' || typeof lastAt !== 'number') continue;
    if (!Number.isFinite(count) || !Number.isFinite(lastAt) || count < 0 || lastAt < 0) continue;
    result[id] = { count: Math.floor(count), lastAt };
  }
  return result;
}

/**
 * Đếm lượt MỞ phân hệ từ Trang chủ / tấm chọn phân hệ, để điền ô hero theo thứ người dùng thật sự dùng. Lưu `count`
 * (tần suất) VÀ `lastAt` (gần nhất) để đổi công thức xếp hạng sau này không phải chuyển dữ liệu đã lưu.
 *
 * ── Chỉ đếm lượt mở TỪ TRANG CHỦ, cố ý ──────────────────────────────────────
 * Phân hệ chính còn có tab riêng và người dùng vào chúng gần như luôn bằng tab; đếm cả lượt bấm tab là phải hook thêm
 * `AppTabBar` mà thứ hạng chỉ cần biết "người này có coi lối tắt này là lối vào của mình không".
 *
 * Theo người dùng, đồng bộ đĩa, dọn khi rời phiên: cùng lý do và cùng cơ chế với `module-pins.store` (⛔ không dùng
 * `zustand/persist`).
 */
export const useModuleUsageStore = create<ModuleUsageState>()((set, get) => ({
  hydrated: false,
  ownerId: undefined,
  ranking: {},
  usage: {},

  hydrate: async (userId) => {
    if (get().ownerId === userId) return;
    set({ hydrated: userId === null, ownerId: userId, ranking: {}, usage: {} });
    if (userId === null) return;

    const stored = await readScoped<{ usage?: unknown }>(userId, STORAGE_NAME);
    if (get().ownerId !== userId) return;
    const usage = sanitizeUsage(stored?.usage);
    set({ hydrated: true, ranking: usage, usage });
  },

  record: (moduleId) => {
    const { hydrated, ownerId, usage } = get();
    if (!hydrated) return;
    const previous = usage[moduleId];
    const next = {
      ...usage,
      [moduleId]: { count: (previous?.count ?? 0) + 1, lastAt: Date.now() },
    };
    set({ usage: next });
    if (typeof ownerId === 'string') void writeScoped(ownerId, STORAGE_NAME, { usage: next });
  },

  reset: () => set({ hydrated: false, ownerId: undefined, ranking: {}, usage: {} }),
}));
