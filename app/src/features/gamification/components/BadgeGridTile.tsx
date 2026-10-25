import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { PressableScale } from '@/shared/ui/motion';
import { cn } from '@/shared/utils/style/cn';

import { RARITY_TILE } from '../constants/gamification.constants';
import { badgeStatusText, badgeTileLabel } from '../utils/badge-format';
import type { BadgeTileProps } from './BadgeTile';

/**
 * Ô huy hiệu dạng LƯỚI (danh mục màn Thành tích, 2 cột bằng nhau): emoji trên ô màu độ hiếm, tên, mô tả ngắn, trạng thái.
 * Cùng hành vi + CÙNG câu trợ năng với `BadgeTile` (ô hàng — vẫn dùng ở "Đang trưng bày" và hồ sơ công khai).
 *
 * ✅ Chưa đạt đọc được KHÔNG cần màu: biểu tượng ổ khoá + chữ "Chưa đạt · 32/50" (ngoài emoji mờ); đã đạt: dấu tick +
 * "Đạt ngày …". ✅ `PressableScale` co nhẹ khi nhấn (ô độc lập có viền bo — đúng ca dùng của nó); `fill` + `flex-1` ⇒ hai ô
 * một hàng cao bằng nhau dù mô tả dài ngắn khác nhau.
 */
export function BadgeGridTile({
  badge,
  onPress,
  selectable = false,
  selected = false,
}: BadgeTileProps) {
  const unlocked = Boolean(badge.unlockedAt);
  const interactive = onPress !== undefined && (!selectable || unlocked);

  return (
    <PressableScale
      accessibilityHint={interactive && !selectable ? 'Chạm hai lần để xem chi tiết' : undefined}
      accessibilityLabel={badgeTileLabel(badge, { selectable, selected })}
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: selected, disabled: !interactive } : undefined}
      className="flex-1"
      contentClassName={cn(
        'gap-xs rounded-md border p-sm',
        selected ? 'border-border-brand bg-surface-primary' : 'border-border-1 bg-bg-1',
      )}
      disabled={!interactive}
      fill
      onPress={interactive ? () => onPress(badge) : undefined}
    >
      <View className="flex-row items-start justify-between gap-xs">
        <View
          className={cn(
            'size-4xl items-center justify-center rounded-sm',
            unlocked ? RARITY_TILE[badge.rarity] : 'bg-surface-neutral',
          )}
        >
          <Text className={cn('text-header-md', !unlocked && 'opacity-40')}>
            {badge.emoji ?? '🏅'}
          </Text>
        </View>
        <Icon
          color={unlocked ? 'success' : 'fg-2'}
          name={unlocked ? 'checkmark-circle' : 'lock'}
          size="sm"
        />
      </View>
      <Text className="text-label-md font-semibold text-fg-1" numberOfLines={2}>
        {badge.name}
      </Text>
      <Text className="flex-1 text-caption-lg text-fg-2" numberOfLines={2}>
        {badge.description}
      </Text>
      <Text className={unlocked ? 'text-caption-lg text-success' : 'text-caption-lg text-fg-2'}>
        {badgeStatusText(badge)}
      </Text>
      {selectable && unlocked ? (
        <Text className="text-caption-lg font-semibold text-fg-brand">
          {selected ? 'Đang trưng bày' : 'Chọn'}
        </Text>
      ) : null}
    </PressableScale>
  );
}
