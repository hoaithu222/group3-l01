import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native';

import { chip, HIT_SLOP, type ChipSize } from './chip.styles';

/**
 * Chip — thẻ chọn được, bo tròn hoàn toàn, dùng cho danh sách lựa chọn ngắn
 * (bộ lọc, người nhận gần đây, mệnh giá nạp tiền).
 *
 * Số đo và công thức class nằm ở `chip.styles.ts`.
 *
 * ── Bốn trạng thái của Figma ────────────────────────────────────────────────
 * DEFAULT · PRESS · SELECTED · DISABLED. PRESS lấy từ render-prop của
 * `Pressable`, KHÔNG phải `useState`: state thủ công phải nghe `onPressIn`/
 * `onPressOut`, mà `onPressOut` KHÔNG bắn khi ngón tay trượt ra ngoài rồi nhấc
 * lên — chip kẹt ở dáng "đang bấm" cho tới lần chạm sau.
 *
 * ⚠️ Chip cỡ `sm` chỉ cao 32dp, dưới ngưỡng chạm 44dp → xem `HIT_SLOP`.
 *
 * ── Vì sao không có `ChipPill` riêng ────────────────────────────────────────
 * Chip ở màn "Nạp tiền điện thoại" (109×48) là CÙNG một component set trong
 * Figma, chỉ khác chỗ nó bị lưới ba cột kéo giãn. Nên nó là `size="lg"` +
 * `fullWidth` chứ không phải component thứ hai.
 */

/**
 * Vai trò trợ năng. Chip hay được dùng làm nhóm chọn:
 *  · `radio`    — chọn một trong nhiều (mệnh giá nạp tiền);
 *  · `checkbox` — chọn nhiều (bộ lọc);
 *  · `button`   — thao tác rời rạc, không có trạng thái chọn.
 */
export type ChipRole = 'button' | 'checkbox' | 'radio';

export interface ChipProps {
  /**
   * Ảnh đại diện tròn đứng trước nhãn: nguồn ảnh, hoặc phần tử tự vẽ.
   *
   * ⛔ `ReactElement` chứ KHÔNG phải `ReactNode`. `ReactNode` bao cả `string`,
   * nên `<Chip avatar="AB" />` qua được `tsc` rồi rơi thẳng vào
   * `<Image source={"AB"} />` — RN không vẽ gì, và không có lỗi nào báo. Cần
   * chữ viết tắt thì truyền phần tử: `avatar={<Avatar name="Nguyễn Văn A" />}`.
   */
  avatar?: ImageSourcePropType | ReactElement;
  className?: string;
  disabled?: boolean;
  /**
   * Chia đều bề rộng hàng thay vì ôm sát nội dung. Đây là dáng "Chip Pill" của
   * màn "Nạp tiền điện thoại": ba chip `fullWidth` trong một `flex-row gap-xs`
   * cho đúng 109dp mỗi cái trên khung 343dp.
   */
  fullWidth?: boolean;
  label: string;
  /**
   * Khe nhận nội dung đứng trước nhãn — Figma để sẵn một khe icon 24dp ở đây,
   * ẩn mặc định. Thường là `<Icon name="…" size="md" />` (`@/shared/ui/icon`).
   */
  leading?: ReactNode;
  onPress?: () => void;
  role?: ChipRole;
  selected?: boolean;
  size?: ChipSize;
  /**
   * Khe nhận nội dung đứng sau nhãn (dấu ✕ để bỏ chọn, mũi tên…).
   *
   * ⚠️ Truyền khe này vào là chip TỰ TÁCH ô trợ năng để phần tử ở đây bấm được
   * riêng (xem chú thích trong thân component). Hệ quả: thứ thuần trang trí đặt
   * vào đây phải tự ẩn bằng `accessibilityElementsHidden` +
   * `importantForAccessibility`, nếu không nó thành một ô đọc lên vô nghĩa.
   */
  trailing?: ReactNode;
}

function resolveState(disabled: boolean, selected: boolean, pressed: boolean) {
  // Thứ tự này là quy tắc, không phải tiện tay: chip bị khoá mà đang được chọn
  // vẫn phải trông như bị khoá, nếu không người dùng tưởng còn bấm bỏ chọn được.
  if (disabled) return 'disabled' as const;
  if (selected) return 'selected' as const;
  return pressed ? ('press' as const) : ('default' as const);
}

export function Chip({
  avatar,
  className,
  disabled = false,
  fullWidth = false,
  label,
  leading,
  onPress,
  role = 'button',
  selected = false,
  size = 'md',
  trailing,
}: ChipProps) {
  const a11y = {
    accessibilityLabel: label,
    accessibilityRole: role,
    /**
     * `radio`/`checkbox` đọc `checked`, `button` đọc `selected` — cùng một ý
     * "đang được chọn" nhưng trình đọc màn hình lấy ở hai khoá khác nhau.
     * Đặt nhầm khoá thì TalkBack đọc "nút Chip" trống trơn, người dùng khiếm
     * thị không biết mình đã chọn mệnh giá nào.
     */
    accessibilityState:
      role === 'button' ? { disabled, selected } : { checked: selected, disabled },
  };

  /**
   * ⛔ Khe `trailing` là chỗ đặt dấu ✕ bỏ chọn — tức một NÚT nằm trong chip.
   *
   * `Pressable` mặc định `accessible` (React Native đặt
   * `accessible: accessible !== false`) và một phần tử `accessible` gộp CẢ cây
   * con thành MỘT ô: TalkBack đọc "Đã thanh toán, nút, đã chọn" rồi hết —
   * không cách nào lia tới ✕, và người khiếm thị không gỡ được bộ lọc.
   *
   * Có `trailing` thì hạ cờ ở thẻ ngoài rồi dựng lại ô trợ năng quanh RIÊNG
   * khối nhãn (mẫu của `Alert.tsx`): ✕ trở lại thành một ô rời, bấm được.
   * KHÔNG có `trailing` thì giữ nguyên MỘT ô — chẳng có gì để nuốt, mà ô đó
   * lại đúng là ô mang `hitSlop`, tức là ô mà ngón tay và trình đọc màn hình
   * cùng trỏ tới. ⚠️ Vùng CHẠM không đổi trong cả hai nhánh.
   */
  const split = trailing !== undefined && trailing !== null;

  return (
    <Pressable
      {...(split ? { accessible: false } : a11y)}
      className={chip({ fullWidth }).pressable()}
      disabled={disabled}
      hitSlop={HIT_SLOP[size]}
      onPress={onPress}
    >
      {({ pressed }) => {
        const styles = chip({
          fullWidth,
          hasAvatar: avatar != null,
          size,
          state: resolveState(disabled, selected, pressed),
        });

        return (
          <View className={styles.root({ className })}>
            <View {...(split ? a11y : {})} className={styles.body()}>
              {avatar == null ? null : (
                <View className={styles.avatar()}>
                  {isValidElement(avatar) ? (
                    avatar
                  ) : (
                    <Image className={styles.avatarImage()} source={avatar} />
                  )}
                </View>
              )}
              {leading}
              {/**
               * ⛔ `numberOfLines={1}`: chip là một dòng theo thiết kế. Thiếu nó,
               * một nhãn dài làm chip cao gấp đôi và cả hàng chip so le nhau.
               *
               * ⛔ `maxFontSizeMultiplier`: chiều cao chip là số CỨNG (32 · 40 ·
               * 48dp) còn hệ số phóng cỡ chữ của Android lên tới 2× — ở mức "Lớn
               * nhất", dòng chữ của chip `sm` cao ~32px trong một hộp cao đúng
               * 32dp: chữ tràn ra ngoài viền bo tròn rồi còn bị cắt. Trần 1.3 cho
               * 14/20 → 18.2/26 (< 32) và 16/24 → 20.8/31.2 (< 40), vẫn thừa chỗ
               * cho dấu tiếng Việt hai tầng. ⚠️ Đây là TRẦN chứ không phải hệ số:
               * cỡ chữ ở mức thường KHÔNG nhỏ đi.
               *
               * ⚠️ Vì sao không đổi chiều cao cứng sang chiều cao TỐI THIỂU như
               * `input.styles.ts`: chip nằm thành hàng ngang, chip nào giãn ra thì
               * cả hàng so le, và dáng viên thuốc (bo tròn hoàn toàn) lộ ngay.
               */}
              <Text className={styles.label()} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                {label}
              </Text>
            </View>
            {trailing}
          </View>
        );
      }}
    </Pressable>
  );
}
