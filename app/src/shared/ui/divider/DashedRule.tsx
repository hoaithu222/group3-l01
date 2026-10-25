import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { useThemeColors, type ThemeColorKey } from '@/shared/theme';

/** Figma `dashPattern: [2, 2]` — gạch 2dp, hở 2dp, ở cả nét ngang lẫn nét dọc. */
const DASH_PATTERN = [2, 2];

interface DashedRuleProps {
  /** Token màu, KHÔNG phải mã màu: `stroke` của SVG không nhận className. */
  colorKey: ThemeColorKey;
  thickness: number;
  vertical: boolean;
}

/**
 * Nét đứt của `Divider`, vẽ bằng `react-native-svg`.
 *
 * ⛔ ĐỪNG thay bằng `borderStyle: 'dashed'` của React Native. Ba lý do, cái nào
 * cũng hỏng im lặng — nhìn màn hình thấy "gần đúng" nên rất khó lần:
 *
 *  · Android chỉ vẽ nét đứt khi bề rộng viền ≥ 1dp. Divider mặc định ở đây là
 *    `StyleSheet.hairlineWidth` (0.33–0.5dp) ⇒ Android vẽ ra NÉT LIỀN, vài máy
 *    thì mất hẳn đường kẻ. Không có lỗi nào báo.
 *  · Độ dài gạch/khoảng hở do nền tảng tự quyết (xấp xỉ 3× bề rộng viền) và
 *    KHÁC nhau giữa iOS với Android. Figma quy định 2/2 — không có cách nào ép.
 *  · `View` chỉ có viền bốn cạnh, muốn thấy đúng một cạnh phải dựng ô cao 0 rồi
 *    cắt bằng `overflow: 'hidden'` — mẹo này vỡ mỗi lần RN đổi cách vẽ viền.
 *
 * SVG vẽ đúng 2/2 ở mọi mật độ màn hình và nhận cả bề rộng lẻ như 0.33.
 *
 * ⚠️ Phải ĐO rồi mới vẽ được: `<Line>` cần toạ độ điểm cuối bằng số thật.
 * `x2="100%"` thì tuỳ phiên bản `react-native-svg` mà hiểu hoặc không, và khi
 * không hiểu nó vẽ ra… không gì cả. Đo bằng `onLayout` tốn đúng một khung hình
 * đầu tiên trống — mắt không kịp thấy, nhưng chắc chắn đúng ở mọi bề rộng.
 */
export function DashedRule({ colorKey, thickness, vertical }: DashedRuleProps) {
  const colors = useThemeColors();
  const [length, setLength] = useState(0);

  return (
    <View
      className="flex-1"
      style={vertical ? { width: thickness } : { height: thickness }}
      onLayout={(event: LayoutChangeEvent) => {
        const { height, width } = event.nativeEvent.layout;
        setLength(vertical ? height : width);
      }}
    >
      {length > 0 ? (
        <Svg height={vertical ? length : thickness} width={vertical ? thickness : length}>
          {/* Trục giữa đặt ở `thickness / 2` để nét nằm TRỌN trong ô đã đo — vẽ ở 0
              thì một nửa bề rộng nét bị cắt mất, đường kẻ mảnh đi một nửa. */}
          <Line
            stroke={colors[colorKey]}
            strokeDasharray={DASH_PATTERN}
            strokeWidth={thickness}
            x1={vertical ? thickness / 2 : 0}
            x2={vertical ? thickness / 2 : length}
            y1={vertical ? 0 : thickness / 2}
            y2={vertical ? length : thickness / 2}
          />
        </Svg>
      ) : null}
    </View>
  );
}
