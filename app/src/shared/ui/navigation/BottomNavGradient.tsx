import { Defs, RadialGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';

/**
 * Nền của thanh tab dưới — dải màu xanh đậm phủ kín thanh.
 *
 * ── Số đo lấy từ Figma (`259:95676` = `Theme=Ma, Type=Menu`) ────────────────
 * `fills[0]` là `GRADIENT_RADIAL` đi từ `Background/Nav/From` (`#358676`) ra
 * `Background/Nav/To` (`#014A3E`) — token repo là `nav-from` / `nav-to`.
 * ⛔ Đây KHÔNG phải thanh nền trắng: cái nền trắng 90% trong cùng section là
 * component "bottom bar" (`259:95740`, thanh tác vụ nhanh Apple Pay / Trả góp),
 * một thứ khác hẳn.
 *
 * ── Vì sao vẽ bằng `react-native-svg` chứ không cài `expo-linear-gradient` ──
 * Cùng lý do với `ScreenGradient`: `expo-linear-gradient` có mã NATIVE, thêm
 * vào là cả nhóm phải dựng lại dev client. `react-native-svg` đã nằm sẵn trong
 * bản dựng (bộ icon dùng nó). Thêm nữa, bản vẽ dùng gradient TOẢ TRÒN mà
 * `expo-linear-gradient` không vẽ được — muốn tròn thì vẫn phải quay về SVG.
 *
 * ⚠️ Màu lấy qua `useThemeColors()` chứ không phải `className`: `Stop` của
 * `react-native-svg` nhận màu ở prop `stopColor`, mà NativeWind chỉ dịch
 * `className` sang `style` — class đặt lên đây bị bỏ qua ÂM THẦM và dải màu ra
 * đen thui.
 *
 * ── Chưa dựng ───────────────────────────────────────────────────────────────
 * Bản vẽ còn có `BACKGROUND_BLUR: 12` và hai lớp ảnh hoạ tiết (opacity 0.3 và
 * 0.5) chồng lên gradient. React Native không có làm mờ hậu cảnh, còn hai ảnh
 * hoạ tiết thì chưa được xuất ra `assets/`. Thiếu chúng thanh vẫn đúng tông
 * màu, chỉ phẳng hơn bản vẽ một chút.
 */
export function BottomNavGradient() {
  const colors = useThemeColors();

  return (
    <Svg height="100%" width="100%">
      <Defs>
        {/**
         * `gradientUnits` để mặc định (`objectBoundingBox`): vòng tròn đơn vị bị
         * kéo theo khung hình chữ nhật của thanh, ra đúng hình elip rộng như
         * bản vẽ. `r="70%"` để màu cuối kịp tới trước khi chạm bốn góc — nhỏ hơn
         * thì bốn góc bị bệt một mảng `nav-to` phẳng.
         */}
        <RadialGradient cx="50%" cy="50%" id="screen-bottom-nav" r="70%">
          <Stop offset="0" stopColor={colors['nav-from']} />
          <Stop offset="1" stopColor={colors['nav-to']} />
        </RadialGradient>
      </Defs>
      <Rect fill="url(#screen-bottom-nav)" height="100%" width="100%" x="0" y="0" />
    </Svg>
  );
}
