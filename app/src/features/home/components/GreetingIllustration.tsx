import { useId } from 'react';
import { View } from 'react-native';
import { Circle, Defs, G, Line, Path, RadialGradient, Stop, Svg } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';
import { Sparkles } from '@/shared/ui/effects';
import { Reveal } from '@/shared/ui/motion';

import type { GreetingScene } from '../utils/greeting.utils';

import { GreetingCloud } from './GreetingCloud';

type Star = readonly [x: number, y: number, size: number];
type Disc = readonly [cx: number, cy: number, r: number];

/** Cạnh khung (dp) = cạnh `viewBox` ⇒ mọi toạ độ bên dưới là dp thật. */
const SIZE = 72;
const FRAME = { height: SIZE, width: SIZE } as const;

/** Ngôi sao bốn cánh (✦) khung 24 — CÙNG dáng sao của `Sparkles`: sao tĩnh và sao lấp lánh là một họ. */
const STAR_PATH =
  'M12 0C12.7 6.2 17.8 11.3 24 12C17.8 12.7 12.7 17.8 12 24C11.3 17.8 6.2 12.7 0 12C6.2 11.3 11.3 6.2 12 0Z';

/**
 * ⚠️ Góc dưới-phải (quanh (58, 58), bán kính 22) là chỗ ảnh đại diện đè lên (`HomeGreeting`) — không đặt gì cần thấy ở đó.
 * Chỗ lấp lánh của `Sparkles` (trên-trái, trên-phải, dưới-trái) cũng được chừa ra: sao tĩnh không chồng lên sao động.
 */
const EVENING_STARS: readonly Star[] = [
  [50, 10, 9],
  [64, 27, 6],
  [26, 63, 6],
];
const NIGHT_STARS: readonly Star[] = [...EVENING_STARS, [7, 42, 5]];
const NIGHT_DOTS: readonly Disc[] = [
  [38, 4, 1.2],
  [4, 28, 1.2],
  [18, 52, 1],
];
/** Tám tia mềm của mặt trời buổi sáng (mỗi 45°). */
const RAY_ANGLES = Array.from({ length: 8 }, (_, index) => (index * Math.PI) / 4);

/** Thiên thể (tâm + bán kính), bán kính quầng và chỗ đặt mây (`GreetingCloud`, khung 40 × 22) của từng cảnh. */
const LAYOUT: Record<GreetingScene, { body: Disc; cloud?: string; glow: number }> = {
  afternoon: { body: [40, 26, 15], cloud: 'translate(0 24) scale(1.3)', glow: 26 },
  evening: { body: [30, 30, 17], glow: 30 },
  morning: { body: [44, 24, 11], cloud: 'translate(2 34)', glow: 24 },
  night: { body: [30, 30, 17], glow: 30 },
};

/**
 * Cảnh nhỏ (~72dp) cạnh lời chào Trang chủ, theo giờ (`getGreetingScene`): sáng — mặt trời toả tia + mây · chiều — mặt trời
 * khuất nửa sau mây · tối — trăng khuyết + ba sao · đêm — trăng + nhiều sao hơn. Cho khối chào có "trời hôm nay" thay vì chỉ
 * một dòng chữ.
 *
 * ✅ Màu CHỈ qua token (`useThemeColors()` — `fill`/`stroke` của SVG không nhận class): mặt trời `warning` + tia/quầng ấm,
 * mây `white-10` viền `border-1`, trăng `primary-3` viền `fg-brand`, sao `action-accent` ⇒ tự đổi theo sáng/tối.
 * ✅ Hiện MỘT lần (`Reveal` zoom, trễ sau khối chữ; tự tắt khi "Giảm chuyển động"). `Sparkles` chỉ ở tối/đêm — lấp lánh nhỏ,
 * không tính vào quỹ "một vòng lặp nổi bật" (vòng đó là `GlowOrbs` của khối chào); `active` = màn đang hiện.
 * ⛔ Trang trí thuần: ẩn khỏi trình đọc màn hình (hai prop ĐI CÙNG NHAU — iOS nghe prop đầu, Android nghe prop sau), không
 * ăn chạm. Nghĩa "buổi nào" đã nằm trong lời chào.
 */
export function GreetingIllustration({
  active = true,
  scene,
}: {
  active?: boolean;
  scene: GreetingScene;
}) {
  const colors = useThemeColors();
  const glowId = `greeting-glow-${useId().replace(/:/g, '')}`;
  const { body, cloud, glow } = LAYOUT[scene];
  const [cx, cy, r] = body;
  const lunar = scene === 'evening' || scene === 'night';
  const glowColor = colors[lunar ? 'primary-3' : 'warning'];

  return (
    <Reveal index={2} kind="zoom">
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={FRAME}
        testID={`greeting-illustration-${scene}`}
      >
        <Svg height={SIZE} viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`} width={SIZE}>
          <Defs>
            <RadialGradient cx="50%" cy="50%" id={glowId} r="50%">
              <Stop offset="0" stopColor={glowColor} stopOpacity={0.4} />
              <Stop offset="0.6" stopColor={glowColor} stopOpacity={0.12} />
              <Stop offset="1" stopColor={glowColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={cx} cy={cy} fill={`url(#${glowId})`} r={glow} />

          {lunar ? (
            <G>
              <Path
                d={crescent(cx, cy, r)}
                fill={colors['primary-3']}
                stroke={colors['fg-brand']}
                strokeOpacity={0.5}
                strokeWidth={1.5}
              />
              {(scene === 'night' ? NIGHT_STARS : EVENING_STARS).map(([x, y, s]) => (
                <Path
                  key={`${String(x)}-${String(y)}`}
                  d={STAR_PATH}
                  fill={colors['action-accent']}
                  transform={`translate(${String(x - s / 2)} ${String(y - s / 2)}) scale(${String(s / 24)})`}
                />
              ))}
              {scene === 'night'
                ? NIGHT_DOTS.map(([x, y, dot]) => (
                    <Circle
                      key={`${String(x)}-${String(y)}`}
                      cx={x}
                      cy={y}
                      fill={colors['action-accent']}
                      r={dot}
                    />
                  ))
                : null}
            </G>
          ) : (
            <G>
              {scene === 'morning'
                ? RAY_ANGLES.map((angle) => (
                    <Line
                      key={angle}
                      stroke={colors['action-accent']}
                      strokeLinecap="round"
                      strokeOpacity={0.7}
                      strokeWidth={2.5}
                      x1={cx + Math.cos(angle) * (r + 4)}
                      x2={cx + Math.cos(angle) * (r + 9)}
                      y1={cy + Math.sin(angle) * (r + 4)}
                      y2={cy + Math.sin(angle) * (r + 9)}
                    />
                  ))
                : null}
              <Circle cx={cx} cy={cy} fill={colors.warning} r={r} />
              {cloud ? (
                <GreetingCloud
                  fill={colors['white-10']}
                  outline={colors['border-1']}
                  transform={cloud}
                />
              ) : null}
            </G>
          )}
        </Svg>
        {lunar ? <Sparkles active={active} count={scene === 'night' ? 4 : 2} size={8} /> : null}
      </View>
    </Reveal>
  );
}

/**
 * Trăng khuyết = đĩa (cx, cy, r) TRỪ một đĩa "cắn" lệch lên-phải (tâm +0.45r / −0.35r, bán kính 0.85r): đi cung LỚN của đĩa
 * ngoài qua phía sáng (dưới-trái) giữa hai giao điểm, rồi về theo cung của đĩa cắn.
 * ⚠️ Không "khoét" bằng một đĩa màu nền hay `Mask`: sau cảnh là quầng `GlowOrbs` đang trôi, không phải một màu đặc — đĩa khoét
 * sẽ hiện thành một mảng lệch màu.
 */
function crescent(cx: number, cy: number, r: number): string {
  const bx = 0.45 * r;
  const by = -0.35 * r;
  const br = 0.85 * r;
  const d = Math.hypot(bx, by);
  const a = (r * r - br * br + d * d) / (2 * d);
  const h = Math.sqrt(r * r - a * a);
  const ux = bx / d;
  const uy = by / d;
  const px = cx + a * ux;
  const py = cy + a * uy;
  // Hai giao điểm = chân đường nối tâm ± h theo pháp tuyến (−uy, ux). `tip(1)`: mũi dưới-phải · `tip(-1)`: mũi trên.
  const tip = (sign: number) =>
    `${(px - sign * h * uy).toFixed(2)} ${(py + sign * h * ux).toFixed(2)}`;
  return `M${tip(-1)}A${String(r)} ${String(r)} 0 1 0 ${tip(1)}A${String(br)} ${String(br)} 0 0 1 ${tip(-1)}Z`;
}
