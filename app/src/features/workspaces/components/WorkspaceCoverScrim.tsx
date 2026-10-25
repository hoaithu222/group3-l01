import { View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';

/**
 * Lớp phủ tan dần ở NỬA DƯỚI bìa về màu nền thẻ: bìa không còn cắt ngang thành một mép cứng ngay sau avatar, và vành
 * avatar đè lên mép bìa nổi hơn trên ảnh sặc sỡ. ⚠️ Nhẹ (tối đa 50%) — ảnh người quản trị đã chọn vẫn phải nhìn ra.
 * Không có chữ nào nằm trên bìa (tên/mô tả đặt trên nền `bg-1` của thẻ) nên lớp này KHÔNG gánh tương phản; tan về `bg-1`
 * (qua `useThemeColors()`, vì `Stop` của `react-native-svg` không nhận `className`) nên khớp nền thẻ ở cả hai chế độ.
 * Trang trí ⇒ ẩn khỏi trình đọc, không ăn chạm. Tách khỏi `WorkspaceOverviewHero` để giữ file đó dưới trần 200 dòng.
 */
export function WorkspaceCoverScrim() {
  const colors = useThemeColors();

  return (
    <View
      accessibilityElementsHidden
      className="absolute inset-x-0 bottom-0 h-1/2"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg height="100%" width="100%">
        <Defs>
          <LinearGradient id="ws-cover-scrim" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={colors['bg-1']} stopOpacity="0" />
            <Stop offset="1" stopColor={colors['bg-1']} stopOpacity="0.5" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#ws-cover-scrim)" height="100%" width="100%" x="0" y="0" />
      </Svg>
    </View>
  );
}
