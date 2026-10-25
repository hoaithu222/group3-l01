import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ICON_SIZE, useThemeColors } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';

import {
  BUTTON_CONTENT_COLOR,
  BUTTON_DISABLED_CONTENT_COLOR,
  BUTTON_HIT_SLOP,
  BUTTON_HIT_SLOP_ICON_ONLY,
  BUTTON_ICON_SIZE,
  BUTTON_MAX_FONT_SCALE,
  BUTTON_SPINNER_COLOR,
  buttonStyles,
  type ButtonSize,
  type ButtonVariant,
} from './button.styles';

interface ButtonBaseProps {
  /** Thay cho `label` khi cần chữ nhiều đoạn. Ưu tiên hơn `label` nếu có cả hai. */
  children?: ReactNode;
  /**
   * Class cho khối NHÌN THẤY (nền, viền, bo góc) — slot `root`, nằm BÊN TRONG
   * `<Pressable>`. ⚠️ Vì vậy `self-*` / `m-*` / `max-w-*` ở đây KHÔNG dời và
   * KHÔNG thu được cái nút — chúng chỉ căn `root` bên trong lớp nhận chạm, và
   * không có lỗi nào báo. Những lớp đó thuộc về `pressableClassName`.
   */
  className?: string;
  disabled?: boolean;
  /** Chiếm hết bề ngang — dáng nút chính ở đáy màn hình. */
  fullWidth?: boolean;
  iconLeft?: IconName;
  iconRight?: IconName;
  label?: string;
  /** Khoá nút và thay nhãn bằng vòng quay. Bề rộng nút giữ nguyên. */
  loading?: boolean;
  onPress?: () => void;
  /**
   * Class cho lớp NHẬN CHẠM (`<Pressable>`) — bề rộng, lề, và là đường DUY
   * NHẤT bỏ trần 420dp của `fullWidth`: `pressableClassName="tablet:max-w-none"`.
   * ⛔ `className` KHÔNG tới được node mang trần — xem `button.styles.ts`.
   */
  pressableClassName?: string;
  size?: ButtonSize;
  testID?: string;
  variant?: ButtonVariant;
}

/**
 * ⛔ Union RỜI để chính `tsc` ép nhãn, thay vì một dòng chú thích "bắt buộc"
 * mà không có gì kiểm.
 *
 * `iconOnly` thì trên nút KHÔNG còn chữ nào, nên `accessibilityLabel` là dấu
 * hiệu DUY NHẤT cho trình đọc màn hình — thiếu nó là một nút CÂM. Interface
 * phẳng cho `<Button iconOnly iconLeft="cancel" />` lọt qua; union thì đỏ.
 */
type ButtonA11yProps =
  | { accessibilityLabel: string; iconOnly: true }
  | { accessibilityLabel?: string; iconOnly?: false };

export type ButtonProps = ButtonA11yProps & ButtonBaseProps;

function resolveState(disabled: boolean, loading: boolean, pressed: boolean) {
  // Thứ tự là quy tắc, không phải tiện tay: nút vừa khoá vừa đang gửi phải
  // TRÔNG như bị khoá, nếu không người dùng tưởng còn bấm lại được.
  if (disabled) return 'disabled' as const;
  if (loading) return 'loading' as const;
  return pressed ? ('press' as const) : ('default' as const);
}

/**
 * Nút bấm — bộ `Button/bt default` + `Button status` của BIDV SmartBanking.
 *
 * Số đo, danh sách biến thể và lý do từng lựa chọn: xem `button.styles.ts`.
 *
 * ── Vì sao KHÔNG có `IconButton` riêng ──────────────────────────────────────
 * Trong Figma nút chỉ-icon KHÔNG phải component khác: nó là thuộc tính
 * `Only icon=On` của CÙNG một component set, cùng biến thể và cùng bốn cỡ. Tách
 * ra file riêng thì mỗi lần thêm một biến thể phải sửa hai nơi. Ở đây nó là
 * prop `iconOnly`.
 *
 * ```tsx
 * <Button fullWidth iconRight="arrow-right" label="Tiếp tục" onPress={submit} />
 * <Button label="Huỷ" size="sm" variant="secondary" onPress={close} />
 * <Button accessibilityLabel="Đóng" iconLeft="cancel" iconOnly size="xs" onPress={close} />
 * ```
 */
export function Button({
  accessibilityLabel,
  children,
  className,
  disabled = false,
  fullWidth = false,
  iconLeft,
  iconOnly = false,
  iconRight,
  label,
  loading = false,
  onPress,
  pressableClassName,
  size = 'md',
  testID,
  variant = 'primary',
}: ButtonProps) {
  const colors = useThemeColors();
  const blocked = disabled || loading;
  const text = children ?? label;
  const soloIcon = iconLeft ?? iconRight;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      /**
       * ⛔ `busy` là bắt buộc, không phải chi tiết thừa.
       *
       * Lúc đang gửi, nhãn bị thay bằng vòng quay — người dùng khiếm thị mất
       * hết dấu hiệu thị giác. `busy` là thứ duy nhất báo cho họ biết thao tác
       * ĐANG CHẠY chứ không phải nút hỏng.
       */
      accessibilityState={{ busy: loading, disabled: blocked }}
      className={buttonStyles({ fullWidth }).pressable({ class: pressableClassName })}
      /**
       * ⛔ Khoá nút khi đang gửi. Không khoá thì người dùng bấm lần thứ hai vì
       * lần đầu chưa thấy gì xảy ra — và backend tạo HAI giao dịch.
       */
      disabled={blocked}
      hitSlop={iconOnly ? BUTTON_HIT_SLOP_ICON_ONLY[size] : BUTTON_HIT_SLOP[size]}
      testID={testID}
      onPress={onPress}
    >
      {({ pressed }) => {
        const state = resolveState(disabled, loading, pressed);
        const styles = buttonStyles({ fullWidth, iconOnly, size, state, variant });
        const tint = disabled ? BUTTON_DISABLED_CONTENT_COLOR : BUTTON_CONTENT_COLOR[variant];
        const iconSize = BUTTON_ICON_SIZE[size];

        return (
          <View className={styles.root({ class: className })}>
            <View className={styles.content()}>
              {iconOnly ? (
                soloIcon ? (
                  <Icon color={tint} name={soloIcon} size={iconSize} />
                ) : null
              ) : (
                <>
                  {iconLeft ? <Icon color={tint} name={iconLeft} size={iconSize} /> : null}
                  {text == null ? null : (
                    // `numberOfLines` giữ nút đúng một dòng: nhãn dài xuống
                    // dòng thì viên thuốc cao gấp đôi và cả hàng nút lệch nhau.
                    // ⛔ `maxFontSizeMultiplier` đi CÙNG chiều cao cứng
                    // `h-control-*`: Android phóng cỡ chữ tới 2×, ở mức đó nhãn
                    // của nút `xs` cao 40dp trong hộp 32dp — chữ tràn ra ngoài
                    // viền bo rồi bị cắt ngang. Trần: `BUTTON_MAX_FONT_SCALE`.
                    <Text
                      className={styles.label()}
                      maxFontSizeMultiplier={BUTTON_MAX_FONT_SCALE[size]}
                      numberOfLines={1}
                    >
                      {text}
                    </Text>
                  )}
                  {iconRight ? <Icon color={tint} name={iconRight} size={iconSize} /> : null}
                </>
              )}
            </View>

            {loading ? (
              /**
               * Vòng quay PHỦ LÊN nội dung đã làm trong suốt, không đứng cạnh
               * nó — bề rộng nút giữ nguyên nên bố cục không giật ở đúng lúc
               * người dùng đang nhìn vào nó.
               *
               * ⚠️ `ActivityIndicator` nhận mã màu THÔ, không nhận `className`
               * — đây là ca dùng `useThemeColors()` đúng chỗ.
               *
               * ⚠️ `size` là SỐ, không phải `"small"`: Figma cho vòng quay bằng
               * đúng cỡ icon của cỡ nút (24 ở 56/48/40, 20 ở 32). `"small"`
               * cố định ~20dp — nút `lg` thì vòng quay nhỏ hơn bản vẽ, và nếu
               * sau này thêm cỡ nhỏ hơn thì nó tràn ra ngoài viên thuốc.
               */
              <View className={styles.spinner()}>
                <ActivityIndicator
                  color={colors[BUTTON_SPINNER_COLOR[variant]]}
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
