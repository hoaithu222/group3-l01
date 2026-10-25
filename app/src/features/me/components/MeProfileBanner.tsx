import { View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';
import { GlowOrbs } from '@/shared/ui';

export interface MeProfileBannerProps {
  /** Cho quầng sáng trôi — `useIsScreenFocused()` của màn: dừng khi sang tab khác / app xuống nền. */
  active: boolean;
}

/**
 * Lớp nền trang trí của thẻ hồ sơ: dải gradient tông thương hiệu ở đầu thẻ (96dp) tan dần vào nền thẻ + quầng sáng trôi
 * rất chậm (`GlowOrbs`) cho khoảng đầu thẻ có chiều sâu. Nơi gọi (`MeProfileCard`) phải `overflow-hidden` + bo góc.
 *
 * ── ⚠️ Vì sao quầng phủ CẢ thẻ chứ không chỉ dải 96dp ──────────────────────
 * `GlowOrbs` tự cắt ở mép khung của nó; khung chỉ cao bằng dải thì quầng dưới (tâm nằm ở ĐÁY khung) bị cắt ngang thành một
 * vệt thẳng ngay trên tên — lộ rõ ở chế độ tối. Phủ cả thẻ thì mép cắt là chính viền bo của thẻ. Chữ nằm trên quầng vẫn
 * đạt AA nhờ `intensity="subtle"` (60% — mức `GlowOrbs` dành cho nền SAU chữ dày; chế độ sáng chỉ LÀM SÁNG, xem bảng màu ở đó).
 * ⛔ Đây là vòng lặp nổi bật DUY NHẤT của màn Tôi — đừng thêm `BorderBeam`/`ShimmerSweep loop` vào màn này.
 *
 * ── Vì sao `react-native-svg` chứ không `expo-linear-gradient` ───────────────
 * Cùng lý do `ScreenGradient`: gói kia có mã NATIVE (buộc dựng lại bản dev client), còn `react-native-svg` đã nằm sẵn
 * trong bản dựng. ⛔ Đừng thêm `expo-linear-gradient`.
 *
 * ── Vì sao điểm dừng cuối để độ trong 0 chứ không tô màu nền thẻ ─────────────
 * Tan về TRONG SUỐT thì dải hoà đúng vào nền thẻ `bg-1` ở CẢ hai chế độ mà không phải đọc màu nền — tô cứng `bg-1` là một
 * mảng màu cứng lộ ra khi đổi token.
 *
 * ⚠️ Màu lấy từ token qua `useThemeColors()` vì `Stop` là prop của `react-native-svg`, KHÔNG nhận `className`
 * (`docs/rules/styling-nativewind.md`, mục "Khi prop KHÔNG nhận className"). Trang trí thuần ⇒ ẩn khỏi trình đọc màn hình,
 * không ăn cú chạm (avatar ngay phía trên lớp này phải nhận chạm).
 */
export function MeProfileBanner({ active }: MeProfileBannerProps) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityElementsHidden
      className="absolute inset-0"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <View className="absolute inset-x-0 top-0 h-24">
        <Svg height="100%" width="100%">
          <Defs>
            <LinearGradient id="me-profile-banner" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor={colors['header-from']} stopOpacity="1" />
              <Stop offset="1" stopColor={colors['header-from']} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#me-profile-banner)" height="100%" width="100%" x="0" y="0" />
        </Svg>
      </View>
      {/* ✅ Quầng thay cho hai đốm tròn TĨNH cũ (cùng vai "cho bớt phẳng") — để cả hai là chồng năm đốm lên một dải 96dp. */}
      <GlowOrbs active={active} intensity="subtle" />
    </View>
  );
}
