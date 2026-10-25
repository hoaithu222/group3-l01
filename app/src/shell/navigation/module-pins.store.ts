import { create } from 'zustand';

import { readScoped, writeScoped } from '@/core/storage';

/**
 * Trần số phân hệ GHIM = số THẺ HERO của Trang chủ (`features/home`, hàng thẻ lớn trên cùng).
 *
 * ⚠️ MỘT nguồn: Trang chủ đọc đúng hằng này làm số ô hero, không tự khai số riêng. Ghim nhiều hơn số thẻ hero thì
 * phần dư không hiện ở đâu cả — người dùng bấm ghim mà không thấy gì đổi (nút bấm câm). Ghim thứ 3 bị CHẶN kèm thông
 * báo, ⛔ KHÔNG âm thầm đẩy cái cũ ra (đẩy ngầm là mất dữ liệu người dùng không hiểu vì sao).
 */
export const MAX_PINNED_MODULES = 2;

/**
 * Số phân hệ TỐI THIỂU để Trang chủ tách tầng hero. Ít hơn (quyền hạn chế, cờ tắt nhiều) thì 2 thẻ lớn + 1 ô lẻ trông tệ
 * hơn một lưới đều nhau, nên Trang chủ dồn hết xuống lưới — và ghim khi đó KHÔNG có chỗ hiện: nút/cử chỉ ghim phải ẩn.
 */
export const MIN_MODULES_FOR_HERO = 4;

/** Tên khoá trong kho theo người dùng (`u:<userId>:home.module-pins.v1`). Đổi cấu trúc dữ liệu thì nâng `v1`. */
const STORAGE_NAME = 'home.module-pins.v1';

/**
 * Kết quả của một lần bật/tắt ghim — để nơi gọi chọn cách phản hồi (toast ở Trang chủ, thông báo trong tấm chọn
 * phân hệ vì `<Modal>` che mất toast).
 *  · `not-ready` — chưa nạp xong dữ liệu của người dùng hiện tại: bỏ qua, KHÔNG ghi (ghi lúc này là đè mất ghim đã lưu).
 */
export type TogglePinResult = 'full' | 'not-ready' | 'pinned' | 'unpinned';

interface ModulePinsState {
  /** Đã nạp xong dữ liệu của `ownerId` (hoặc không có ai để nạp). */
  hydrated: boolean;
  /**
   * Chủ của dữ liệu đang giữ. `undefined` = chưa nạp cho ai; `null` = không đăng nhập (chế độ dựng giao diện tắt xác
   * thực — không có gì để lưu bền).
   */
  ownerId: string | null | undefined;
  /** `id` phân hệ đã ghim THEO THỨ TỰ ghim — thứ tự này là thứ tự thẻ hero, không xếp lại theo gì cả. */
  pinned: string[];
  hydrate: (userId: string | null) => Promise<void>;
  reset: () => void;
  /**
   * @param availableIds `id` các phân hệ người dùng đang được vào. Ghim của phân hệ vừa mất quyền/bị tắt cờ vẫn nằm
   *   trong danh sách (bật lại trước lần ghim mới kế tiếp là hiện lại) nhưng KHÔNG được tính vào trần — nếu không,
   *   người dùng chạm trần bởi một ghim vô hình mà không hiểu vì sao.
   */
  toggle: (moduleId: string, availableIds: readonly string[]) => TogglePinResult;
}

/** Dữ liệu đọc từ đĩa là đầu vào KHÔNG tin được: chỉ nhận mảng chuỗi khác nhau, cắt theo trần. */
export function sanitizePinned(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return [...new Set(ids)].slice(0, MAX_PINNED_MODULES);
}

/**
 * Ghim phân hệ lên tầng hero của Trang chủ — sở thích CÁ NHÂN, lưu theo NGƯỜI DÙNG.
 *
 * ── Vì sao ghim tay, không chỉ xếp hạng tự động ──────────────────────────────
 * Menu tự đổi chỗ theo tần suất là kiểu chậm nhất trong ba kiểu menu (Findlater & McGrenere, CHI 2004); tự sắp
 * (adaptable) nhanh ngang cố định và được ưa hơn. Nên cơ chế CHÍNH là ghim tay; thứ hạng theo lượt mở
 * (`module-usage.store`) chỉ điền các ô hero CHƯA ghim.
 *
 * ── Vì sao theo người dùng chứ không theo thiết bị ───────────────────────────
 * Máy dùng chung: người B đăng nhập không được thừa hưởng cách sắp xếp của người A, và mọi tuỳ chọn cá nhân của repo
 * nằm ở kho `u:<userId>:*` để `wipeUserData()` xoá gọn khi rời phiên (`core/storage/session-scoped-storage.ts`).
 * Đánh đổi: đăng xuất là mất ghim (phải ghim lại). Muốn giữ qua đăng xuất thì phải lưu phía máy chủ — quyết định sản phẩm.
 *
 * ── Đồng bộ với đĩa ──────────────────────────────────────────────────────────
 * `AsyncStorage` bất đồng bộ nên state này nạp qua `hydrate(userId)` (gọi bởi `useModulePrefs`), ⛔ không dùng
 * `zustand/persist` — nó khoá tên khoá lúc tạo store, không theo được `userId` đổi giữa phiên. Ghi sau mỗi thay đổi
 * (`writeScoped` không bao giờ ném). Bước `navigation` của `wipeUserData` gọi `reset()` để xoá bản trong bộ nhớ.
 */
export const useModulePinsStore = create<ModulePinsState>()((set, get) => ({
  hydrated: false,
  ownerId: undefined,
  pinned: [],

  hydrate: async (userId) => {
    // Đã (đang) nạp cho đúng người này thì thôi — hai nơi gọi `useModulePrefs` cùng lúc không đọc đĩa hai lần.
    if (get().ownerId === userId) return;
    // Đổi chủ: bỏ ngay dữ liệu của người cũ TRƯỚC khi chờ đĩa, để nó không lộ ra trong khoảng chờ.
    set({ hydrated: userId === null, ownerId: userId, pinned: [] });
    if (userId === null) return;

    const stored = await readScoped<{ pinned?: unknown }>(userId, STORAGE_NAME);
    // Trong lúc chờ đĩa có người khác đăng nhập (hoặc phiên bị dọn) — kết quả này không còn là của ai cần nó.
    if (get().ownerId !== userId) return;
    set({ hydrated: true, pinned: sanitizePinned(stored?.pinned) });
  },

  reset: () => set({ hydrated: false, ownerId: undefined, pinned: [] }),

  toggle: (moduleId, availableIds) => {
    const { hydrated, ownerId, pinned } = get();
    if (!hydrated) return 'not-ready';

    let next: string[];
    let result: TogglePinResult;
    if (pinned.includes(moduleId)) {
      next = pinned.filter((id) => id !== moduleId);
      result = 'unpinned';
    } else {
      const effective = pinned.filter((id) => availableIds.includes(id));
      if (effective.length >= MAX_PINNED_MODULES) return 'full';
      // Bỏ luôn các ghim mồ côi khi có ghim mới: giữ chúng chỉ làm mảng phình và đẩy ghim mới ra khỏi trần.
      next = [...effective, moduleId];
      result = 'pinned';
    }

    set({ pinned: next });
    if (typeof ownerId === 'string') void writeScoped(ownerId, STORAGE_NAME, { pinned: next });
    return result;
  },
}));
