import { memo } from 'react';
import { View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';

/**
 * Lớp tối mờ dần ở ĐÁY ô (scrim kiểu Google Meet M3): tên + chip trạng thái đọc được trên MỌI khung hình (video sáng hay tối) mà không
 * phải phủ cả hàng viên xám che video như trước.
 *
 * ⚠️ `ink-10` là THANG màu (giống nhau ở hai theme) — đúng thứ sân khấu luôn tối cần. Màu đi qua `useThemeColors()` vì `Stop` của SVG
 * nhận `stopColor`, không nhận `className`. Tĩnh (không hoạt ảnh), ẩn khỏi trình đọc màn hình, không nhận chạm. `memo` không prop ⇒ chỉ
 * vẽ lại khi đổi theme, không theo snapshot.
 */
function TileScrimBase() {
  const colors = useThemeColors();

  return (
    <View
      accessibilityElementsHidden
      className="absolute inset-0"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg height="100%" width="100%">
        <Defs>
          <LinearGradient id="meeting-tile-scrim" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={colors['ink-10']} stopOpacity={0} />
            <Stop offset="1" stopColor={colors['ink-10']} stopOpacity={0.85} />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#meeting-tile-scrim)" height="100%" width="100%" x="0" y="0" />
      </Svg>
    </View>
  );
}

export const TileScrim = memo(TileScrimBase);
