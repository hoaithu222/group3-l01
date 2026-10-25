/**
 * Splitter tv() recipe — kit2 token centralisation.
 * Component file (Splitter.tsx) only consumes slots from here.
 */
import { tv, type VariantProps } from 'tailwind-variants';

export const splitterStyles = tv({
  slots: {
    root: 'relative flex h-full w-full',
    paneFirst: 'min-w-0 min-h-0 overflow-hidden',
    paneSecond: 'min-w-0 min-h-0 overflow-hidden flex-1',
    handle: [
      'shrink-0 select-none touch-none',
      'bg-divider-1 hover:bg-primary-5/70 active:bg-primary-5',
      'transition-colors duration-150',
      'relative z-10',
    ].join(' '),
    handleGrip: [
      'absolute inset-0 flex items-center justify-center pointer-events-none',
      'text-fg-4',
    ].join(' '),
    // Đường preview khi kéo ở chế độ deferResize (commit size lúc thả chuột).
    ghost: 'absolute z-20 bg-primary-5 pointer-events-none',
  },
  variants: {
    orientation: {
      /*
       * ⛔ BẬC `touch:` — tay nắm 4px KHÔNG kéo được bằng ngón tay.
       *
       * Vạch 4px là mốc ĐÚNG cho chuột (con trỏ nhắm chính xác 1px), nhưng đầu
       * ngón tay có vùng tiếp xúc ~44px nên trên iPad người dùng chỉ chạm trúng
       * hai panel hai bên chứ không bao giờ tóm được vạch ⇒ **mất hẳn khả năng
       * chia lại tỉ lệ** (ví dụ: khung 3D / khung drill-down ở tab Dashboard của
       * `categories-components`).
       *
       * ⛔ NỚI BẰNG LỚP PHỦ VÔ HÌNH, KHÔNG NỚI BỀ DÀY VẠCH.
       *    Bản trước để `touch:w-3` (4 → 12px) và đó là một trong những chỗ
       *    người dùng báo "giao diện bị phóng to": vạch dày gấp ba chạy dọc suốt
       *    chiều cao màn là một mảng rất dễ thấy. Nay vạch giữ ĐÚNG 4px như trên
       *    laptop, chỉ có `::after` trong suốt phủ rộng ra hai bên nhận cú chạm.
       *
       *    `-inset-x-1.5` = 6px mỗi bên ⇒ vùng chạm 4 + 12 = 16px. Không nới to
       *    hơn: vùng chạm của tay nắm nằm ĐÈ lên mép hai panel, rộng quá thì cú
       *    chạm định bấm vào nội dung sát mép lại rơi vào tay nắm.
       *
       * `touch:` không bao giờ khớp trên PC/laptop ⇒ desktop giữ nguyên 4px.
       */
      horizontal: {
        root: 'flex-row',
        handle:
          "w-1 h-full cursor-col-resize touch:relative touch:after:absolute touch:after:-inset-x-1.5 touch:after:inset-y-0 touch:after:content-['']",
        ghost: 'top-0 bottom-0 w-0.5 -translate-x-1/2',
      },
      vertical: {
        root: 'flex-col',
        handle:
          "h-1 w-full cursor-row-resize touch:relative touch:after:absolute touch:after:-inset-y-1.5 touch:after:inset-x-0 touch:after:content-['']",
        ghost: 'left-0 right-0 h-0.5 -translate-y-1/2',
      },
    },
    dragging: {
      true: { handle: 'bg-primary-5' },
      false: {},
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
    dragging: false,
  },
});

export type SplitterRecipeVariants = VariantProps<typeof splitterStyles>;
export type SplitterOrientation = NonNullable<SplitterRecipeVariants['orientation']>;
