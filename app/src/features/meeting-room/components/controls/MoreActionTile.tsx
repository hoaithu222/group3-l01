import { Text } from 'react-native';

import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { PressableScale } from '@/shared/ui/motion';
import { cn } from '@/shared/utils/style/cn';

export interface MoreActionTileProps {
  /** Dòng trạng thái bằng CHỮ dưới nhãn ("Đang chọn", "Đang dùng loa ngoài") — trạng thái không chỉ nằm ở màu nền. */
  description?: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Đang bật/đang chọn (bố cục hiện tại, đang chia sẻ) — nền tint + viền thương hiệu + `accessibilityState.selected`. */
  selected?: boolean;
  tone?: IconTileTone;
}

/**
 * Một Ô thao tác nhanh trong menu "Thêm" (lưới kiểu "More options" của Meet): ô icon có tông + nhãn 2 dòng (+ dòng trạng thái). Cả ô là
 * MỘT nút; câu đọc gộp nhãn + trạng thái ("Bố cục lưới, Đang chọn").
 *
 * ✅ `PressableScale` (ô độc lập có nền bo, KHÔNG phải hàng danh sách) — co nhẹ khi nhấn, tự tắt khi "Giảm chuyển động".
 * ⚠️ Nằm trong `BottomSheet` (bề mặt THEO THEME) nên dùng token theo theme (`surface-neutral`, `fg-1`/`fg-2`) — khác với thanh điều khiển
 * nằm trên nền phòng luôn tối.
 */
export function MoreActionTile({
  description,
  icon,
  label,
  onPress,
  selected = false,
  tone = 'neutral',
}: MoreActionTileProps) {
  return (
    <PressableScale
      accessibilityLabel={description ? `${label}, ${description}` : label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-1"
      contentClassName={({ pressed }) =>
        cn(
          'min-h-24 items-center justify-center gap-2xs rounded-sm border-hairline px-2xs py-sm',
          selected
            ? 'border-border-brand bg-action-tint'
            : pressed
              ? 'border-transparent bg-action-tint'
              : 'border-transparent bg-surface-neutral',
        )
      }
      fill
      scaleTo={0.96}
      onPress={onPress}
    >
      <IconTile name={icon} size="sm" tone={tone} />
      <Text className="text-center text-label-sm text-fg-1" numberOfLines={2}>
        {label}
      </Text>
      {description ? (
        <Text className="text-center text-caption-sm text-fg-2" numberOfLines={2}>
          {description}
        </Text>
      ) : null}
    </PressableScale>
  );
}
