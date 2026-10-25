import { Pressable, Text, View } from 'react-native';

import { SKILL_CATEGORY_LABELS, SkillProgressBar, skillIconName } from '@/shared/career';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';

import type { SkillCatalogItem } from '../api/career.types';
import { SKILL_STATUS_LABELS, skillStatus } from '../utils/skill-text';

export interface SkillProgressRowProps {
  item: SkillCatalogItem;
  onPress: (item: SkillCatalogItem) => void;
}

const STATUS_CLASS = {
  achieved: 'text-caption-lg font-semibold text-success',
  revoked: 'text-caption-lg font-semibold text-fg-2',
  progressing: 'text-caption-lg font-semibold text-fg-brand',
} as const;

const STATUS_TONE: Record<keyof typeof STATUS_CLASS, IconTileTone> = {
  achieved: 'success',
  revoked: 'neutral',
  progressing: 'brand',
};

/**
 * Một kỹ năng trong danh mục (app.md p6-06 §3 "Tất cả kỹ năng"): icon, tên, nhóm, thanh tiến độ + CHỮ "32/50 task", trạng thái bằng chữ
 * ("Đã đạt" / "Đã bị thu hồi" / "Đang tiến bộ"). Cả hàng là MỘT nút mở chi tiết.
 */
export function SkillProgressRow({ item, onPress }: SkillProgressRowProps) {
  const status = skillStatus(item);
  const target = item.criteria.requiredTasksDone;
  const caption = `${String(Math.min(item.myProgress.tasksDone, target))}/${String(target)} task`;

  return (
    <Pressable
      accessibilityHint="Chạm hai lần để xem tiêu chí và tiến độ"
      accessibilityLabel={`${item.name}, ${SKILL_CATEGORY_LABELS[item.category]}, ${caption}, ${SKILL_STATUS_LABELS[status]}`}
      accessibilityRole="button"
      className="min-h-12 flex-row items-center gap-sm rounded-md border border-border-1 bg-bg-1 p-sm active:opacity-70"
      onPress={() => onPress(item)}
    >
      {/* Ô icon đổi tông theo trạng thái (đạt = thành công · thu hồi = trung tính · đang làm = thương hiệu) — chữ trạng thái vẫn ở bên phải. */}
      <IconTile name={skillIconName(item.icon)} tone={STATUS_TONE[status]} />
      <View className="flex-1 gap-2xs">
        <View className="flex-row items-center justify-between gap-sm">
          <Text className="flex-1 text-body-md font-semibold text-fg-1" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className={STATUS_CLASS[status]}>{SKILL_STATUS_LABELS[status]}</Text>
        </View>
        <Text className="text-caption-lg text-fg-2">{SKILL_CATEGORY_LABELS[item.category]}</Text>
        <SkillProgressBar caption={caption} current={item.myProgress.tasksDone} target={target} />
      </View>
    </Pressable>
  );
}
