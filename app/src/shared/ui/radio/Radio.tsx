import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

import { useRadioGroup } from './radio-context';

/**
 * Một lựa chọn trong `RadioGroup`.
 *
 * Số đo lấy từ Figma (`259:96600`): khung 24dp, vòng 20dp nét 1,5, chấm trong
 * 12dp, cách nhãn 8dp, nhãn 16/24 semibold.
 *
 * ⚠️ Radio KHÔNG bỏ chọn được bằng cách bấm lại — đó là khác biệt cốt lõi với
 * checkbox. Bấm vào nút đang chọn thì không có gì xảy ra; muốn "không chọn gì"
 * thì bản thiết kế phải có một lựa chọn tên là "Không".
 */
const radio = tv(
  {
    slots: {
      /** Lớp nhận chạm. Dáng vẻ nằm ở `root` vì nó phụ thuộc `pressed`. */
      pressable: '',
      /**
       * ⚠️ `items-start`, KHÔNG phải `items-center` — đúng như `Checkbox`.
       * Nhãn dài ("Nhận tiền vào tài khoản thanh toán mở tại BIDV") xuống 2–3
       * dòng trên máy 320dp, hoặc khi người dùng phóng cỡ chữ hệ thống; canh
       * giữa thì vòng tròn trôi xuống giữa khối chữ và không còn thẳng hàng với
       * DÒNG ĐẦU — cả nhóm lựa chọn trông như bị lệch ngẫu nhiên.
       * ✅ Ở nhãn một dòng thì hai cách cho ra hình y hệt nhau: khung 24dp và
       * lineHeight của `text-label-lg` đều là 24.
       */
      root: 'flex-row items-start gap-2',
      /** Khung 24dp giữ chỗ; vòng vẽ 20dp nằm giữa — đúng cấu trúc Figma. */
      frame: 'h-6 w-6 items-center justify-center',
      ring: 'h-5 w-5 items-center justify-center rounded-full border-medium',
      dot: 'h-3 w-3 rounded-full',
      label: 'flex-1 text-label-lg font-semibold',
    },
    variants: {
      selected: {
        true: { ring: 'border-action-base', dot: 'bg-action-base' },
        false: { ring: 'border-border-brand-subtle' },
      },
      disabled: {
        /**
         * ⚠️ Nền `action-disabled` (#E6E6E6) lệch 11 mức so với bản vẽ (Figma:
         * `Background/Ink/Light` #F1F1F1) — giữ nguyên vì đó là token VAI TRÒ
         * "nền control bị khoá", đi thành cặp đã đo với `action-disabled-fg`, và
         * repo không có token nào đúng #F1F1F1 ở vai trò đó. ⛔ Đừng vá bằng hex
         * thô. Cùng lý do, cùng cặp token với `checkbox.styles.ts`.
         */
        true: {
          ring: 'border-border-strong bg-action-disabled',
          dot: 'bg-action-disabled-fg',
          label: 'text-action-disabled-fg',
        },
        false: { ring: 'bg-bg-1', label: 'text-fg-1' },
      },
      // Figma không vẽ trạng thái bấm; xem ghi chú cùng chỗ trong `Checkbox`.
      pressed: { true: { root: 'opacity-60' } },
    },
    defaultVariants: { disabled: false, selected: false },
  },
  { twMergeConfig }, // ⛔ BẮT BUỘC — xem docs/rules/styling-nativewind.md.
);

export interface RadioProps {
  /** Nhãn cho trình đọc màn hình khi không có `label` nhìn thấy được. */
  accessibilityLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Nhãn bên phải. Bỏ trống thì phải có `accessibilityLabel`. */
  label?: string;
  /** Giá trị nút này đại diện. Trùng `value` của `RadioGroup` ⇒ nút đang chọn. */
  value: string;
}

/** Vòng 24dp → cần thêm 10dp mỗi bên cho đủ ngưỡng chạm 44dp. */
const HIT_SLOP = { bottom: 10, left: 10, right: 10, top: 10 } as const;

export function Radio({
  accessibilityLabel,
  className,
  disabled = false,
  label,
  value,
}: RadioProps) {
  const group = useRadioGroup();
  const selected = group.value === value;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="radio"
      /**
       * ⚠️ Vai `radio` đọc khoá `selected`, KHÔNG phải `checked` như checkbox —
       * đặt nhầm khoá thì TalkBack đọc nút trống trơn và người dùng khiếm thị
       * không biết mình đang chọn phương án nào.
       */
      accessibilityState={{ disabled, selected }}
      className={radio().pressable()}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      // Bấm lại nút đang chọn KHÔNG bắn sự kiện: tránh việc nơi gọi phải tự lọc
      // những lần `onChange` không đổi gì (hay kéo theo một lượt gọi mạng thừa).
      onPress={() => {
        if (!selected) group.onChange(value);
      }}
    >
      {({ pressed }) => {
        const styles = radio({ disabled, pressed, selected });

        return (
          <View className={styles.root({ className })}>
            <View className={styles.frame()}>
              <View className={styles.ring()}>
                {selected ? <View className={styles.dot()} /> : null}
              </View>
            </View>
            {label ? <Text className={styles.label()}>{label}</Text> : null}
          </View>
        );
      }}
    </Pressable>
  );
}
