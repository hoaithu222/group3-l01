import { View } from 'react-native';

/**
 * ⛔ Nhập THẲNG từ file component, KHÔNG qua `@/shared/ui`.
 *
 * Component nằm TRONG `src/shared/ui/` mà nhập qua barrel tổng là tạo import
 * vòng (`index → empty-state → index`), và trên React Native vòng hiện ra LÚC
 * CHẠY dưới dạng `undefined is not a function` ở một file không liên quan.
 * ESLint chặn cứng (`import/no-cycle`).
 */
import { Button } from '../button/Button';
import type { ButtonVariant } from '../button/button.styles';

export interface EmptyStateActionProps {
  label: string; // Cũng là `key` của hàng nút — hai nút đừng trùng nhãn.
  /**
   * Biến thể của `Button` dùng chung.
   *
   * ⚠️ Trước đây chỗ này có bộ tên RIÊNG (`solid`/`outline`) cho một cái nút tự
   * dựng tại chỗ. Đã bỏ: hai bộ tên cho cùng một thứ nghĩa là lúc đổi bo góc
   * hay chiều cao nút, người sửa chỉ tìm thấy MỘT trong hai và giao diện lệch
   * ở đúng một màn hình. Ánh xạ cũ → mới: `solid` = `primary`,
   * `outline` = `secondary`.
   */
  variant?: ButtonVariant;
  disabled?: boolean;
  onPress: () => void;
}

interface EmptyStateActionsProps {
  actions: readonly EmptyStateActionProps[];
  /** Slot `actions` của recipe cha — bề rộng hàng nút do `EmptyState` quyết định. */
  className: string;
}

/**
 * Hàng nút của `EmptyState`.
 *
 * Tách khỏi `EmptyState.tsx` vì `.tsx` phải ≤ 200 dòng (`src/shared/ui/AGENTS.md`).
 *
 * Quy tắc lấy từ Figma **Version 2v.0** (`259:96221`), và v1.0 (`259:97281`)
 * cũng theo đúng nó:
 *   · **1 nút** → ÔM sát chữ, canh giữa hàng (bản v1.0);
 *   · **2 nút** → mỗi nút CHIA ĐÔI hàng rộng 311 (bản v2.0);
 *   · **0 nút** → không vẽ hàng nào (màn "Danh bạ thụ hưởng trống" của v2.0).
 *
 * ⚠️ Thứ tự là thứ tự MẢNG, và Figma xếp nút viền (`secondary`) TRƯỚC nút đặc
 * (`primary`). Quá 2 nút thì nhãn bị cắt ở màn 320dp — component không chặn,
 * nơi gọi phải chặn.
 */
export function EmptyStateActions({ actions, className }: EmptyStateActionsProps) {
  const grow = actions.length > 1;
  /**
   * ⚠️ Hai nút mà nhãn dài thì XẾP DỌC thay vì chia đôi hàng 311.
   *
   * Plus Jakarta Sans rộng hơn Roboto ~10%: "Tham gia bằng mã" + "Tạo nhóm" mỗi nút chỉ còn ~151dp nên nhãn bị
   * cắt thành "Tham gia b…" (đo trên máy ảo). Nhãn tiếng Việt thường dài hơn bản vẽ tiếng Anh của Figma; ngưỡng 22 ký
   * tự (tổng hai nhãn) là mức hai nhãn còn vừa nửa hàng 311 ở cỡ chữ mặc định.
   */
  const stacked = grow && actions.reduce((total, action) => total + action.label.length, 0) > 22;

  return (
    <View className={stacked ? 'w-full max-w-[311px] gap-xs' : className}>
      {actions.map((action) => (
        /**
         * ⛔ `flex-1` phải nằm ở lớp BỌC NGOÀI, không truyền vào `className`
         * của `Button`.
         *
         * `className` của `Button` đi vào khối NHÌN THẤY bên trong, còn thứ
         * chia chỗ trong hàng là `<Pressable>` bọc ngoài — mà mặc định nó
         * `self-start` (ôm sát chữ). Đặt `flex-1` vào trong thì hai nút vẫn co
         * theo nhãn và hàng nút lệch hẳn so với bản vẽ. Bọc ngoài `flex-1` +
         * `fullWidth` mới ra hai nút chia đôi hàng.
         */
        <View key={action.label} className={grow && !stacked ? 'flex-1' : undefined}>
          <Button
            disabled={action.disabled}
            fullWidth={grow}
            label={action.label}
            variant={action.variant ?? 'primary'}
            onPress={action.onPress}
          />
        </View>
      ))}
    </View>
  );
}
