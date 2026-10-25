import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import type { BadgeDto } from '../api/gamification.types';

export interface ShowcaseEditorProps {
  /** Huy hiệu đã chọn, THEO THỨ TỰ trưng bày. */
  badges: BadgeDto[];
  onMove: (badgeId: string, delta: -1 | 1) => void;
  onRemove: (badgeId: string) => void;
}

/**
 * Sắp thứ tự huy hiệu trưng bày (app.md p4-03 §2 `ShowcaseEditor`): mỗi dòng có nút "Lên"/"Xuống" và "Bỏ". Cố ý là
 * NÚT chứ không phải kéo-thả: kéo-thả không có cách thay thế cho trình đọc màn hình và người dùng vận động khó. Thứ tự
 * gửi lên `PUT /me/badges/showcase` đúng như danh sách này (BE giữ nguyên thứ tự `badgeIds`).
 */
export function ShowcaseEditor({ badges, onMove, onRemove }: ShowcaseEditorProps) {
  if (badges.length === 0) {
    return (
      <Text className="text-body-md text-fg-2">
        Chọn huy hiệu ở danh sách bên dưới để trưng bày.
      </Text>
    );
  }
  return (
    <View className="gap-xs">
      {badges.map((badge, index) => (
        <View
          key={badge.id}
          className="min-h-12 flex-row items-center gap-xs rounded-md border border-border-1 bg-bg-1 px-sm py-xs"
        >
          <Text className="w-6 text-label-md text-fg-2">{`${index + 1}.`}</Text>
          <Text className="text-header-sm">{badge.emoji ?? '🏅'}</Text>
          <Text className="flex-1 text-body-md text-fg-1" numberOfLines={1}>
            {badge.name}
          </Text>
          <Button
            accessibilityLabel={`Đưa ${badge.name} lên trước`}
            disabled={index === 0}
            iconLeft="arrow-up-small"
            iconOnly
            size="xs"
            variant="tertiary"
            onPress={() => onMove(badge.id, -1)}
          />
          <Button
            accessibilityLabel={`Đưa ${badge.name} xuống sau`}
            disabled={index === badges.length - 1}
            iconLeft="arrow-down-small"
            iconOnly
            size="xs"
            variant="tertiary"
            onPress={() => onMove(badge.id, 1)}
          />
          <Button
            accessibilityLabel={`Bỏ ${badge.name} khỏi trưng bày`}
            iconLeft="cancel"
            iconOnly
            size="xs"
            variant="secondary"
            onPress={() => onRemove(badge.id)}
          />
        </View>
      ))}
    </View>
  );
}
