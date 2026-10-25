import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

import type { MyGamificationDto } from '../../api/gamification.types';
import { useHomeGamificationWeek } from '../../hooks/useHomeGamification';
import { last7Days, markStreakRun } from '../../utils/xp-week';
import { HomeStatCard } from './HomeStatCard';
import { HomeStreakDays } from './HomeStreakDays';
import { HomeWidgetSkeleton } from './HomeWidgetSkeleton';

const TITLE = 'Chuỗi chăm chỉ';

/** Câu phụ dưới số ngày: kỷ lục khi đang có chuỗi, lời rủ bắt đầu khi chưa có. */
function subtitleOf({
  longestStreak,
  streak,
}: Pick<MyGamificationDto, 'longestStreak' | 'streak'>) {
  if (streak > 0) return longestStreak > 0 ? `Kỷ lục ${longestStreak} ngày` : null;
  return longestStreak > 0
    ? `Kỷ lục ${longestStreak} ngày. Hôm nay bắt đầu lại nhé`
    : 'Hoạt động hôm nay để bắt đầu chuỗi';
}

/**
 * Thẻ "Chuỗi chăm chỉ" ở Trang chủ (đăng ký ở `register-home-widgets.tsx`): số ngày liên tiếp + kỷ lục (khuôn
 * `HomeStatCard`), dải 7 ngày gần nhất có hoạt động hay chưa, và lời nhắc nhẹ khi `streakAtRisk`.
 *
 * Tự lo mọi trạng thái để Trang chủ chỉ việc đặt vào: cờ `gamification` tắt/chưa biết ⇒ `null` (và không gọi API); tải lần
 * đầu ⇒ khung xương; lỗi ⇒ `null` (không hiện lỗi ồn ào trên Trang chủ). Dải chấm cần sự kiện XP — đang tải thì hiện khung
 * xương RIÊNG cho dải (không vẽ dải thiếu rồi "nhảy"), tải lỗi thì vẫn vẽ dải theo chuỗi server báo (`markStreakRun`).
 *
 * ⚠️ Chưa có chuỗi thì nói thẳng "Chưa có chuỗi" chứ không hiện "0 ngày" như một thành tích; ô icon khi đó là tông `brand`
 * (không phải `neutral`): tông xám + bảy ô ngày xám làm cả thẻ trông như đang bị khoá, trong khi đây là lời RỦ bắt đầu.
 */
export function HomeStreakWidget() {
  const { enabled, me, week } = useHomeGamificationWeek();

  if (!enabled) return null;
  if (me.isLoading) return <HomeWidgetSkeleton title={TITLE} />;
  if (!me.data) return null;

  const profile = me.data;
  const days = markStreakRun(last7Days(week.data?.events ?? []), profile);
  const active = profile.streak > 0;
  const subtitle = subtitleOf(profile);
  const label = active ? `Chuỗi ${profile.streak} ngày liên tiếp` : 'Chưa có chuỗi';

  return (
    <Section title={TITLE}>
      <HomeStatCard
        accessibilityLabel={subtitle ? `${label}. ${subtitle}` : label}
        caption={subtitle}
        icon="flash"
        label="Chuỗi hiện tại"
        tone={active ? 'warning' : 'brand'}
        unit={active ? 'ngày liên tiếp' : undefined}
        value={active ? profile.streak : 'Chưa có chuỗi'}
      >
        {week.isLoading ? <Skeleton className="h-14 rounded-xs" /> : <HomeStreakDays days={days} />}
        {profile.streakAtRisk && active ? (
          // `warning` chỉ 4.06:1 trên nền sáng — màu cảnh báo ở BIỂU TƯỢNG (hình cần 3:1), chữ dùng `fg-1` (`AGENTS.md` shared/ui).
          <View className="flex-row items-center gap-xs rounded-xs bg-surface-warning p-xs">
            <Icon color="warning" name="alert-warning" size="sm" />
            <Text className="flex-1 text-caption-lg text-fg-1">
              Hôm nay chưa có hoạt động. Làm một việc để giữ chuỗi.
            </Text>
          </View>
        ) : null}
      </HomeStatCard>
    </Section>
  );
}
