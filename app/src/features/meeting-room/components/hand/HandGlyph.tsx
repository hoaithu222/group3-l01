import { Text } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { HAND_EMOJI } from '../../utils/hand-queue.utils';

/** Cỡ theo thang chữ (emoji là chữ): `sm` cho huy hiệu/dòng danh sách, `md` cho nút, `lg` cho chỗ cần nổi (thông báo, trạng thái lớn). */
const SIZE = {
  sm: 'text-label-md',
  md: 'text-header-sm',
  lg: 'text-header-md',
} as const;

export type HandGlyphSize = keyof typeof SIZE;

export interface HandGlyphProps {
  className?: string;
  size?: HandGlyphSize;
}

/**
 * Bàn tay ✋ DÙNG CHUNG của phòng họp: nút Giơ tay, huy hiệu trên ô người, danh sách người, viên đếm ở đầu phòng — một chỗ quyết định
 * hình và cỡ để bốn nơi không lệch nhau. Lý do dùng emoji: xem `HAND_EMOJI`.
 *
 * ⛔ Chỉ là HÌNH: ẩn khỏi trình đọc màn hình — nghĩa ("Đang giơ tay", "Giơ tay"/"Hạ tay") nằm ở nhãn chữ / `accessibilityLabel` của nơi
 * dùng. `maxFontSizeMultiplier` giữ hình không phình phá khung nút khi người dùng phóng to chữ hệ thống.
 */
export function HandGlyph({ className, size = 'md' }: HandGlyphProps) {
  return (
    <Text
      accessibilityElementsHidden
      className={cn(SIZE[size], className)}
      importantForAccessibility="no-hide-descendants"
      maxFontSizeMultiplier={1.3}
    >
      {HAND_EMOJI}
    </Text>
  );
}
