import Svg, { G, Path } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';

import type { GanttEdgeDto } from '../../api/critical-path.types';
import { GANTT_ARROW_GAP } from '../../constants/critical-path.constants';
import { arrowHeadPath, arrowPath } from '../../utils/gantt-arrows';
import type { BarRect } from '../../utils/gantt-layout';

export interface GanttArrowsProps {
  /** Chỉ những cạnh có ít nhất một đầu trong dải hàng đang vẽ (`visibleEdges`). */
  edges: readonly GanttEdgeDto[];
  height: number;
  /** Hình chữ nhật thanh của một thẻ, `undefined` khi thẻ không có thanh (ngoài khoảng đang xem). */
  rectOf: (taskId: string) => BarRect | undefined;
  width: number;
}

/**
 * Mũi tên phụ thuộc giữa các thanh (app.md §2 `GanttArrows`, `react-native-svg`): nối MÉP PHẢI thanh trước → MÉP TRÁI thanh
 * sau. Đường găng (`slackDays ≤ 0`) vẽ ĐẬM hơn; xung đột lịch (`slackDays < 0`) vẽ NÉT ĐỨT — hai dấu hiệu phi màu, ngoài
 * màu đỏ/cam. Cạnh không xác định `slackDays` (thẻ sau đã xong) vẽ mảnh.
 *
 * Mũi tên là TRANG TRÍ (§7): ẩn khỏi trình đọc màn hình, không nhận chạm; quan hệ đọc được qua danh sách mốc
 * ("Xem dạng danh sách") và chip "Bị chặn bởi…".
 */
export function GanttArrows({ edges, height, rectOf, width }: GanttArrowsProps) {
  const colors = useThemeColors();

  return (
    <Svg
      accessibilityElementsHidden
      height={height}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ left: 0, position: 'absolute', top: 0 }}
      testID="gantt-arrows"
      width={width}
    >
      {edges.map((edge) => {
        const from = rectOf(edge.predecessorId);
        const to = rectOf(edge.successorId);
        if (!from || !to) return null;

        const slack = edge.slackDays;
        const conflict = slack !== null && slack < 0;
        const critical = slack !== null && slack <= 0;
        const color = conflict ? colors['action-warning'] : critical ? colors['action-error'] : colors['fg-3'];

        return (
          <G key={`${edge.predecessorId}>${edge.successorId}`}>
            {/* Đường nối để `fill="none"`: đường hở mà có `fill` thì SVG tô luôn vùng giữa đường và dây cung đóng. */}
            <Path
              d={arrowPath(from, to, GANTT_ARROW_GAP)}
              fill="none"
              stroke={color}
              strokeDasharray={conflict ? '4 3' : undefined}
              strokeLinejoin="round"
              strokeWidth={critical ? 2.5 : 1.5}
            />
            <Path d={arrowHeadPath(to.x, to.y + to.height / 2)} fill={color} />
          </G>
        );
      })}
    </Svg>
  );
}
