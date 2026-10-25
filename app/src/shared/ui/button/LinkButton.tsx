import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ICON_SIZE, useThemeColors } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';

import {
  LINK_CONTENT_COLOR,
  LINK_DISABLED_CONTENT_COLOR,
  LINK_ICON_SIZE,
  linkButtonStyles,
  type LinkButtonSize,
  type LinkButtonTone,
} from './link-button.styles';

export interface LinkButtonProps {
  accessibilityLabel?: string;
  children?: ReactNode;
  /**
   * Class cho khối NHÌN THẤY — slot `root`.
   *
   * ⚠️ `root` nằm BÊN TRONG `<Pressable>`, nên `self-center` / `mb-4` ở đây
   * KHÔNG di chuyển được cái nút: chúng chỉ căn `root` bên trong lớp nhận
   * chạm, và không có lỗi nào báo. Muốn căn hay chừa lề thì bọc một `<View>`
   * bên ngoài (`<View className="items-center">`, `<View className="mb-4">`).
   */
  className?: string;
  disabled?: boolean;
  iconLeft?: IconName;
  iconRight?: IconName;
  label?: string;
  loading?: boolean;
  onPress?: () => void;
  size?: LinkButtonSize;
  testID?: string;
  tone?: LinkButtonTone;
}

/** Vùng chạm: chữ 16/24 chỉ cao 24dp ⇒ thiếu 20dp cho ngưỡng 44dp. */
const HIT_SLOP = { bottom: 10, left: 8, right: 8, top: 10 } as const;

function resolveState(disabled: boolean, loading: boolean, pressed: boolean) {
  if (disabled) return 'disabled' as const;
  if (loading) return 'loading' as const;
  return pressed ? ('press' as const) : ('default' as const);
}

/**
 * Nút dạng liên kết — bộ `Button/bt link` (Figma section `Buttons Link`).
 *
 * Không nền, không viền, không đệm: chỉ chữ (kèm icon tuỳ chọn). Dùng cho thao
 * tác PHỤ nằm trong một câu hoặc cuối một khối — "Xem tất cả", "Quên mật khẩu?".
 *
 * ⚠️ Nút này KHÔNG thay được `Button` cho thao tác chính: nó không có nền nên
 * mắt không bắt được nó là nút, và vùng chạm chỉ đủ nhờ `hitSlop`.
 *
 * Gạch chân chỉ xuất hiện lúc bấm — xem `link-button.styles.ts`.
 */
export function LinkButton({
  accessibilityLabel,
  children,
  className,
  disabled = false,
  iconLeft,
  iconRight,
  label,
  loading = false,
  onPress,
  size = 'lg',
  testID,
  tone = 'primary',
}: LinkButtonProps) {
  const colors = useThemeColors();
  const blocked = disabled || loading;
  const text = children ?? label;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      /** ⛔ `busy`: lúc quay thì trình đọc màn hình không còn gì để đọc. */
      accessibilityState={{ busy: loading, disabled: blocked }}
      className={linkButtonStyles().pressable()}
      disabled={blocked}
      hitSlop={HIT_SLOP}
      testID={testID}
      onPress={onPress}
    >
      {({ pressed }) => {
        const state = resolveState(disabled, loading, pressed);
        const styles = linkButtonStyles({ size, state, tone });
        // ⛔ Không có nhánh `pressed`: Figma giữ NGUYÊN màu lúc bấm, dấu hiệu
        // duy nhất là gạch chân (xem `link-button.styles.ts`).
        const tint = disabled ? LINK_DISABLED_CONTENT_COLOR[tone] : LINK_CONTENT_COLOR[tone];
        const iconSize = LINK_ICON_SIZE[size];

        return (
          <View className={styles.root({ class: className })}>
            <View className={styles.content()}>
              {iconLeft ? <Icon color={tint} name={iconLeft} size={iconSize} /> : null}
              {text == null ? null : (
                <Text className={styles.label()} numberOfLines={1}>
                  {text}
                </Text>
              )}
              {iconRight ? <Icon color={tint} name={iconRight} size={iconSize} /> : null}
            </View>

            {loading ? (
              /**
               * ⚠️ `size` là SỐ, bằng đúng cỡ icon của cỡ nút (Figma: 24/20/16)
               * — `"small"` cố định ~20dp nên vòng quay của link `sm` (chữ
               * 12/16) sẽ cao hơn chính dòng chữ nó đang che.
               */
              <View className={styles.spinner()}>
                <ActivityIndicator
                  color={colors[LINK_CONTENT_COLOR[tone]]}
                  size={ICON_SIZE[iconSize]}
                />
              </View>
            ) : null}
          </View>
        );
      }}
    </Pressable>
  );
}
