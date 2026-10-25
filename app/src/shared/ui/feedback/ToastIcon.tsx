import Svg, { Circle, Path } from 'react-native-svg';

import { ICON_SIZE, useThemeColors, type ThemeColorKey } from '@/shared/theme';

import { type ToastType } from './toast-store';

/**
 * Biểu tượng tròn đứng đầu mỗi toast — 24dp theo Figma (`_successful`,
 * `_info`, `_negative`, `_warning` trong component set `Toast` 259:97863).
 *
 * ⛔ VẼ TAY, CÓ LÝ DO — đừng thay bằng `<Icon>` mà không đọc hết đoạn này.
 *
 * Bộ icon xuất từ Figma CÓ đủ bốn cái tương ứng (`checkmark-circle`,
 * `alert-information`, `alert-warning-circle`, `cancel`), nhưng chúng KHÔNG
 * dùng được ở đây: dạng cần là **hình tròn đặc màu ngữ nghĩa + nét TRẮNG bên
 * trong**, mà trong bộ chỉ `checkmark-circle` có biến thể `solid` đúng dạng đó.
 * Ba cái còn lại chỉ có `linear`/`twotone`/`bulk` — nét rỗng, một màu. Ghép hai
 * kiểu vào cùng một hàng toast thì bốn loại thông báo trông không cùng một bộ.
 *
 * Toast mà không có biểu tượng thì mất hẳn dấu hiệu phân biệt lỗi với thành
 * công, vì phần còn lại (nền tối, chữ trắng) giống hệt nhau ở cả bốn loại — và
 * màu là thứ người mù màu không đọc được.
 *
 * Khi thiết kế bổ sung biến thể `solid` cho ba icon kia thì xoá cả file này và
 * thay bằng `<Icon name=… variant="solid" />`; không có nơi nào khác phải sửa.
 */

/** Nét vẽ bên trong, dựng trên khung 24×24 giống mọi icon khác của bộ. */
const GLYPH_PATH: Record<ToastType, string> = {
  // Dấu ✓.
  success: 'M7 12.4L10.4 15.8L17 8.6',
  // Thân dấu "!" — chấm nằm dưới, vẽ riêng bằng <Circle>.
  error: 'M12 6.6V13.4',
  warning: 'M12 6.6V13.4',
  // Thân chữ "i" — chấm nằm TRÊN, nên toạ độ ngược với dấu "!".
  info: 'M12 11V17.4',
};

/** Toạ độ y của chấm: dưới thân với `!`, trên thân với `i`, không có với ✓. */
const DOT_Y: Record<ToastType, number | undefined> = {
  success: undefined,
  error: 17,
  warning: 17,
  info: 7,
};

/**
 * Màu nền hình tròn — và màu nét bên trong, luôn đi THÀNH CẶP.
 *
 * ⛔ Nền đi qua họ `action-*`, KHÔNG qua token ngữ nghĩa trần (`success`,
 * `warning`…). Bản cũ dùng token trần cộng với nét trắng cứng, và ở chế độ TỐI
 * thang ngữ nghĩa đảo sang màu sáng: `warning` = #F8CEB0, `success` = #B0DCB5,
 * `info` = #B6C7EA, `error` = #F3B0B0. Nét trắng trên đó đo được
 * 1.45 / 1.53 / 1.70 / 1.80:1 — toast lỗi và toast thành công đều thành một
 * CHẤM PASTEL RỖNG trên nền đen, tức là mất đúng cái dấu hiệu mà file này tồn
 * tại để cung cấp.
 *
 * Cặp `action-*` + `action-*-fg` đảo ĐỒNG BỘ (nền sáng ⇒ nét mực) nên đọc được
 * ở cả hai chế độ. ✅ Ở chế độ SÁNG màu tròn KHÔNG đổi: `action-error` =
 * #C30000 = `error`, `action-warning` = #D35801 = `warning`, `action-success` =
 * #00810E, `action-info` = #1043A9.
 *
 * ⛔ Đừng "sửa" bằng cách đổi nền toast sang màu sáng — nền toast (`ink-5/80`)
 * giống nhau ở hai chế độ và đó là điểm ĐÚNG của thiết kế này.
 */
const CIRCLE_COLOR: Record<ToastType, ThemeColorKey> = {
  success: 'action-success',
  error: 'action-error',
  warning: 'action-warning',
  info: 'action-info',
};

const GLYPH_COLOR: Record<ToastType, ThemeColorKey> = {
  success: 'action-success-fg',
  error: 'action-error-fg',
  warning: 'action-warning-fg',
  info: 'action-info-fg',
};

export function ToastIcon({ type }: { type: ToastType }) {
  const colors = useThemeColors();
  const circle = colors[CIRCLE_COLOR[type]];
  /**
   * ⛔ Nét lấy đúng `action-*-fg` của CÙNG tông, không phải trắng cứng và cũng
   * không phải `fg-inverse`. Xem chú thích ở `CIRCLE_COLOR` để biết vì sao —
   * trắng cứng làm biểu tượng biến mất ở chế độ tối.
   *
   * ✅ Ở chế độ sáng cả bốn `action-*-fg` đều là #FFFFFF, nên hình vẽ y hệt bản
   * cũ; chỉ chế độ tối lật sang màu mực (#2E1B00, #032516, #041631, #1F0404).
   */
  const glyph = colors[GLYPH_COLOR[type]];
  const dotY = DOT_Y[type];

  return (
    <Svg fill="none" height={ICON_SIZE.md} viewBox="0 0 24 24" width={ICON_SIZE.md}>
      <Circle cx={12} cy={12} fill={circle} r={12} />
      <Path
        d={GLYPH_PATH[type]}
        stroke={glyph}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      {dotY === undefined ? null : <Circle cx={12} cy={dotY} fill={glyph} r={1.2} />}
    </Svg>
  );
}
