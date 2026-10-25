import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { checkbox, HIT_SLOP } from './checkbox.styles';
import { CheckboxMark } from './CheckboxMark';
import type { CheckboxSize } from './checkbox.types';

interface CheckboxBaseProps {
  /** Đang được chọn hay không. Component KHÔNG tự giữ state — nơi gọi giữ. */
  checked: boolean;
  className?: string;
  disabled?: boolean;
  /**
   * Nửa chọn: ô cha của danh sách chỉ có vài mục con được chọn. Đè lên `checked`
   * cả về hình lẫn về trạng thái trợ năng (`'mixed'`).
   */
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  size?: CheckboxSize;
}

/**
 * ⛔ Union RỜI để chính `tsc` ép nhãn trợ năng, thay vì một dòng chú thích
 * "bắt buộc" mà không có gì kiểm. Cùng khuôn với `ButtonA11yProps`.
 *
 * `label` là CHUỖI thì `Pressable` tự lấy nó đọc lên, không cần khai gì thêm.
 * `label` là `ReactNode` thì KHÔNG có cách nào rút chữ ra: React không cho đọc
 * nội dung của một element đã dựng, nên trình đọc màn hình chỉ nói "hộp kiểm"
 * — người dùng khiếm thị nghe xong không biết mình đang đồng ý với cái gì, ở
 * đúng màn xác nhận giao dịch. `accessibilityLabel` là lối thoát duy nhất, và
 * union này làm `tsc` đỏ nếu quên.
 *
 * ⚠️ Đây là NỚI RỘNG, không phải breaking: nhánh dưới giữ nguyên chữ ký cũ
 * (`label?: string`, `accessibilityLabel?: string`) nên mọi nơi gọi hiện tại —
 * kể cả `<Checkbox checked />` không nhãn — vẫn đúng y như trước.
 */
type CheckboxA11yProps =
  | {
      accessibilityLabel: string;
      /** Nhãn bên phải. Dựng được câu có link gạch chân lồng GIỮA — xem ví dụ. */
      label?: ReactNode;
    }
  | {
      /** Nhãn cho trình đọc màn hình khi checkbox không có `label` nhìn thấy được. */
      accessibilityLabel?: string;
      label?: string;
    };

export type CheckboxProps = CheckboxA11yProps & CheckboxBaseProps;

/**
 * Ô chọn nhiều. Ba trạng thái, không phải hai.
 *
 * Số đo và lý do từng lựa chọn màu: xem `checkbox.styles.ts`.
 *
 * ── `indeterminate` ─────────────────────────────────────────────────────────
 * Ngoài bật/tắt còn `indeterminate` — ô cha của một danh sách mà chỉ vài mục con
 * được chọn. ⚠️ Với trình đọc màn hình đó KHÔNG phải `checked: true`: React
 * Native nhận `boolean | 'mixed'`, và trạng thái nửa chọn phải là `'mixed'`.
 * Báo `true` thì người dùng khiếm thị nghe "đã chọn" rồi bấm Gửi, tưởng đã chọn
 * cả danh sách.
 *
 * ── Nhãn có link lồng giữa câu ──────────────────────────────────────────────
 * ```tsx
 * <Checkbox
 *   accessibilityLabel="Tôi đã đọc và đồng ý với điều khoản dịch vụ"
 *   checked={agreed}
 *   label={
 *     <Text className="text-body-md font-regular text-fg-1">
 *       Tôi đã đọc, đồng ý với các{' '}
 *       <Text className="text-link-md underline text-fg-brand" onPress={openTerms}>
 *         Điều kiện, điều khoản
 *       </Text>{' '}
 *       giao dịch
 *     </Text>
 *   }
 *   onChange={setAgreed}
 * />
 * ```
 * ⚠️ Nhãn `ReactNode` KHÔNG được thừa hưởng cỡ chữ của component (`View` không
 * truyền style chữ xuống `Text` trên React Native) ⇒ nơi gọi phải tự khai
 * `text-body-md font-regular text-fg-1`, đúng như ví dụ.
 *
 * ⛔ Đừng vá bằng `<View><Checkbox /><Text>…</Text></View>`: vùng chạm của nhãn
 * mất (chỉ còn ô 24dp), và trình đọc màn hình tách thành hai phần tử rời.
 */
export function Checkbox({
  accessibilityLabel,
  checked,
  className,
  disabled = false,
  indeterminate = false,
  label,
  onChange,
  size = 'md',
}: CheckboxProps) {
  const tone = indeterminate ? 'mixed' : checked ? 'on' : 'off';
  const textLabel = typeof label === 'string' ? label : undefined;
  /**
   * ⚠️ `false` và chuỗi rỗng cũng là KHÔNG CÓ NHÃN. Mẫu quen tay
   * `label={showTerms && <Terms />}` truyền xuống `false`; chỉ loại
   * `undefined`/`null` thì nhánh `ReactNode` vẫn chạy và dựng một lớp bọc
   * `flex-1` RỖNG — ô checkbox bị đẩy dính mép trái còn phần còn lại của hàng
   * trống trơn, mà React không vẽ `false` nên chẳng có lỗi nào báo. Cùng bẫy đã
   * xử ở `Divider.tsx`.
   */
  const hasLabel = label !== undefined && label !== null && label !== false && label !== '';

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? textLabel}
      accessibilityRole="checkbox"
      /**
       * ⚠️ `'mixed'` chứ không phải `true` cho trạng thái nửa chọn — đây là khác
       * biệt DUY NHẤT mà trình đọc màn hình nghe được giữa "đã chọn hết" và
       * "chọn một phần"; màu sắc thì nó không thấy.
       */
      accessibilityState={{ checked: indeterminate ? 'mixed' : checked, disabled }}
      className={checkbox().pressable()}
      disabled={disabled}
      hitSlop={HIT_SLOP[size]}
      // Bấm khi đang nửa chọn thì CHỌN HẾT, không phải đảo ngược: đó là hành vi
      // người dùng chờ đợi ở ô cha của một danh sách.
      onPress={() => onChange?.(indeterminate ? true : !checked)}
    >
      {({ pressed }) => {
        const styles = checkbox({ disabled, pressed, size, tone });

        return (
          <View className={styles.root({ className })}>
            <View className={styles.frame()}>
              <View className={styles.box()}>
                {tone === 'off' ? null : (
                  <CheckboxMark
                    className={styles.mark()}
                    indeterminate={indeterminate}
                    size={size}
                  />
                )}
              </View>
            </View>
            {hasLabel ? (
              textLabel === undefined ? (
                <View className={styles.labelSlot()}>{label}</View>
              ) : (
                <Text className={styles.label()}>{textLabel}</Text>
              )
            ) : null}
          </View>
        );
      }}
    </Pressable>
  );
}
