import { Circle, G, Rect } from 'react-native-svg';

type Puff = readonly [cx: number, cy: number, r: number];

/** Ba vòng "bông" trên một viên bo tròn (x 4–36, y 12–22) — mây trong khung riêng 40 × 22. */
const PUFFS: readonly Puff[] = [
  [13, 13, 6],
  [22, 9, 8],
  [30, 14, 5.5],
];
/** Nét của lượt viền — chỉ NỬA ngoài còn thấy (nửa trong bị lượt nền che) ⇒ viền nhìn thấy 1.5dp. */
const OUTLINE_WIDTH = 3;

/**
 * Đám mây của cảnh chào (`GreetingIllustration`) — một NHÓM SVG, vẽ bên trong `<Svg>` của cảnh (không tự đứng một mình).
 *
 * Vẽ HAI lượt: lượt đầu nét dày màu viền, lượt sau nền đè lên ⇒ chỉ còn viền NGOÀI (nét ở chỗ các hình chồng nhau bị lượt
 * sau che) — khỏi tính cung tròn cho một `Path` liền. Màu do nơi gọi truyền (token qua `useThemeColors()`: nền `white-10`,
 * viền `border-1`) — ⛔ `fill`/`stroke` của SVG không nhận class, và không viết mã màu thô ở đây.
 */
export function GreetingCloud({
  fill,
  outline,
  transform,
}: {
  fill: string;
  outline: string;
  /** Chỗ đặt + cỡ mây trong khung cảnh, vd `translate(2 34)` · `translate(0 24) scale(1.3)`. */
  transform: string;
}) {
  return (
    <G transform={transform}>
      <CloudShape fill={outline} stroke={outline} />
      <CloudShape fill={fill} />
    </G>
  );
}

function CloudShape({ fill, stroke }: { fill: string; stroke?: string }) {
  const strokeWidth = stroke ? OUTLINE_WIDTH : 0;
  return (
    <G>
      <Rect
        fill={fill}
        height={10}
        rx={5}
        stroke={stroke}
        strokeWidth={strokeWidth}
        width={32}
        x={4}
        y={12}
      />
      {PUFFS.map(([x, y, r]) => (
        <Circle key={x} cx={x} cy={y} fill={fill} r={r} stroke={stroke} strokeWidth={strokeWidth} />
      ))}
    </G>
  );
}
