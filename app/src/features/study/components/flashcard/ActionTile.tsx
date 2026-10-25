import { Pressable, Text, View } from 'react-native';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';

import { actionTile, type ActionTileTone } from './action-tile.styles';

/** Màu icon: dáng nhạt lấy màu ngữ nghĩa (icon là hình phi văn bản, ngưỡng 3:1); dáng đặc lấy `action-*-fg` cùng cặp với nền. */
const ICON_SOFT: Record<ActionTileTone, ThemeColorKey> = {
  error: 'error',
  info: 'info',
  success: 'success',
  warning: 'warning',
};
const ICON_SOLID: Record<ActionTileTone, ThemeColorKey> = {
  error: 'action-error-fg',
  info: 'action-info-fg',
  success: 'action-success-fg',
  warning: 'action-warning-fg',
};

export interface ActionTileProps {
  label: string;
  onPress: () => void;
  tone: ActionTileTone;
  /** Nhãn đọc lên — mặc định là `label`. Nên nói cả `hint` ("Dễ, ôn lại sau 16 ngày"). */
  accessibilityLabel?: string;
  /** Lớp BỐ CỤC của ô (`flex-1`, `landscape:basis-[45%]`…) — rơi vào lớp nhận chạm, nơi quyết định ô chiếm bao nhiêu chỗ. */
  className?: string;
  disabled?: boolean;
  /** Dòng nhỏ dưới nhãn kèm icon đồng hồ ("16 ngày") — khoảng ôn dự kiến. */
  hint?: string;
  icon?: IconName;
  solid?: boolean;
}

/**
 * Ô chấm có tông màu: nhãn (+ icon) và tuỳ chọn một dòng gợi ý. Là component CỤC BỘ của feature `study` vì bộ chung chưa có:
 *  · `Button` ép nhãn MỘT dòng trong viên thuốc `px-md` — bốn nút Quên/Khó/Vừa/Dễ chia một hàng 320–390dp thì bị cắt thành "Qu…",
 *    và không có chỗ cho dòng "ôn lại sau …" nằm TRONG vùng chạm/nhãn trợ năng của chính nút;
 *  · `Chip`/`Badge` không phải nút chấm (vai trợ năng khác, không có dòng gợi ý).
 * Dùng ở hai nơi (`FlashcardControls`, `SrFeedbackButtons`) nên nằm ở `components/flashcard/`. Nếu feature khác cần thì đưa lên
 * `src/shared/ui/` (đọc `src/shared/ui/AGENTS.md` trước).
 *
 * Vùng chạm ≥ 48dp (`min-h-12`), 56dp khi có dòng gợi ý. Đổi dáng lúc bấm bằng render-prop ở `children` (⛔ `className` không nhận hàm).
 * `hidden phone:flex` ở icon đồng hồ: máy hẹp dưới 390dp bỏ icon để chữ "16 ngày" không phải xuống dòng.
 */
export function ActionTile({
  accessibilityLabel,
  className,
  disabled = false,
  hint,
  icon,
  label,
  onPress,
  solid = false,
  tone,
}: ActionTileProps) {
  const iconColor = solid ? ICON_SOLID[tone] : ICON_SOFT[tone];
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={className}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => {
        const styles = actionTile({ disabled, pressed, solid, tall: Boolean(hint), tone });
        return (
          <View className={styles.root()}>
            <View className="flex-row items-center gap-2xs">
              {icon ? <Icon color={iconColor} name={icon} size={20} /> : null}
              <Text className={styles.label()} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                {label}
              </Text>
            </View>
            {hint ? (
              <View className="flex-row items-center gap-3xs">
                <View className="hidden phone:flex">
                  <Icon color={iconColor} name="clock" size={14} />
                </View>
                <Text className={styles.hint()} maxFontSizeMultiplier={1.3}>
                  {hint}
                </Text>
              </View>
            ) : null}
          </View>
        );
      }}
    </Pressable>
  );
}
