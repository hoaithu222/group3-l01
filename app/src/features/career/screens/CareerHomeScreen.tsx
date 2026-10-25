import { router } from 'expo-router';
import { View } from 'react-native';

import { SkillBadgeRow } from '@/shared/career';
import { ModuleBanner } from '@/shared/ui/banner';
import { EmptyState } from '@/shared/ui/empty-state';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { useAuthStore } from '@/shell/store/slices/auth';

import { CareerVisibilityCard } from '../components/CareerVisibilityCard';
import { CAREER_ICON, CAREER_TONE } from '../constants/career-visuals.constants';
import { JobEntryCards } from '../components/jobs/JobEntryCards';
import { PortfolioEntryCard } from '../components/portfolio/PortfolioEntryCard';
import { SkillBadgeList } from '../components/SkillBadgeList';
import { SkillTrackerWidget } from '../components/SkillTrackerWidget';
import { useMySkills, useSkills } from '../queries/career.queries';
import { SKILLS_HREF } from '../utils/career-routes';

/**
 * Nghề nghiệp (app.md p6-06 §3): huy hiệu đã có (`SkillBadgeRow` + thẻ, chạm ⇒ minh chứng), tracker 3 kỹ năng gần đạt nhất, quyền riêng tư.
 * p6-07 (Portfolio) và p6-08 (Open to work + Lời mời) thêm lối vào vào màn này. Offline: đọc cache của React Query.
 * ⛔ KHÔNG gắn `SkillUnlockedHost` ở đây: nó đã mount MỘT lần toàn cục ở `app/(app)/_layout.tsx` (tấm chúc mừng hiện ở mọi màn). Hai bản cùng
 * nghe `skill:unlocked` thì bản nào nhận sự kiện trước sẽ "ăn" cờ đã-xem (`markUnlockSeen`) — tấm hiện hay không tuỳ thứ tự vẽ.
 */
export function CareerHomeScreen() {
  const userId = useAuthStore((state) => state.user?.id) ?? '';
  const skills = useSkills();
  const mine = useMySkills();
  const header = <AppBar title="Nghề nghiệp" onBack={router.back} />;
  const refresh = () => {
    void skills.refetch();
    void mine.refetch();
  };

  if (skills.isLoading || mine.isLoading) {
    // Cùng hình dạng màn thật: dải đầu phân hệ (≥ 96dp) · khối huy hiệu · thẻ lối vào.
    return (
      <Screen header={header}>
        <View className="gap-xl py-xs">
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-40 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!skills.data || !mine.data) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: refresh }]}
          description="Không tải được huy hiệu kỹ năng của bạn. Kiểm tra kết nối rồi thử lại."
          icon="alert-warning"
          title="Không tải được hồ sơ nghề nghiệp"
          tone="danger"
        />
      </Screen>
    );
  }

  const badges = mine.data;
  return (
    <Screen header={header} refreshing={skills.isRefetching || mine.isRefetching} onRefresh={refresh}>
      {/* Khe 24 giữa các khối (screen-layout). `Reveal` chỉ bọc hai khối ĐẦU luôn có mặt — ⛔ không bọc các thẻ lối vào bên dưới:
          chúng tự trả `null` khi cờ tắt, bọc vào là còn một khối rỗng chiếm thêm một khe. */}
      <View className="gap-xl py-xs">
        <Reveal>
          <ModuleBanner
            description={
              badges.length > 0
                ? `Bạn có ${String(badges.length)} huy hiệu kỹ năng xác thực — dùng chúng cho portfolio và lời mời việc làm.`
                : 'Huy hiệu, portfolio và lời mời việc làm đều dựng từ task bạn đã làm trong nhóm.'
            }
            icon={CAREER_ICON}
            title="Hồ sơ nghề nghiệp của bạn"
            tone={CAREER_TONE}
          />
        </Reveal>
        <Reveal index={1}>
          <Section icon="star" title="Huy hiệu kỹ năng xác thực">
            {badges.length === 0 ? (
              <EmptyState
                actions={[{ label: 'Xem danh mục kỹ năng', onPress: () => router.push(SKILLS_HREF) }]}
                description="Hoàn thành task có gắn nhãn kỹ năng để nhận huy hiệu đầu tiên."
                icon="star"
                size="compact"
                title="Chưa có huy hiệu"
                tone="accent"
              />
            ) : (
              <View className="gap-sm">
                <SkillBadgeRow badges={badges} />
                <SkillBadgeList badges={badges} userId={userId} />
              </View>
            )}
          </Section>
        </Reveal>
        <SkillTrackerWidget skills={skills.data} />
        <PortfolioEntryCard />
        <JobEntryCards />
        <CareerVisibilityCard />
      </View>
    </Screen>
  );
}
