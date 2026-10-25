import { Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { HandGlyph } from '../hand/HandGlyph';

export interface TileHandBadgeProps {
  className?: string;
  /** Số thứ tự trong hàng đợi phát biểu (1 = giơ SỚM nhất, `raisedHandOrder`). Thiếu thì chỉ hiện bàn tay. */
  order?: number;
}

/**
 * Huy hiệu giơ tay ở góc TRÊN-TRÁI của MỌI ô — kể cả ô nhỏ ở dải thumbnail và khung tự xem (PiP): ✋ + số thứ tự trên viên `action-accent`.
 *
 * ⛔ Trước đây giơ tay chỉ là viên chữ "Đang giơ tay" và ô nhỏ chỉ hiện nhãn ĐẦU TIÊN ("Đang nói" thắng) ⇒ tay giơ thường vô hình.
 * ⚠️ Chữ trên nền `action-accent` dùng `action-accent-fg` (MỰC — trắng trên vàng chỉ 3.35:1). Huy hiệu là HÌNH nên ẩn khỏi trình đọc
 * màn hình: nghĩa nằm ở nhãn của ô ("Đang giơ tay thứ 2") — để lộ ra là đọc hai lần.
 */
export function TileHandBadge({ className, order }: TileHandBadgeProps) {
  return (
    <View
      accessibilityElementsHidden
      className={cn(
        'flex-row items-center gap-3xs rounded-full bg-action-accent px-xs py-3xs',
        className,
      )}
      importantForAccessibility="no-hide-descendants"
      testID="tile-hand-badge"
    >
      <HandGlyph size="sm" />
      {order ? (
        <Text
          className="text-label-sm font-semibold text-action-accent-fg"
          maxFontSizeMultiplier={1.3}
        >
          {order}
        </Text>
      ) : null}
    </View>
  );
}
