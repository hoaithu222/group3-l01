import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

export interface ComposerToolButtonProps {
  /** BẮT BUỘC — nút chỉ có hình, không có chữ nào cho trình đọc màn hình. */
  accessibilityLabel: string;
  /** Hình 24dp (`<Icon />` hoặc ký tự emoji) — nút không tự vẽ gì. */
  children: ReactNode;
  /** Nút ĐẦU hàng: chừa thêm 8dp phía mép màn để hình cách mép đúng 16dp (xem chú thích bên dưới). */
  first?: boolean;
  /** Đang bật (bảng emoji đang mở) — cho trình đọc màn hình. */
  selected?: boolean;
  onPress: () => void;
}

/**
 * Nút CÔNG CỤ trần ở đầu hàng soạn tin (Đính kèm, Emoji) — hình 24dp KHÔNG có đĩa nền.
 *
 * ── Vì sao viết cục bộ mà không dùng `Button iconOnly` ─────────────────────────────────────────────────────
 * Bộ chung không có nút icon trần (mọi biến thể `Button` đều có nền hoặc viền) và không có icon mặt cười để `Button` vẽ.
 * Cụm `+` · emoji bám bố cục `ComposerInputRow` của vci-sun-mobile: hai hình DÍNH SÁT nhau như một cụm công cụ, nhường
 * chỗ cho ô nhập rộng. Hai đĩa nền 40dp cạnh nhau ăn 84dp bề ngang, ô nhập trên máy 360dp chỉ còn ~154dp chữ (~22 ký tự/dòng).
 *
 * ── Số đo ─────────────────────────────────────────────────────────────────────────────────────────────────
 * Cao 40 (`h-control-sm`, cùng nút Gửi/Mic). Đệm ngang BẤT ĐỐI XỨNG: nút đầu `pl-xs pr-2xs` (8 + 24 + 4), nút sau `px-2xs` (4 + 24 + 4) ⇒
 *  · hình đầu cách mép màn 8 (lề hàng `px-xs`) + 8 = 16dp — đúng lề màn như mọi hàng khác;
 *  · hai hình cách nhau 4 + 4 = 8dp — một cụm liền.
 * Bề ngang thật 36/32 chưa đủ 44dp ⇒ `hitSlop={6}` kéo lên 48/44 mà KHÔNG nới hình. Hai vùng chạm chồng nhau vài dp ở giữa
 * (nút sau nằm trên ⇒ thắng) — chấp nhận được vì hai hình cách nhau 8dp và người dùng nhắm vào HÌNH.
 *
 * ⚠️ Phản hồi khi nhấn là làm mờ hình (`opacity-60`), đặt ở lớp CON trong render-prop — `className` của `Pressable` không nhận hàm.
 */
export function ComposerToolButton({ accessibilityLabel, children, first = false, selected = false, onPress }: ComposerToolButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cn('h-control-sm items-center justify-center', first ? 'pl-xs pr-2xs' : 'px-2xs')}
      hitSlop={6}
      onPress={onPress}
    >
      {({ pressed }) => <View className={pressed ? 'size-6 items-center justify-center opacity-60' : 'size-6 items-center justify-center'}>{children}</View>}
    </Pressable>
  );
}
