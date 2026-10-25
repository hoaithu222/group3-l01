import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';

/**
 * Dải chuyển màu ở đầu màn hình — lớp nền chung của mọi màn trong app.
 *
 * ── Vì sao vẽ bằng `react-native-svg` chứ không cài `expo-linear-gradient` ──
 * React Native không có `linear-gradient`, nên thường phải thêm một gói. Nhưng
 * `expo-linear-gradient` có mã NATIVE: thêm nó là phải dựng lại bản dev client,
 * và mọi người trong nhóm phải cài lại app trên máy. `react-native-svg` thì ĐÃ
 * có sẵn trong dự án (bộ icon dùng nó), tức module native đã nằm trong bản dựng
 * — vẽ gradient bằng nó không tốn thêm lần build nào.
 *
 * ── Số đo lấy từ Figma "Background Screen" (`259:94379`) ────────────────────
 *   · đỉnh:  `Background/Gradient/BgHeaderScreen1` = `#A6CDCC` ở 90%
 *   · đáy:   chuyển hết về đúng màu nền màn hình ở mốc 20% chiều cao
 *
 * Điểm dừng cuối để độ trong 0 thay vì tô màu nền: nhờ vậy dải này dùng lại
 * được trên nền BẤT KỲ (màn có ảnh bìa, thẻ màu) mà không vẽ đè một mảng
 * `bg-base` lên trên.
 *
 * ⚠️ `width`/`height` để `100%` chứ không đo bằng `onLayout` — đo thì khung
 * hình đầu tiên vẽ ra rỗng rồi mới nhảy, thấy rõ trên máy chậm.
 */
export function ScreenGradient() {
  const colors = useThemeColors();

  return (
    <Svg height="100%" width="100%">
      <Defs>
        <LinearGradient id="screen-top" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={colors['header-from']} stopOpacity="0.9" />
          <Stop offset="1" stopColor={colors['header-to']} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#screen-top)" height="100%" width="100%" x="0" y="0" />
    </Svg>
  );
}
