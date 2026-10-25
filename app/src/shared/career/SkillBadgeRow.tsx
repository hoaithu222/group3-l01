import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { SkillBadge } from './skill-badge.types';
import { skillIconName } from './skill-format';

export interface SkillBadgeRowProps {
  badges: SkillBadge[];
  /** Tối đa bao nhiêu huy hiệu vẽ ra; phần còn lại gộp thành "+N". Mặc định 3 (thẻ thành viên, đầu màn Nghề nghiệp). */
  max?: number;
}

/**
 * Hàng gọn ≤ 3 huy hiệu + "+N" (app.md p6-06 §2 — thẻ thành viên p1-02, đầu màn Nghề nghiệp, portfolio p6-07). Chỉ để XEM: cả hàng là MỘT
 * phần tử trợ năng đọc đủ tên các huy hiệu, nơi gọi bọc `Pressable` nếu muốn mở danh sách đầy đủ. Bỏ qua huy hiệu đã thu hồi.
 */
export function SkillBadgeRow({ badges, max = 3 }: SkillBadgeRowProps) {
  const active = badges.filter((b) => !b.revoked);
  if (active.length === 0) return null;
  const shown = active.slice(0, max);
  const rest = active.length - shown.length;
  const label = `Huy hiệu kỹ năng xác thực: ${active.map((b) => b.skill.name).join(', ')}`;

  return (
    <View accessibilityLabel={label} accessible className="flex-row flex-wrap items-center gap-xs">
      {shown.map((b) => (
        <View key={b.skill.id} className="flex-row items-center gap-2xs rounded-full border border-border-1 bg-bg-1 px-sm py-2xs">
          <Icon name={skillIconName(b.skill.icon)} size="sm" />
          <Text className="text-caption-lg text-fg-1" numberOfLines={1}>
            {b.skill.name}
          </Text>
        </View>
      ))}
      {rest > 0 ? <Text className="text-caption-lg text-fg-2">{`+${String(rest)}`}</Text> : null}
    </View>
  );
}
