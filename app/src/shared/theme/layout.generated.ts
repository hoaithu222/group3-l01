/** Sinh tự động từ layout.json. ⛔ ĐỪNG SỬA TAY. */

export type RadiusToken =
  | 'none'
  | '3xs'
  | '2xs'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'full';

export type SpacingToken =
  | '3xs'
  | '2xs'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl';

export type ControlSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg';

export type IconSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl';

/** Bo góc, dp. Ở JSX ưu tiên class `rounded-<tên>`; đây là lối thoát cho SVG. */
export const RADIUS: Record<RadiusToken, number> = {
  'none': 0,
  '3xs': 4,
  '2xs': 8,
  'xs': 12,
  'sm': 16,
  'md': 24,
  'lg': 32,
  'full': 9999,
};

/** Giãn cách, dp — cho `contentContainerStyle`, `hitSlop`, `ItemSeparator`. */
export const SPACING: Record<SpacingToken, number> = {
  '3xs': 2,
  '2xs': 4,
  'xs': 8,
  'sm': 12,
  'md': 16,
  'lg': 20,
  'xl': 24,
  '2xl': 28,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
};

/**
 * Chiều cao control, dp.
 *
 * ⛔ Đừng hạ xuống dưới 40: ngưỡng vùng chạm tối thiểu mà cả Apple lẫn Google
 * khuyến nghị là 44dp. Cỡ `xs` (32) CHỈ dùng cho control nằm trong một hàng đã
 * có vùng chạm lớn hơn bọc ngoài (chip trong danh sách cuộn ngang chẳng hạn).
 */
export const CONTROL_HEIGHT: Record<ControlSize, number> = {
  'xs': 32,
  'sm': 40,
  'md': 48,
  'lg': 56,
};

/** Cỡ icon, dp — prop `size` của `<Icon>`. */
export const ICON_SIZE: Record<IconSize, number> = {
  'xs': 16,
  'sm': 20,
  'md': 24,
  'lg': 32,
  'xl': 40,
  '2xl': 48,
  '3xl': 56,
};

/** Nét viền, dp. */
export const BORDER_WIDTH = {
  'hairline': 1,
  'medium': 1.5,
  'thick': 2,
} as const;

export type BreakpointToken =
  | 'phone'
  | 'tablet'
  | 'tablet-lg';

/**
 * Ngưỡng bề rộng màn hình, dp — CÙNG số với class `tablet:`, `phone:`.
 *
 * Dùng cho những chỗ KHÔNG có className: số cột của lưới, `numColumns` của
 * FlashList, `numberOfLines`, chiều cao tấm trượt. ⛔ Đừng viết lại mấy con số
 * này tại chỗ — lệch với class là bố cục nhảy ở đúng một bề rộng và không ai
 * lần ra vì sao.
 *
 * Xem `useBreakpoint()` / `useResponsiveValue()` trong `@/shared/theme`.
 */
export const BREAKPOINTS: Record<BreakpointToken, number> = {
  'phone': 390,
  'tablet': 600,
  'tablet-lg': 840,
};

export type ContainerToken =
  | 'content';

/**
 * Trần bề rộng cột nội dung, dp — CÙNG số với class `max-w-<tên>`
 * (`tablet:max-w-content` của `Screen`, `AppBar`, `BottomActionBar`, tấm trượt…).
 *
 * Dùng cho phép tính cần biết khối nội dung rộng tối đa bao nhiêu: lề thật của
 * tấm trượt so với tai thỏ (`useSheetEdgeInset`), bề rộng thật của lưới tự
 * tính. ⛔ Đừng viết lại con số tại chỗ — lệch với class là phép tính sai đúng
 * ở máy tính bảng, nơi ít ai ngắm.
 */
export const CONTAINER_MAX_WIDTH: Record<ContainerToken, number> = {
  'content': 720,
};
