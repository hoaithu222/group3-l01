/** Sinh tự động từ typography.json. ⛔ ĐỪNG SỬA TAY. */
import type { TextStyle } from 'react-native';

/**
 * Tên họ font, cho prop `fontFamily` THÔ (React Navigation, Animated.Text,
 * `<Text>` của react-native-svg). Ở JSX thường thì không cần — class
 * `font-sans` đã trỏ về đúng họ này.
 *
 * ⛔ Đừng viết lại chuỗi này bằng tay ở nơi khác: lệch một ký tự là chữ rơi về
 * font hệ thống, không có lỗi nào báo.
 */
export const FONT_FAMILY = 'Plus Jakarta Sans';

export type TypographyRole =
  | 'display'
  | 'header-lg'
  | 'header-md'
  | 'header-sm'
  | 'body-lg'
  | 'body-md'
  | 'label-lg'
  | 'label-md'
  | 'label-sm'
  | 'label-xs'
  | 'caption-lg'
  | 'caption-sm'
  | 'link-lg'
  | 'link-md'
  | 'overline';

export const TYPOGRAPHY_ROLES = [
  'display',
  'header-lg',
  'header-md',
  'header-sm',
  'body-lg',
  'body-md',
  'label-lg',
  'label-md',
  'label-sm',
  'label-xs',
  'caption-lg',
  'caption-sm',
  'link-lg',
  'link-md',
  'overline',
] as const satisfies readonly TypographyRole[];

/**
 * Số đo chữ theo vai trò — dùng cho prop `style` khi KHÔNG dùng được className.
 * Ưu tiên className (`text-body`) ở mọi chỗ có thể; đây là lối thoát, không
 * phải lối chính.
 */
export const TEXT_STYLES: Record<TypographyRole, TextStyle> = {
  'display': { fontSize: 36, lineHeight: 47 },
  'header-lg': { fontSize: 28, lineHeight: 37 },
  'header-md': { fontSize: 24, lineHeight: 32 },
  'header-sm': { fontSize: 18, lineHeight: 24 },
  'body-lg': { fontSize: 16, lineHeight: 24 },
  'body-md': { fontSize: 14, lineHeight: 20 },
  'label-lg': { fontSize: 16, lineHeight: 24 },
  'label-md': { fontSize: 14, lineHeight: 20 },
  'label-sm': { fontSize: 12, lineHeight: 16 },
  'label-xs': { fontSize: 10, lineHeight: 16 },
  'caption-lg': { fontSize: 13, lineHeight: 17 },
  'caption-sm': { fontSize: 12, lineHeight: 16 },
  'link-lg': { fontSize: 16, lineHeight: 21 },
  'link-md': { fontSize: 14, lineHeight: 20 },
  'overline': { fontSize: 12, lineHeight: 18, letterSpacing: 0.6, textTransform: 'uppercase' },
};

/**
 * Vai trò dành cho chữ IN HOA — lineHeight của nó đã được kiểm theo ngưỡng
 * 1.5× (đo từ chính file font). ⛔ Đừng tự thêm `uppercase` lên
 * vai trò khác: ngưỡng của vai trò đó KHÔNG kiểm cho trường hợp này, và dấu
 * tiếng Việt sẽ bị Android cắt.
 */
export const UPPERCASE_ROLES = [
  'overline',
] as const satisfies readonly TypographyRole[];

export type FontWeightName =
  | 'regular'
  | 'medium'
  | 'semibold'
  | 'bold';

export const FONT_WEIGHTS: Record<FontWeightName, TextStyle['fontWeight']> = {
  'regular': '400',
  'medium': '500',
  'semibold': '600',
  'bold': '700',
};
