import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { SkillBadgeList } from '../components/SkillBadgeList';
import { useUserSkills } from '../queries/career.queries';
import { isNotShared } from '../utils/career-errors';

/**
 * Huy hiệu của người khác (app.md p6-06 §3) — thẻ huy hiệu, chạm ⇒ minh chứng (tiêu đề task hiện theo quyền SERVER quyết). 404 là trạng thái
 * BÌNH THƯỜNG ("Không chia sẻ huy hiệu": không cùng nhóm / người đó tắt chia sẻ) ⇒ không toast lỗi. Lối vào từ thẻ thành viên (p1-02).
 */
export function UserSkillsScreen() {
  const { userId = '' } = useLocalSearchParams<{ userId: string }>();
  const skills = useUserSkills(userId);
  const header = <AppBar title="Huy hiệu kỹ năng" onBack={router.back} />;

  if (skills.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-xs">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!skills.data) {
    const hidden = isNotShared(skills.error);
    return (
      <Screen header={header}>
        <EmptyState
          actions={hidden ? undefined : [{ label: 'Thử lại', onPress: () => void skills.refetch() }]}
          description={hidden ? 'Người này không chia sẻ huy hiệu kỹ năng với bạn.' : 'Không tải được huy hiệu.'}
          icon={hidden ? 'lock' : 'alert-warning'}
          title={hidden ? 'Không chia sẻ huy hiệu' : 'Không tải được huy hiệu'}
          tone={hidden ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} refreshing={skills.isRefetching} onRefresh={() => void skills.refetch()}>
      {skills.data.length === 0 ? (
        <EmptyState
          description="Huy hiệu được cấp tự động từ task đã hoàn thành."
          icon="star"
          title="Người này chưa có huy hiệu"
          tone="accent"
        />
      ) : (
        <View className="py-xs">
          <SkillBadgeList badges={skills.data} userId={userId} />
        </View>
      )}
    </Screen>
  );
}
