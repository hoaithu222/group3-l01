import { Text, View } from 'react-native';

import type { inputStyles } from './input.styles';
import { InputMessage } from './InputMessage';

export interface InputLabelProps {
  /** Chú thích phải nhãn — thường là bộ đếm ký tự ("12/50") hoặc luật nhập. */
  hint?: string;
  label: string;
  required: boolean;
  /** Công thức đã tính sẵn của `Input` — truyền cả object để khỏi 6 prop lớp. */
  styles: ReturnType<typeof inputStyles>;
}

/**
 * Hàng nhãn của ô nhập: `[* đỏ] [nhãn] … [ⓘ chú thích]`.
 *
 * Tách khỏi `Input.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`), không phải vì dùng lại ở đâu khác.
 */
export function InputLabel({ hint, label, required, styles }: InputLabelProps) {
  return (
    <View className={styles.labelRow()}>
      <View
        /**
         * ⛔ CẢ khối nhãn bị ẩn khỏi trình đọc màn hình, không riêng dấu `*`.
         *
         * Nội dung của nó đã nằm nguyên trong `accessibilityLabel` của
         * `TextInput` (`Input.tsx` gấp sẵn thành "Email, bắt buộc"). Để lộ ra
         * thì TalkBack/VoiceOver quét qua đọc "Email" rồi ngay sau đó "Email,
         * bắt buộc, ô nhập" — người dùng khiếm thị nghe mỗi ô hai lần, và trên
         * form 9 ô đó là 9 lần lặp thừa.
         *
         * ⚠️ Hai prop chứ không phải một: `accessibilityElementsHidden` là của
         * iOS, `importantForAccessibility="no-hide-descendants"` là của Android
         * — thiếu cái nào thì nhãn vẫn đọc hai lần trên đúng nền tảng đó.
         *
         * ⚠️ Ẩn ở `labelGroup` chứ KHÔNG ở `labelRow`: chú thích phải nhãn
         * ("Tối đa 50 ký tự") là em của `labelRow` và KHÔNG nằm trong
         * `accessibilityLabel` của ô, nên nó phải đọc được.
         */
        accessibilityElementsHidden
        className={styles.labelGroup()}
        importantForAccessibility="no-hide-descendants"
      >
        {required ? (
          // Thuần trang trí: thông tin "bắt buộc" đã nằm trong
          // `accessibilityLabel` của ô — xem chú thích của khối bọc ngoài.
          <Text className={styles.required()}>*</Text>
        ) : null}
        {/**
         * ⚠️ `numberOfLines={2}`, KHÔNG phải 1. Nhãn là chữ NỘI DUNG nằm ngoài
         * khung ô, không bị chiều cao nào ràng buộc — nên chỗ hẹp thì cho nó
         * XUỐNG DÒNG chứ đừng cắt cụt. Hỏng ra sao nếu để 1: trên máy 320dp với
         * cỡ chữ hệ thống phóng 2×, "Số tài khoản người thụ hưởng" chỉ còn
         * "Số tài kho…" và người dùng không biết ô này hỏi gì. Vẫn chặn ở 2 để
         * một nhãn bị nhập sai (cả đoạn văn) không đẩy trôi cả form.
         */}
        <Text className={styles.label()} numberOfLines={2}>
          {label}
        </Text>
      </View>
      {hint === undefined ? null : (
        <InputMessage
          className={styles.hintRow()}
          text={hint}
          textClassName={styles.hint()}
          tone="hint"
        />
      )}
    </View>
  );
}
