import { router } from 'expo-router';
import { Text } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { Section } from '@/shared/ui/section';

import { useHomeGamificationWeek } from '../../hooks/useHomeGamification';
import { formatXp } from '../../utils/level-math';
import { last7Days, weekXpTotal } from '../../utils/xp-week';
import { HomeStatCard } from './HomeStatCard';
import { HomeWidgetSkeleton } from './HomeWidgetSkeleton';
import { HomeXpBars } from './HomeXpBars';

const TITLE = 'Hoạt động 7 ngày';

/**
 * Thẻ "Hoạt động 7 ngày": tổng XP tuần (khuôn `HomeStatCard`, số đếm lên) + biểu đồ cột XP mỗi ngày (T2 … CN, hôm nay nổi
 * bật). Nguồn là `GET /me/xp-events` gom trong `useXpEventsWeek`. Ẩn khi cờ tắt, khi lỗi, và khi 7 ngày qua KHÔNG có hoạt
 * động nào (thẻ chuỗi đã rủ người dùng bắt đầu — biểu đồ toàn cột rỗng chỉ tốn chỗ, và "0 XP" ở đây là "chưa có gì").
 *
 * ⚠️ `truncated` (người ôn hàng trăm thẻ/ngày vượt ngân sách trang): tổng chỉ là CẬN DƯỚI nên ghi "Hơn …" thay vì hiện
 * một con số tròn mà thiếu.
 * ⚠️ Thẻ KHÔNG bấm cả khối: mỗi cột biểu đồ là một ô trợ năng riêng ("T3, 22/09: 120 XP") — gộp vào một nút là mất chúng.
 * Lối sang lịch sử là "Lịch sử" ở đầu nhóm.
 */
export function HomeActivityWidget() {
  const { enabled, week } = useHomeGamificationWeek();

  if (!enabled) return null;
  if (week.isLoading) return <HomeWidgetSkeleton title={TITLE} />;
  if (!week.data) return null;

  const days = last7Days(week.data.events);
  if (!days.some((day) => day.active)) return null;

  const total = weekXpTotal(days);
  const today = days[days.length - 1];
  const todayXp = today && today.xp > 0 ? `+${formatXp(today.xp)}` : null;
  const prefix = week.data.truncated ? 'Hơn ' : '';

  return (
    <Section
      action={
        <LinkButton
          accessibilityLabel="Xem lịch sử điểm kinh nghiệm"
          label="Lịch sử"
          onPress={() => router.push('/me/xp-history')}
        />
      }
      title={TITLE}
    >
      <HomeStatCard
        accessibilityLabel={`Tổng 7 ngày qua: ${prefix}${formatXp(total)}${
          todayXp ? `, hôm nay ${todayXp}` : ''
        }`}
        caption={
          todayXp ? (
            <>
              {'Hôm nay '}
              <Text className="font-semibold text-fg-brand">{todayXp}</Text>
            </>
          ) : (
            'Hôm nay chưa có XP'
          )
        }
        format={(value) => `${prefix}${formatXp(Math.round(value))}`}
        icon="chart-1"
        label="Tổng 7 ngày qua"
        tone="brand"
        value={total}
      >
        <HomeXpBars days={days} />
      </HomeStatCard>
    </Section>
  );
}
