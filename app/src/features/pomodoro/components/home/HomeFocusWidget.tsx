import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/activity-widgets';
import { LinkButton } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { AnimatedNumber } from '@/shared/ui/motion';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { useFeature } from '@/shell/capabilities';

import { formatSpan } from '../../utils/clock';
import { HomeFocusBars } from './HomeFocusBars';
import { useWeeklyFocus } from './useWeeklyFocus';
import { weekFocus } from './week-focus';

const TITLE = 'Giờ tập trung';

/** Số giây trung gian của bộ đếm làm tròn trước khi định dạng. */
const spanText = (seconds: number) => formatSpan(Math.round(seconds));

/**
 * Thẻ "Giờ tập trung" tuần này ở Trang chủ (đăng ký ở `register-home-widgets.tsx`): tổng thời gian có mặt trong các phòng
 * Pomodoro, số vòng, số phiên, và mini-thanh 7 ngày.
 *
 * Tự lo mọi trạng thái: cờ `pomodoro` tắt/chưa biết ⇒ `null` (không gọi API); tải lần đầu ⇒ khung xương; lỗi ⇒ `null`;
 * tuần này CHƯA CÓ phiên nào ⇒ `null` ("0 giờ" không phải thứ để khoe, và Trang chủ không nên đầy thẻ rỗng). Trở lại
 * Trang chủ thì làm mới nếu số đã cũ (`useRefetchOnFocus`).
 *
 * ✅ Cùng khuôn thẻ thống kê Trang chủ (nhãn + `IconTile sm` góc phải, số `header-md` đậm đếm lên, một chú thích, `min-h-32`
 * `p-md` — bản gốc ở `gamification/components/home/HomeStatCard.tsx`, ⛔ không import chéo feature).
 * ⚠️ Thẻ KHÔNG bấm cả khối: mỗi cột 7 ngày là một ô trợ năng riêng — lối sang lịch sử là "Lịch sử" ở đầu nhóm.
 */
export function HomeFocusWidget() {
  const enabled = useFeature('pomodoro') === true;
  const history = useWeeklyFocus(enabled);
  useRefetchOnFocus(history, enabled);

  if (!enabled) return null;
  if (history.isLoading) {
    return (
      <Section title={TITLE}>
        <Skeleton variant="card" />
      </Section>
    );
  }
  if (!history.data) return null;

  const week = weekFocus(history.data);
  if (week.sessions === 0) return null;

  const summary = `${week.cycles} vòng tập trung · ${week.sessions} phiên`;

  return (
    <Section
      action={
        <LinkButton
          accessibilityLabel="Xem lịch sử học Pomodoro"
          label="Lịch sử"
          onPress={() => router.push('/me/pomodoro-history')}
        />
      }
      title={TITLE}
    >
      <Card className="min-h-32 gap-md">
        <View
          accessibilityLabel={`Tuần này bạn tập trung ${formatSpan(week.totalSeconds)}, ${summary}`}
          accessible
          className="gap-2xs"
        >
          <View className="flex-row items-center gap-sm">
            <Text className="flex-1 text-label-md text-fg-2">Tuần này</Text>
            <IconTile name="timer" size="sm" tone="brand" />
          </View>
          <AnimatedNumber
            className="text-header-md font-bold text-fg-1"
            format={spanText}
            value={week.totalSeconds}
          />
          <Text className="text-caption-lg text-fg-2">{summary}</Text>
        </View>
        <HomeFocusBars days={week.days} />
      </Card>
    </Section>
  );
}
