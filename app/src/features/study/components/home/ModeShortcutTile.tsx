import { Text, View } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';

import { type ThemeColorKey, useThemeColors } from '@/shared/theme';
import { PressableScale } from '@/shared/ui';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import { STUDY_MODE_META, type StudyModeKey } from '../../constants/study-modes.constants';

/**
 * Nền tint + viền nhạt + màu nét trang trí theo tông — cùng cặp `surface-*`/màu ngữ nghĩa với `IconTile` (đã đo tương phản ở cả
 * hai chế độ). ⚠️ Tông `accent` không có bậc viền `-subtle` riêng ⇒ dùng `border-1` trung tính thay vì bịa token.
 */
const TONE: Record<IconTileTone, { border: string; ink: ThemeColorKey; surface: string }> = {
  accent: { border: 'border-border-1', ink: 'action-accent', surface: 'bg-surface-secondary' },
  brand: { border: 'border-border-brand-subtle', ink: 'fg-brand', surface: 'bg-surface-primary' },
  danger: { border: 'border-border-error-subtle', ink: 'error', surface: 'bg-surface-error' },
  info: { border: 'border-border-info-subtle', ink: 'info', surface: 'bg-surface-info' },
  neutral: { border: 'border-border-1', ink: 'fg-2', surface: 'bg-surface-neutral' },
  success: {
    border: 'border-border-success-subtle',
    ink: 'success',
    surface: 'bg-surface-success',
  },
  warning: {
    border: 'border-border-warning-subtle',
    ink: 'warning',
    surface: 'bg-surface-warning',
  },
};

/** Hoạ tiết góc xen kẽ cung/chấm theo thứ tự lưới (Học thẻ · Quiz · Thi thử · Ôn · Thi đấu) — hai ô cạnh nhau không trùng hoạ tiết. */
const DECOR: Record<StudyModeKey, 'arc' | 'dots'> = {
  flashcards: 'arc',
  live: 'arc',
  mock: 'arc',
  quick: 'dots',
  sr: 'dots',
};

const DECOR_SIZE = 48;
const DOTS = [26, 34, 42].flatMap((x) => [6, 14, 22].map((y) => ({ x, y })));

export interface ModeShortcutTileProps {
  mode: StudyModeKey;
  onPress: () => void;
}

/**
 * Ô lối tắt chế độ học ở lưới Trang chủ Học: nền TINT theo tông của chế độ (`STUDY_MODE_META`), ô icon trắng nổi trên nền tint, hoạ
 * tiết SVG mờ ở góc phải trên, co nhẹ khi nhấn (`PressableScale`).
 *
 * ── Vì sao không dùng lại `StudyModeTile` ──────────────────────────────────────────────────────────────────────────────
 * `StudyModeTile` còn phục vụ khối "Luyện tập" của tổng quan bộ và hàng Thi đấu trực tiếp (nền `bg-1`, có trạng thái khoá/bận) —
 * đổi nó là đổi cả hai màn kia. Ô ở đây luôn bấm được (lưới đã ẩn ô không dùng được) nên chỉ cần phần nhỏ đó.
 *
 * ⚠️ Cao đều: `className="grow"` + `fill` ⇒ khối nhìn thấy cao bằng ô lưới (cha `grow basis-[45%]` trong hàng `flex-wrap` tự
 * giãn theo ô cao nhất hàng). ✅ `min-h-16` (64 = đệm 24 + tên 2 dòng 40) là chốt thứ hai: tên dài nhất ("Thi đấu trực tiếp") xuống
 * tối đa 2 dòng ở máy 320dp nên MỌI ô cao đúng 64 kể cả khi `fill` không giãn được (`PressableScale` truyền MẢNG style cho
 * `Animated.View` mà không `cssInterop={false}` ⇒ NativeWind gộp mảng là có thể rơi `flexGrow`). Vùng chạm ≥ 44dp.
 * Nhấn ⇒ viền `border-strong` — người bật "Giảm chuyển động" (không co) vẫn thấy phản hồi. Mô tả chế độ đi vào
 * `accessibilityHint` (ô hẹp không vẽ mô tả).
 * Hoạ tiết là trang trí: ẩn khỏi trình đọc màn hình, không ăn cú chạm, tĩnh (không phải vòng lặp).
 */
export function ModeShortcutTile({ mode, onPress }: ModeShortcutTileProps) {
  const colors = useThemeColors();
  const meta = STUDY_MODE_META[mode];
  const tone = TONE[meta.tone];
  const ink = colors[tone.ink];

  return (
    <PressableScale
      accessibilityHint={meta.description}
      accessibilityLabel={meta.label}
      accessibilityRole="button"
      className="grow"
      contentClassName={({ pressed }) =>
        cn(
          'min-h-16 flex-row items-center gap-xs overflow-hidden rounded-md border-hairline p-sm',
          tone.surface,
          pressed ? 'border-border-strong' : tone.border,
        )
      }
      fill
      onPress={onPress}
    >
      {/* Vẽ TRƯỚC nội dung ⇒ nằm dưới icon/chữ; `overflow-hidden` của ô cắt hoạ tiết theo đúng góc bo. */}
      <View
        accessibilityElementsHidden
        className="absolute right-0 top-0"
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <Svg height={DECOR_SIZE} width={DECOR_SIZE}>
          {DECOR[mode] === 'arc' ? (
            <>
              <Path
                d="M48 20A20 20 0 0 1 28 0"
                fill="none"
                opacity={0.3}
                stroke={ink}
                strokeWidth={1.5}
              />
              <Path
                d="M48 32A32 32 0 0 1 16 0"
                fill="none"
                opacity={0.16}
                stroke={ink}
                strokeWidth={1.5}
              />
            </>
          ) : (
            DOTS.map((dot) => (
              <Circle
                key={`${dot.x}-${dot.y}`}
                cx={dot.x}
                cy={dot.y}
                fill={ink}
                opacity={0.28}
                r={1.6}
              />
            ))
          )}
        </Svg>
      </View>
      <IconTile className="bg-bg-1" name={meta.icon} size="sm" tone={meta.tone} />
      <Text className="flex-1 text-label-md font-semibold text-fg-1" numberOfLines={3}>
        {meta.label}
      </Text>
    </PressableScale>
  );
}
