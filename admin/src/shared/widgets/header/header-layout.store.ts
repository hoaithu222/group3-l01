/**
 * Header layout store — KIỂU BỐ CỤC của cụm tâm thanh header, do người dùng
 * chọn. Lưu `localStorage` (cùng cách với theme) nên chọn xong là nhớ luôn.
 *
 *   floating — Bảng tên canh giữa TUYỆT ĐỐI thanh (mặc định). Từ 1280px trở
 *              lên cụm tâm rời khỏi luồng flex nên bề rộng hai cụm mép không
 *              làm lệch tâm tiêu đề.
 *   inline   — Bảng tên nằm SÁT cụm trái, giữa thanh để trống. Gọn nhất, hợp
 *              màn hẹp hoặc trang có nhiều chip ở hai mép.
 *
 * ⚠️ Đây là store CỤC BỘ CỦA WIDGET (giống `command-palette-store.ts`), KHÔNG
 *    phải store của app: `<Header>` vẫn không phụ thuộc `@/app/**` nên dùng
 *    lại được ở showcase/test. Chỉ mỗi sở thích hiển thị nằm ở đây.
 *
 * ⛔ Dưới 1280px `floating` TỰ chạy trong luồng flex (xem variant `layout`
 *    trong `header.theme.ts`) — đừng thêm nhánh JS đo bề rộng để đổi kiểu.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type HeaderLayout = 'floating' | 'inline';

/** Thứ tự xoay vòng khi bấm mục "Kiểu header" trong menu người dùng. */
export const HEADER_LAYOUT_ORDER: readonly HeaderLayout[] = ['floating', 'inline'];

export const HEADER_LAYOUT_LABEL: Record<HeaderLayout, string> = {
  floating: 'Tiêu đề giữa',
  inline: 'Tiêu đề bên trái',
};

interface HeaderLayoutState {
  layout: HeaderLayout;
  setLayout: (layout: HeaderLayout) => void;
  cycleLayout: () => void;
}

export const useHeaderLayoutStore = create<HeaderLayoutState>()(
  persist(
    (set, get) => ({
      layout: 'floating',

      setLayout: (layout) => set({ layout }),

      cycleLayout: () => {
        const idx = HEADER_LAYOUT_ORDER.indexOf(get().layout);
        set({ layout: HEADER_LAYOUT_ORDER[(idx + 1) % HEADER_LAYOUT_ORDER.length] });
      },
    }),
    {
      name: 'header-layout-storage',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      /**
       * Dữ liệu cũ có thể mang `layout` không còn hợp lệ (đổi tên kiểu, hoặc
       * người dùng nghịch tay trong DevTools). Nắn về mặc định thay vì tin:
       * một giá trị lạ rơi vào `tv()` sẽ KHÔNG khớp variant nào, cụm tâm mất
       * sạch class bố cục và tụt về một hộp trần — đúng kiểu lỗi câm khó truy.
       */
      migrate: (persisted) => {
        const prev = (persisted ?? {}) as Partial<HeaderLayoutState>;
        const known = HEADER_LAYOUT_ORDER.includes(prev.layout as HeaderLayout);
        return { layout: known ? (prev.layout as HeaderLayout) : 'floating' };
      },
      // Chỉ lưu dữ liệu — hàm không serialize được.
      partialize: (state) => ({ layout: state.layout }),
    },
  ),
);

/**
 * Kiểu bố cục hiện hành.
 *
 * `?? 'floating'` là PHÒNG THỦ có chủ ý: trong lúc HMR / persist rehydrate,
 * selector có thể trả `undefined` và cụm tâm sẽ mất sạch class bố cục.
 */
export function useHeaderLayout(): HeaderLayout {
  return useHeaderLayoutStore((s) => s?.layout) ?? 'floating';
}
