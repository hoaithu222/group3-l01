import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useThemeColors, type ThemeColorKey } from '@/shared/theme';

import type { AnswerShapeName } from '../constants/live-quiz-visuals';

/** Đường viền các hình trong khung 24×24 (tâm 12,12). Ngôi sao/lục giác/tam giác/thoi — hình tròn và vuông vẽ bằng phần tử riêng. */
const PATHS: Record<Exclude<AnswerShapeName, 'circle' | 'square'>, string> = {
  diamond: 'M12 2 L22 12 L12 22 L2 12 Z',
  hexagon: 'M12 2 L20.7 7 L20.7 17 L12 22 L3.3 17 L3.3 7 Z',
  star: 'M12 2 L14.5 8.6 L21.5 8.9 L16 13.3 L17.9 20.1 L12 16.2 L6.1 20.1 L8 13.3 L2.5 8.9 L9.5 8.6 Z',
  triangle: 'M12 3 L22 20 L2 20 Z',
};

export interface AnswerShapeProps {
  /** Màu hình — TÊN TOKEN (SVG không nhận `className`); thường là `inkToken` của bộ nhận diện. */
  color: ThemeColorKey;
  shape: AnswerShapeName;
  size?: number;
}

/**
 * Hình khối nhận biết đáp án (tam giác · thoi · tròn · vuông · lục giác · sao). Là kênh nhận biết THỨ HAI cạnh chữ cái để người
 * mù màu không phải dựa vào màu. Vẽ bằng `react-native-svg` (hình học, không phải icon — bộ icon không có hình nào trong số này);
 * nét viền cùng màu bo tròn góc cho hình mềm hơn. TRANG TRÍ thuần: nghĩa nằm ở chữ cái/nhãn của ô ⇒ ẩn khỏi trình đọc màn hình.
 */
export function AnswerShape({ color, shape, size = 24 }: AnswerShapeProps) {
  const colors = useThemeColors();
  const paint = colors[color];
  const stroke = { stroke: paint, strokeLinejoin: 'round', strokeWidth: 2 } as const;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        {shape === 'circle' ? (
          <Circle cx={12} cy={12} fill={paint} r={9} {...stroke} />
        ) : shape === 'square' ? (
          <Rect fill={paint} height={16} rx={2} width={16} x={4} y={4} {...stroke} />
        ) : (
          <Path d={PATHS[shape]} fill={paint} {...stroke} />
        )}
      </Svg>
    </View>
  );
}
