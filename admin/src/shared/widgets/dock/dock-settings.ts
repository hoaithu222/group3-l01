/**
 * Dock — cấu hình hành vi hiển thị + lưu lại giữa các phiên.
 *
 * BỐN CHẾ ĐỘ (`DockDisplayMode`):
 *  - `pinned`    : Ghim cố định — luôn hiện đầy đủ. **MẶC ĐỊNH của base.**
 *  - `autohide`  : Tự ẩn — thanh trượt xuống khuất; rê chuột xuống chính giữa
 *                  mép dưới thì nó trồi lên (giống "Automatically hide the
 *                  Dock" của macOS). Có vệt sáng mảnh ở đáy làm gợi ý.
 *  - `collapsed` : Thu gọn — co lại thành một tay nắm ba chấm sát đáy; rê chuột
 *                  hoặc bấm để bung ra.
 *  - `hidden`    : Ẩn hẳn — không còn gợi ý nào trên màn hình.
 *
 * ⛔ VÌ SAO MẶC ĐỊNH LÀ `pinned` CHỨ KHÔNG PHẢI `collapsed` NHƯ DỰ ÁN GỐC.
 *
 *    Dự án gốc chuyển mặc định sang `collapsed` khi Dock của nó đã có 17 phân
 *    hệ và người dùng cần lấy lại chiều cao màn hình. Base xuất xưởng với ĐÚNG
 *    MỘT phân hệ mẫu: mở app lần đầu mà chỉ thấy một tay nắm ba chấm thì người
 *    mới không có cách nào đoán ra đó là thanh điều hướng — trông y như lỗi
 *    "không thấy Dock đâu".
 *
 *    Đổi mặc định = sửa đúng MỘT giá trị trong `DEFAULT_DOCK_SETTINGS` bên
 *    dưới. Dự án dẫn xuất nào đã đủ nhiều phân hệ thì cứ đổi sang `'collapsed'`,
 *    KHÔNG phải sửa gì thêm.
 *
 * ⚠️ `hidden` KHÔNG bị loại khỏi danh sách chọn, nhưng ở base nó vẫn còn một
 *    lối về: rê chuột vào đúng dải 120×22px giữa mép dưới màn hình là thanh
 *    trồi lại (xem `Dock.tsx` §vùng kích hoạt). Dự án gốc bỏ hẳn lối đó vì đã
 *    có công tắc bật lại Dock trong menu người dùng trên thanh header; base
 *    CHƯA có công tắc đó, mà một chế độ không có đường quay lại thì là bẫy —
 *    người dùng chọn nhầm là mất Dock vĩnh viễn, chỉ xoá localStorage mới cứu
 *    được. Khi header của dự án dẫn xuất có công tắc, gỡ lối về này đi.
 *
 * `magnify`: bật/tắt phóng lân cận kiểu macOS — xem `dock-magnify.css` và
 * `DOCK_MAGNIFY_ITEM_CLASS` trong `dock.theme.ts`.
 *
 * Vì sao Zustand chứ không phải `useState` ở `Dock`: thiết lập phải sống lâu
 * hơn một lần mount và phải dùng chung cho nhiều nơi (thanh Dock + panel cấu
 * hình, và sau này là công tắc trên header). Đây là client state thuần —
 * `docs/rules/state-management.md` xếp đúng loại này cho Zustand.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BoldSystemIconName } from '@/shared/ui';

export type DockDisplayMode = 'pinned' | 'autohide' | 'collapsed' | 'hidden';

export interface DockSettings {
  /** Chế độ hiển thị của thanh Dock. */
  mode: DockDisplayMode;
  /** Phóng lân cận kiểu macOS khi rê chuột. */
  magnify: boolean;
}

/**
 * Giá trị xuất xưởng. Đổi `mode` ở ĐÂY để đổi mặc định cho cả dự án — đừng rải
 * giá trị mặc định ra component.
 */
export const DEFAULT_DOCK_SETTINGS: DockSettings = {
  mode: 'pinned',
  magnify: true,
};

/** Khoá localStorage. Cùng khuôn đặt tên với `theme-storage` / `display-storage`. */
const STORAGE_KEY = 'dock-storage';

/** Mô tả một chế độ — render thành một hàng trong panel cấu hình. */
export interface DockModeOption {
  value: DockDisplayMode;
  icon: BoldSystemIconName;
  label: string;
  desc: string;
}

/**
 * Thứ tự trong mảng = thứ tự hiện trên panel, xếp theo mức độ "hiện nhiều →
 * hiện ít" để người dùng đọc được thang độ mà không cần giải thích.
 */
export const DOCK_MODE_OPTIONS: ReadonlyArray<DockModeOption> = [
  {
    value: 'pinned',
    icon: 'location-pin-bold',
    label: 'Ghim cố định',
    desc: 'Luôn hiển thị Dock',
  },
  {
    value: 'autohide',
    icon: 'eye-slash-bold',
    label: 'Tự ẩn',
    desc: 'Hiện khi rê chuột vào giữa đáy',
  },
  {
    value: 'collapsed',
    icon: 'angle-up-bold',
    label: 'Thu gọn',
    desc: 'Co thành tay nắm nhỏ sát đáy',
  },
  {
    value: 'hidden',
    icon: 'do-not-enter-bold',
    label: 'Ẩn hoàn toàn',
    desc: 'Không để lại gợi ý nào trên màn',
  },
];

interface DockSettingsStore extends DockSettings {
  setMode: (mode: DockDisplayMode) => void;
  setMagnify: (magnify: boolean) => void;
}

/**
 * Store thiết lập Dock. Dùng selector để chỉ theo dõi đúng trường cần, tránh
 * render thừa:
 *
 *   const mode    = useDockSettings((s) => s.mode);
 *   const setMode = useDockSettings((s) => s.setMode);
 */
export const useDockSettings = create<DockSettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_DOCK_SETTINGS,
      setMode: (mode) => set({ mode }),
      setMagnify: (magnify) => set({ magnify }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      /**
       * Dữ liệu cũ có thể mang `mode` không còn hợp lệ (chế độ bị đổi tên, hoặc
       * người dùng nghịch tay trong DevTools). Nắn về mặc định thay vì tin —
       * một giá trị lạ sẽ rơi vào nhánh "không khớp chế độ nào" và Dock đứng im
       * không hiện, đúng kiểu lỗi câm khó truy.
       */
      migrate: (persisted) => {
        const prev = (persisted ?? {}) as Partial<DockSettings>;
        const knownMode = DOCK_MODE_OPTIONS.some((o) => o.value === prev.mode);
        return {
          mode: knownMode ? (prev.mode as DockDisplayMode) : DEFAULT_DOCK_SETTINGS.mode,
          magnify: typeof prev.magnify === 'boolean' ? prev.magnify : DEFAULT_DOCK_SETTINGS.magnify,
        };
      },
      // Chỉ lưu dữ liệu — hàm không serialize được.
      partialize: (state) => ({ mode: state.mode, magnify: state.magnify }),
    },
  ),
);
