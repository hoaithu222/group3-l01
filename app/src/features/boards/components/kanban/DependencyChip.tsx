import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

export interface DependencyChipProps {
  /** Số thẻ TRƯỚC chưa xong (BE tính sẵn trong `TaskCardDto`). */
  blockedByCount: number;
  /** Số thẻ SAU chưa xong đang chờ thẻ này. */
  blockingCount: number;
}

/**
 * Chip phụ thuộc trên thẻ Kanban (app.md §2 `DependencyChip`): "Bị chặn" (icon khoá + chữ) khi còn thẻ trước chưa xong,
 * "Chặn 2" khi đang giữ chân hai thẻ sau. Cả hai đều CÓ CHỮ chứ không chỉ màu (§7); nhãn trợ năng nói đủ số thẻ:
 * "Bị chặn bởi 2 thẻ chưa xong" / "Đang chặn 3 thẻ". Không hiện gì khi cả hai bằng 0.
 *
 * Không bấm được — cả thẻ đã là một nút mở chi tiết, nơi có danh sách phụ thuộc đầy đủ. Nền dùng `surface-*` (màu ĐẶC,
 * đổi đúng theo sáng/tối) đi với chữ `fg-1`.
 */
export function DependencyChip({ blockedByCount, blockingCount }: DependencyChipProps) {
  if (blockedByCount <= 0 && blockingCount <= 0) return null;

  return (
    <View className="flex-row flex-wrap items-center gap-xs">
      {blockedByCount > 0 ? (
        <View
          accessibilityLabel={`Bị chặn bởi ${blockedByCount} thẻ chưa xong`}
          accessible
          className="flex-row items-center gap-3xs rounded-full border-hairline border-border-warning-subtle bg-surface-warning px-xs py-3xs"
        >
          <Icon color="warning" name="lock" size={14} />
          <Text className="text-label-sm text-fg-1" maxFontSizeMultiplier={1.3} numberOfLines={1}>
            Bị chặn
          </Text>
        </View>
      ) : null}
      {blockingCount > 0 ? (
        <View
          accessibilityLabel={`Đang chặn ${blockingCount} thẻ`}
          accessible
          className="flex-row items-center gap-3xs rounded-full border-hairline border-border-1 bg-surface-neutral px-xs py-3xs"
        >
          <Icon color="fg-2" name="link" size={14} />
          <Text className="text-label-sm text-fg-1" maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {`Chặn ${blockingCount}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
