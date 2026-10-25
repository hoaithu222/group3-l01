import { Pressable, Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import type { BadgeDto } from '../api/gamification.types';
import { RARITY_TILE } from '../constants/gamification.constants';
import { badgeStatusText, badgeTileLabel } from '../utils/badge-format';

export interface BadgeTileProps {
  badge: BadgeDto;
  /** Đang chỉnh trưng bày: ô đã mở là ô CHỌN (checkbox); ô chưa mở không bấm được. */
  selectable?: boolean;
  selected?: boolean;
  /** Bấm ô: chỉnh trưng bày ⇒ chọn/bỏ chọn; ngoài đó ⇒ mở `BadgeDetailSheet`. Bỏ trống ⇒ ô chỉ để xem. */
  onPress?: (badge: BadgeDto) => void;
}

/**
 * Một ô huy hiệu: đã mở (đủ màu + ngày đạt) / chưa mở (mờ + "Chưa đạt · 32/50" bằng CHỮ). Khi `selectable`, ô đã mở là
 * nút chọn trưng bày có `accessibilityState.checked`; ngoài chế độ chỉnh, bấm ô để xem chi tiết.
 */
export function BadgeTile({
  badge,
  onPress,
  selectable = false,
  selected = false,
}: BadgeTileProps) {
  const unlocked = Boolean(badge.unlockedAt);
  const status = badgeStatusText(badge);
  const interactive = onPress !== undefined && (!selectable || unlocked);

  return (
    <Pressable
      accessibilityHint={interactive && !selectable ? 'Chạm hai lần để xem chi tiết' : undefined}
      accessibilityLabel={badgeTileLabel(badge, { selectable, selected })}
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: selected, disabled: !interactive } : undefined}
      // Lớp gộp bằng `cn()` (⛔ không nối chuỗi — NativeWind áp theo độ ưu tiên CSS). `active:opacity-80` chỉ khi ô BẤM ĐƯỢC:
      // ô chỉ-xem (hồ sơ công khai) mà mờ đi khi chạm là hứa một hành động không có.
      className={cn(
        'min-h-12 flex-row items-center gap-sm rounded-md border p-sm',
        selected ? 'border-border-brand bg-surface-primary' : 'border-border-1 bg-bg-1',
        interactive && 'active:opacity-80',
      )}
      disabled={!interactive}
      onPress={interactive ? () => onPress(badge) : undefined}
    >
      {/* Ô nền theo ĐỘ HIẾM (phổ biến → huyền thoại) khi đã đạt; chưa đạt thì ô xám + emoji mờ. Nhãn độ hiếm bằng chữ
          vẫn nằm trong `accessibilityLabel` — màu chỉ là điểm nhấn cho mắt. */}
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
      <View className="flex-1 gap-2xs">
        <Text className="text-body-md font-semibold text-fg-1" numberOfLines={1}>
          {badge.name}
        </Text>
        <Text className="text-caption-lg text-fg-2" numberOfLines={2}>
          {badge.description}
        </Text>
        <Text className={unlocked ? 'text-caption-lg text-success' : 'text-caption-lg text-fg-2'}>
          {status}
        </Text>
      </View>
      {selectable && unlocked ? (
        <Text className="text-caption-lg font-semibold text-fg-brand">
          {selected ? 'Đang trưng bày' : 'Chọn'}
        </Text>
      ) : null}
    </Pressable>
  );
}
