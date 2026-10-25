import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { SkillBadge } from './skill-badge.types';
import { SKILL_CATEGORY_LABELS, skillIconName } from './skill-format';

export interface SkillBadgeCardProps {
  badge: SkillBadge;
  /** Bấm ⇒ mở minh chứng. Bỏ trống ⇒ thẻ chỉ để xem. */
  onPress?: (badge: SkillBadge) => void;
}

/**
 * Một huy hiệu kỹ năng xác thực (app.md p6-06 §2): icon + tên + nhóm + ngày mở khoá. Huy hiệu bị thu hồi (chỉ chính chủ nhận được) hiện mờ kèm
 * câu trung tính — KHÔNG lý do nội bộ. ⚠️ Không dùng chữ "chứng chỉ" (không phải văn bằng).
 */
export function SkillBadgeCard({ badge, onPress }: SkillBadgeCardProps) {
  const { skill } = badge;
  const status = badge.revoked
    ? (badge.revokedNotice ?? 'Huy hiệu đã được thu hồi sau rà soát')
    : `Đạt ${formatDate(badge.unlockedAt)}`;
  const interactive = onPress !== undefined;

  return (
    <Pressable
      accessibilityHint={interactive ? 'Chạm hai lần để xem minh chứng' : undefined}
      accessibilityLabel={`Huy hiệu kỹ năng xác thực ${skill.name}, ${SKILL_CATEGORY_LABELS[skill.category]}, ${status}`}
      accessibilityRole={interactive ? 'button' : 'text'}
      className="min-h-12 flex-row items-center gap-sm rounded-md border border-border-1 bg-bg-1 p-sm"
      disabled={!interactive}
      onPress={interactive ? () => onPress(badge) : undefined}
    >
      <View className={badge.revoked ? 'opacity-40' : undefined}>
        <Icon name={skillIconName(skill.icon)} size="md" />
      </View>
      <View className="flex-1 gap-2xs">
        <Text className="text-body-md font-semibold text-fg-1" numberOfLines={1}>
          {skill.name}
        </Text>
        <Text className="text-caption-lg text-fg-2">{SKILL_CATEGORY_LABELS[skill.category]}</Text>
        <Text className={badge.revoked ? 'text-caption-lg text-fg-2' : 'text-caption-lg text-success'}>
          {status}
        </Text>
      </View>
    </Pressable>
  );
}
