import { useId } from 'react';
import { View } from 'react-native';
import { Circle, Defs, RadialGradient, Stop, Svg } from 'react-native-svg';

import { type ThemeColorKey, useThemeColors } from '@/shared/theme';
import type { IconTileTone } from '@/shared/ui/icon-tile';

/**
 * Màu MỰC theo tông — cùng cặp với `TONE_INK` của `IconTile` (bảng đó chưa export) để quầng CÙNG màu với icon của thẻ.
 * ⚠️ `IconTile` đổi bảng màu tông thì đổi cả ở đây.
 */
const TONE_GLOW: Record<IconTileTone, ThemeColorKey> = {
  accent: 'action-accent',
  brand: 'fg-brand',
  danger: 'error',
  info: 'info',
  neutral: 'fg-2',
  success: 'success',
  warning: 'warning',
};

/**
 * Quầng màu TĨNH ở góc trên-phải thẻ hero, theo tông của phân hệ (`moduleTone`) — hai thẻ hero đứng cạnh nhau có "màu"
 * riêng thay vì hai mảng `bg-1` giống hệt. Tâm quầng đặt ĐÚNG góc thẻ (nửa quầng nằm ngoài, bị `overflow-hidden` của thẻ
 * cắt) ⇒ chỗ đậm nhất rơi vào góc bo — nơi không có chữ.
 *
 * ⚠️ Tâm chỉ 16%, phai hết sau 48dp: mô tả `fg-2` ở nửa DƯỚI thẻ nằm ngoài quầng, tên `fg-1` ở nửa trên chỉ nhận ≤ 9% (vẫn
 * > 10:1). Đổi cỡ/độ đậm thì đo lại — `check:contrast` không thấy màu trong SVG.
 * ⛔ Tĩnh, không lặp: Trang chủ đã có MỘT vòng lặp nổi bật (`GlowOrbs` sau lời chào).
 * ⛔ Trang trí: ẩn khỏi trình đọc màn hình, không ăn chạm. Đặt làm con ĐẦU của khối thẻ (anh em vẽ sau nằm trên).
 */
export function HomeHeroGlow({ tone }: { tone: IconTileTone }) {
  const colors = useThemeColors();
  const id = `hero-glow-${useId().replace(/:/g, '')}`;
  const color = colors[TONE_GLOW[tone]];

  return (
    <View
      accessibilityElementsHidden
      className="absolute -right-12 -top-12 h-24 w-24"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg height="100%" width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="50%" id={id} r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.16} />
            <Stop offset="0.6" stopColor={color} stopOpacity={0.06} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50%" cy="50%" fill={`url(#${id})`} r="50%" />
      </Svg>
    </View>
  );
}
