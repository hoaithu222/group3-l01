import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { SKILL_CATEGORY_LABELS, type SkillCategory } from '@/shared/career';
import { Chip } from '@/shared/ui/chip';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSelection } from '@/shared/utils/haptics';

import { SkillProgressRow } from '../components/SkillProgressRow';
import { useSkills } from '../queries/career.queries';
import { skillHref } from '../utils/career-routes';

type Filter = 'ALL' | SkillCategory;

/**
 * Tất cả kỹ năng (app.md p6-06 §3): lọc theo nhóm (chip — chỉ những nhóm đang có kỹ năng), mỗi dòng `SkillProgressRow`. Rỗng ⇒ "Chưa có kỹ năng
 * nào được bật" (vận hành chưa bật kỹ năng nào — tiến độ vẫn được ghi, sẽ hiện khi bật).
 */
export function SkillListScreen() {
  const skills = useSkills();
  const [filter, setFilter] = useState<Filter>('ALL');
  const header = <AppBar title="Tất cả kỹ năng" onBack={router.back} />;
  const categories = useMemo(() => [...new Set((skills.data ?? []).map((s) => s.category))], [skills.data]);
  const shown = useMemo(() => (skills.data ?? []).filter((s) => filter === 'ALL' || s.category === filter), [filter, skills.data]);

  if (skills.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-xs">
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!skills.data) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void skills.refetch() }]}
          description="Không tải được danh mục kỹ năng. Kiểm tra kết nối rồi thử lại."
          icon="alert-warning"
          title="Không tải được kỹ năng"
          tone="danger"
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} refreshing={skills.isRefetching} onRefresh={() => void skills.refetch()}>
      {skills.data.length === 0 ? (
        <EmptyState
          description="Khi kỹ năng được bật, tiến độ từ các task bạn đã làm sẽ hiện ở đây."
          icon="star"
          title="Chưa có kỹ năng nào được bật"
          tone="accent"
        />
      ) : (
        <View className="gap-md py-xs">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-row gap-xs">
              {(['ALL', ...categories] as Filter[]).map((key) => (
                <Chip
                  key={key}
                  label={key === 'ALL' ? 'Tất cả' : SKILL_CATEGORY_LABELS[key]}
                  role="radio"
                  selected={filter === key}
                  size="sm"
                  onPress={() => {
                    if (filter !== key) hapticSelection();
                    setFilter(key);
                  }}
                />
              ))}
            </View>
          </ScrollView>
          <View className="gap-sm">
            {shown.map((item) => (
              <SkillProgressRow key={item.id} item={item} onPress={(s) => router.push(skillHref(s.id))} />
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}
