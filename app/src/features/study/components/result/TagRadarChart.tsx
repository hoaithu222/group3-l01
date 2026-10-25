import { View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';

import type { MockTagScore } from '../../api/mock-attempts.types';
import {
  describeTagScores,
  radarVertices,
  tagLabel,
  tagPercent,
  toPoints,
} from '../../utils/mock-result-utils';
import { WEAK_TAG_PCT } from '../../utils/mock-score-utils';

const VIEW = 260;
const CENTER = VIEW / 2;
const RADIUS = 78;
const RINGS = [0.25, 0.5, 0.75, 1] as const;
const LABEL_MAX = 10;

function shortLabel(tag: string): string {
  const label = tagLabel(tag);
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
}

/**
 * Radar điểm theo chủ đề (app.md p4-02 §2 `TagRadarChart`) — `react-native-svg`, ⛔ KHÔNG thêm thư viện biểu đồ. Cần ≥ 3
 * thẻ (`RADAR_MIN_TAGS`); màn kết quả tự chuyển sang `TagBarList` khi ít hơn. Vẽ theo `viewBox` nên co giãn theo bề rộng
 * khối chứa (không đo tay, không `Dimensions`). Màu lấy từ token qua `useThemeColors` (prop SVG không nhận className):
 * đa giác tông `info` (bản sắc Thi thử), đỉnh của chủ đề YẾU (< 60%) chấm đỏ — và danh sách bên cạnh gắn nhãn chữ "Cần ôn"
 * cho đúng những chủ đề đó.
 *
 * ⚠️ Radar KHÔNG phải nguồn thông tin duy nhất: nhãn trợ năng đọc đủ `đúng/tổng` từng chủ đề và màn luôn hiện danh sách
 * thanh bên cạnh — đa giác chỉ giúp thấy nhanh chủ đề yếu.
 */
export function TagRadarChart({ scores }: { scores: readonly MockTagScore[] }) {
  const colors = useThemeColors();
  const n = scores.length;
  const outer = radarVertices(Array<number>(n).fill(1), CENTER, CENTER, RADIUS);
  const data = radarVertices(
    scores.map((s) => tagPercent(s) / 100),
    CENTER,
    CENTER,
    RADIUS,
  );
  const weak = scores.map((s) => tagPercent(s) < WEAK_TAG_PCT);
  const labels = radarVertices(Array<number>(n).fill(1), CENTER, CENTER, RADIUS + 16);

  return (
    <View
      accessibilityLabel={`Biểu đồ radar điểm theo chủ đề. ${describeTagScores(scores)}`}
      accessibilityRole="image"
      accessible
      className="aspect-square w-full"
    >
      <Svg height="100%" viewBox={`0 0 ${VIEW} ${VIEW}`} width="100%">
        {RINGS.map((ring) => (
          <Polygon
            key={ring}
            fill="none"
            points={toPoints(radarVertices(Array<number>(n).fill(ring), CENTER, CENTER, RADIUS))}
            stroke={colors['border-2']}
            strokeWidth={1}
          />
        ))}
        {outer.map((v, i) => (
          <Line
            key={`axis-${scores[i]?.tag ?? i}`}
            stroke={colors['border-2']}
            strokeWidth={1}
            x1={CENTER}
            x2={v.x}
            y1={CENTER}
            y2={v.y}
          />
        ))}
        <Polygon
          fill={colors['action-info']}
          fillOpacity={0.25}
          points={toPoints(data)}
          stroke={colors['action-info']}
          strokeWidth={2}
        />
        {data.map((v, i) => (
          <Circle
            key={`dot-${scores[i]?.tag ?? i}`}
            cx={v.x}
            cy={v.y}
            fill={colors[weak[i] ? 'action-error' : 'action-info']}
            r={4}
          />
        ))}
        {labels.map((v, i) => (
          <SvgText
            key={`label-${scores[i]?.tag ?? i}`}
            fill={colors['fg-2']}
            fontSize={11}
            textAnchor={v.x < CENTER - 4 ? 'end' : v.x > CENTER + 4 ? 'start' : 'middle'}
            x={v.x}
            y={v.y + 4}
          >
            {shortLabel(scores[i]?.tag ?? '')}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
