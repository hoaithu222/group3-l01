import { View } from 'react-native';
import { Circle, G, Path, Rect, Svg } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';

/** Khung vẽ 72×64 — vừa cột phải của thẻ "Hôm nay" mà chữ bên trái vẫn còn ~180dp ở máy 320dp (tiêu đề tối đa 2 dòng). */
const W = 72;
const H = 64;
/** Tâm xoay của xấp thẻ: giữa đáy — ba lá xoè ra như bài cầm trên tay. */
const PIVOT = '36, 58';
/** Một lá thẻ 30×40 đứng giữa khung, đáy chạm tâm xoay. */
const CARD = { height: 40, rx: 6, width: 30, x: 21, y: 18 } as const;

export interface SrDueArtProps {
  /** `due` = xấp thẻ xoè (còn thẻ chờ ôn) · `done` = xấp đã xếp gọn + dấu tick (xong phần hôm nay). */
  variant: 'done' | 'due';
}

/**
 * Hình minh hoạ nhỏ góc phải thẻ "Hôm nay" (`SrDueCard`) — vẽ bằng `react-native-svg`, mọi màu lấy từ token qua
 * `useThemeColors()` nên tự đổi theo sáng/tối.
 *
 * ✅ Tĩnh hoàn toàn: điểm nhấn CHUYỂN ĐỘNG duy nhất của màn Học là `BorderBeam` bọc thẻ; hình này không được thành vòng lặp thứ hai.
 * ⚠️ Trang trí thuần — nội dung đã nằm ở chữ bên cạnh ("12 thẻ cần ôn hôm nay"/"Đã hoàn thành hôm nay") nên ẩn khỏi trình đọc
 * màn hình và không ăn cú chạm.
 * ⛔ Dấu tick nằm trên nền `action-success` ⇒ nét dùng `action-success-fg` (ở chế độ tối nền đó là màu SÁNG, trắng sẽ biến mất —
 * `shared/ui/AGENTS.md`).
 */
export function SrDueArt({ variant }: SrDueArtProps) {
  const c = useThemeColors();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg height={H} width={W}>
        {variant === 'due' ? (
          <>
            <G origin={PIVOT} rotation={-18}>
              <Rect
                {...CARD}
                fill={c['surface-success']}
                stroke={c['border-success-subtle']}
                strokeWidth={1}
              />
            </G>
            <G origin={PIVOT} rotation={16}>
              <Rect
                {...CARD}
                fill={c['surface-primary']}
                stroke={c['border-brand-subtle']}
                strokeWidth={1}
              />
            </G>
            {/* Lá trước cùng: "mặt thẻ" với hai dòng chữ giả — đọc ngay ra là thẻ ghi nhớ chứ không phải tờ giấy trơn. */}
            <Rect {...CARD} fill={c['bg-1']} stroke={c.success} strokeWidth={1.5} />
            <Rect fill={c.success} height={4} opacity={0.55} rx={2} width={18} x={27} y={28} />
            <Rect fill={c.success} height={4} opacity={0.3} rx={2} width={12} x={27} y={36} />
            <Circle cx={36} cy={50} fill={c['fg-brand']} opacity={0.5} r={2.5} />
          </>
        ) : (
          <>
            <Rect
              {...CARD}
              fill={c['bg-1']}
              opacity={0.7}
              stroke={c['border-success-subtle']}
              strokeWidth={1}
              x={CARD.x - 6}
              y={CARD.y - 6}
            />
            <Rect {...CARD} fill={c['bg-1']} stroke={c['border-success-subtle']} strokeWidth={1} />
            <Rect fill={c.success} height={4} opacity={0.3} rx={2} width={18} x={27} y={28} />
            <Circle cx={50} cy={46} fill={c['action-success']} r={13} />
            <Path
              d="M44 46.5l4 4 8-8.5"
              fill="none"
              stroke={c['action-success-fg']}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
            />
            <Circle cx={12} cy={14} fill={c.success} opacity={0.35} r={2} />
            <Circle cx={62} cy={16} fill={c.success} opacity={0.5} r={2.5} />
          </>
        )}
      </Svg>
    </View>
  );
}
