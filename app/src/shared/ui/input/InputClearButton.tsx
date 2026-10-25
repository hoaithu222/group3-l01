import { Pressable } from 'react-native';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';

export interface InputClearButtonProps {
  /** Màu nét của biểu tượng — theo `controlInk` của `InputControls`. */
  color: ThemeColorKey;
  /** Nhãn cho trình đọc màn hình. Ô nào cũng nên nói rõ xoá CÁI GÌ. */
  label?: string;
  onPress: () => void;
}

/**
 * Nút xoá sạch nội dung (×) ở đuôi ô nhập — Figma vẽ trên mọi ô ĐÃ ĐIỀN của 9
 * màn "Cập nhật thông tin" (`1035:27864`, `904:28984`, `1099:28014`,
 * `1522:33461`, `896:28142`): biểu tượng `clear-circle` 24×24.
 *
 * Tách khỏi `Input.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`), không phải vì dùng lại ở đâu khác — cùng khuôn
 * với `InputSecureToggle` cạnh nó.
 *
 * ⛔ Tên icon là `clear-circle`, KHÔNG phải `close`/`x`: bộ của ngân hàng đặt
 * tên theo lối riêng (xem bảng trong `src/shared/ui/AGENTS.md`). `SearchInput`
 * dùng `cancel` cỡ `sm` vì ô tìm kiếm vẽ nút 20dp; ô nhập thì bản vẽ khai 24.
 */
export function InputClearButton({
  color,
  label = 'Xoá nội dung',
  onPress,
}: InputClearButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      /**
       * Biểu tượng chỉ 24dp, mà ngưỡng chạm dễ trúng tối thiểu là 44dp — dưới
       * mức đó người dùng bấm hai ba lần mới trúng và họ đổ lỗi cho app chứ
       * không cho ngón tay mình. 12 mỗi phía ⇒ 48dp, bằng `InputSecureToggle`.
       *
       * ⚠️ Ô vừa `secure` vừa `clearable` thì hai vùng nới chồng lên nhau ở khe
       * 8dp giữa hai nút, và React Native trao cú chạm cho nút VẼ SAU (con mắt).
       * Nút xoá vẫn còn ~36dp bề ngang nên chấp nhận được; ca này cũng hiếm —
       * ô mật khẩu gần như không bao giờ cần nút xoá.
       */
      hitSlop={12}
      onPress={onPress}
    >
      <Icon color={color} name="clear-circle" size="md" />
    </Pressable>
  );
}
