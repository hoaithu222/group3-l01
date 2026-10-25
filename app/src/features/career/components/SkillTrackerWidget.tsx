import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { SkillProgressBar } from '@/shared/career';
import { Card } from '@/shared/ui/card';
import { LinkButton } from '@/shared/ui/button';

import type { SkillCatalogItem } from '../api/career.types';
import { SKILLS_HREF, skillHref } from '../utils/career-routes';
import { closeness, remainingText } from '../utils/skill-text';

export interface SkillTrackerWidgetProps {
  skills: SkillCatalogItem[];
  /** Số kỹ năng gần đạt nhất hiện ra (mặc định 3 — app.md p6-06 §3). */
  max?: number;
}

/**
 * "Còn bao nhiêu nữa" (đặc tả `SkillTrackerWidget`): 3 kỹ năng CHƯA đạt gần đạt nhất, mỗi dòng một câu "Còn 12 task ReactJS · 3,5 điểm review"
 * + thanh tiến độ có chữ. Không kỹ năng nào đang dở ⇒ không vẽ (nơi gọi hiện trạng thái rỗng riêng).
 */
export function SkillTrackerWidget({ max = 3, skills }: SkillTrackerWidgetProps) {
  const open = skills
    .filter((s) => !s.myBadge && !s.myProgress.achieved)
    .sort((a, b) => closeness(b) - closeness(a))
    .slice(0, max);
  if (open.length === 0) return null;

  return (
    <Card title="Sắp đạt">
      <View className="gap-md">
        {open.map((s) => {
          const text = remainingText(s) ?? '';
          const target = s.criteria.requiredTasksDone;
          return (
            <Pressable
              key={s.id}
              accessibilityHint="Chạm hai lần để xem chi tiết kỹ năng"
              accessibilityLabel={`${s.name}. ${text}`}
              accessibilityRole="button"
              className="min-h-12 gap-2xs active:opacity-70"
              onPress={() => router.push(skillHref(s.id))}
            >
              <Text className="text-body-md font-semibold text-fg-1">{s.name}</Text>
              <SkillProgressBar
                caption={text}
                current={s.myProgress.tasksDone}
                target={target}
              />
            </Pressable>
          );
        })}
        <LinkButton label="Xem tất cả kỹ năng" onPress={() => router.push(SKILLS_HREF)} />
      </View>
    </Card>
  );
}
