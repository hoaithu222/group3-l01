import { Pressable } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { type searchStyles } from './search.styles';

export interface SearchClearButtonProps {
  /** Nhãn cho trình đọc màn hình — phải nói rõ xoá CÁI GÌ. */
  label: string;
  /** Công thức đã tính sẵn của `SearchInput` — cùng lối truyền với `InputControls`. */
  styles: ReturnType<typeof searchStyles>;
  onPress: () => void;
}

/**
 * Nút xoá (✕) ở đuôi ô tìm kiếm.
 *
 * Tách khỏi `SearchInput.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`, và `scripts/check-file-size.mjs` giữ trần đó).
 * Ranh giới đặt ở đây chứ không chỗ khác: `SearchInput` giữ phần Ô NHẬP —
 * state, ref mệnh lệnh, bốn prop bàn phím — còn file này giữ đúng cái nút cùng
 * hai khối chú thích giải thích màu và cỡ của nó.
 *
 * ⛔ KHÔNG dùng lại `input/InputClearButton.tsx`: ô tìm kiếm vẽ nút 20dp
 * (`cancel` cỡ `sm`) còn ô nhập vẽ 24 (`clear-circle` cỡ `md`) — bộ icon của
 * ngân hàng đặt tên riêng cho từng bản. Nút ở đây còn phải ăn lớp `clearButton`
 * của `searchStyles`, thứ mà file kia không có đường nhận.
 *
 * ⛔ Không export ra barrel của nhóm: ngoài ô tìm kiếm, nút này không có nghĩa.
 */
export function SearchClearButton({ label, styles, onPress }: SearchClearButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className={styles.clearButton()}
      // Biểu tượng chỉ 20dp, ngưỡng chạm dễ trúng tối thiểu là 44dp — dưới
      // mức đó người dùng bấm hai ba lần mới trúng và họ đổ lỗi cho app chứ
      // không cho ngón tay mình.
      hitSlop={12}
      onPress={onPress}
    >
      {/**
       * ⛔ `fg-2`, KHÔNG phải `fg-3`. Dấu ✕ là dấu hiệu DUY NHẤT của một nút
       * bấm được ⇒ ngưỡng 3:1 của thành phần phi văn bản. `fg-3` (#969696
       * trên ruột ô `bg-input` trắng) đo được **2.96:1** — trượt ngưỡng.
       * `fg-2`: **5.74:1** sáng (#666666/#FFFFFF) · **8.42:1** tối
       * (#B7C4C0/#1E2826). Cùng cách vá với `AlertCloseButton`.
       *
       * ⚠️ Giữ nét `linear` dù Figma vẽ đĩa ĐẶC #d1d1d1 với ✕ đậm #1a1a1a
       * bên trong: bộ icon không có bản hai tông, mà `cancel.solid` là một
       * đĩa MỘT màu với ✕ khoét rỗng — tô `fg-4` cho đúng sắc đĩa thì cả
       * đĩa lẫn ✕ đều rơi xuống ~1.7:1, tức là đổi một lệch màu nhỏ lấy một
       * nút gần như vô hình. Nét mảnh màu đậm giữ đúng thứ bản vẽ muốn
       * người dùng thấy: một dấu ✕ TỐI.
       */}
      <Icon color="fg-2" name="cancel" size="sm" />
    </Pressable>
  );
}
