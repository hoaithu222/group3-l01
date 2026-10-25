import { type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { useThemeColors, type ThemeColorKey } from '@/shared/theme';

/**
 * Vòng đo (đồng hồ còn lại, điểm số, điểm trong lịch sử) — vẽ bằng `react-native-svg`.
 *
 * ── Vì sao KHÔNG dùng `ProgressRing` của bộ chung ────────────────────────────────────────────────────────────────────
 * `ProgressRing` chỉ có ba tông (`brand`/`error`/`success`) và nền vòng `bg-3` (trên thẻ trắng chỉ 1.07:1 — vòng điểm to
 * mà đường nền biến mất). Thi thử cần tông `info` (bản sắc chế độ, `STUDY_MODE_META.mock`) và `warning` (đồng hồ sắp hết
 * giờ), và một vạch mốc ngưỡng đạt. Thêm tông vào bộ chung là việc của `src/shared/ui/` (ngoài phạm vi màn Thi thử) — khi
 * nào bộ chung có đủ tông thì thay file này bằng `ProgressRing`.
 *
 * ⚠️ Vòng chỉ là HÌNH: nghĩa (số phút còn lại, điểm %) phải nằm ở chữ/nhãn trợ năng của nơi dùng. Phần SVG bị ẩn khỏi
 * trình đọc màn hình; `children` (chữ ở tâm) thì KHÔNG bị ẩn.
 */
export type RingTone = 'error' | 'info' | 'success' | 'warning';

const TONE_COLOR: Record<RingTone, ThemeColorKey> = {
  error: 'action-error',
  info: 'action-info',
  success: 'action-success',
  warning: 'action-warning',
};

export interface RingGaugeProps {
  /** Nội dung ở TÂM vòng (số điểm, icon). ⚠️ Phải vừa trong `size − 2×strokeWidth`. */
  children?: ReactNode;
  /** Vạch mốc 0..1 — vd. ngưỡng đạt: một nét ngắn cắt ngang vòng. */
  marker?: number;
  /** Tiến độ 0..1 (ngoài khoảng bị kẹp lại; `NaN` = 0). */
  progress: number;
  /** Đường kính (dp). */
  size: number;
  /** Bề dày nét (dp). Mặc định ~1/10 đường kính, tối thiểu 3. */
  strokeWidth?: number;
  tone: RingTone;
}

export function RingGauge({ children, marker, progress, size, strokeWidth, tone }: RingGaugeProps) {
  const colors = useThemeColors();
  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const stroke = strokeWidth ?? Math.max(3, Math.round(size / 10));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Vòng bắt đầu ở 12 giờ và chạy theo chiều kim đồng hồ (`rotation={-90}` bên dưới) — vạch mốc dùng cùng gốc góc.
  const angle =
    marker === undefined ? 0 : -Math.PI / 2 + 2 * Math.PI * Math.min(1, Math.max(0, marker));
  const inner = radius - stroke / 2 - 2;
  const outer = radius + stroke / 2 + 2;

  return (
    <View style={{ height: size, width: size }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <Svg height={size} width={size}>
          <Circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={colors['border-2']}
            strokeWidth={stroke}
          />
          {clamped > 0 ? (
            <Circle
              cx={center}
              cy={center}
              fill="none"
              originX={center}
              originY={center}
              r={radius}
              rotation={-90}
              stroke={colors[TONE_COLOR[tone]]}
              strokeDasharray={`${String(circumference * clamped)} ${String(circumference)}`}
              strokeLinecap="round"
              strokeWidth={stroke}
            />
          ) : null}
          {marker === undefined ? null : (
            <Line
              stroke={colors['fg-1']}
              strokeLinecap="round"
              strokeWidth={2}
              x1={center + inner * Math.cos(angle)}
              x2={center + outer * Math.cos(angle)}
              y1={center + inner * Math.sin(angle)}
              y2={center + outer * Math.sin(angle)}
            />
          )}
        </Svg>
      </View>
      {children ? (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </View>
  );
}
