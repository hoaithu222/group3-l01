import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { isNetworkError } from '@/shared/utils/errors';
import { hapticSelection } from '@/shared/utils/haptics';

import type { WellbeingDays, WellbeingHistory } from '../api/wellbeing.types';
import { WELLBEING_DAY_OPTIONS } from '../constants/wellbeing.constants';
import { buildSeries, daysWithData } from '../utils/wellbeing-series';
import { ActivityBars } from './ActivityBars';
import { ActivityTable } from './ActivityTable';

export interface ActivityChartSectionProps {
  days: WellbeingDays;
  error: unknown;
  history: WellbeingHistory | undefined;
  isLoading: boolean;
  /** Giờ hiện tại — tiêm được để test cố định ngày. */
  now?: Date;
  onDaysChange: (days: WellbeingDays) => void;
  onRetry: () => void;
}

const TAB_ITEMS = WELLBEING_DAY_OPTIONS.map((option) => ({
  key: String(option),
  label: `${String(option)} ngày`,
}));

/**
 * Khối "Hoạt động của bạn": chuyển 7/30 ngày + biểu đồ cột, có nút "Xem dạng bảng" (bảng thay thế cho biểu đồ, app.md p7-03 §2). Ba trạng thái theo kế hoạch §3: tải ⇒ khung xương;
 * lỗi ⇒ khối lỗi + Thử lại (mạng ⇒ "ngoại tuyến"); chưa có ngày nào có số liệu ⇒ lời giải thích thay vì biểu đồ trống.
 * Tab pill CHƯA chọn có nền đặc (`bg-bg-1` của `Tabs`) — không tự dựng tab ở đây.
 */
export function ActivityChartSection({
  days,
  error,
  history,
  isLoading,
  now,
  onDaysChange,
  onRetry,
}: ActivityChartSectionProps) {
  const [asTable, setAsTable] = useState(false);
  const slots = history ? buildSeries(history.dailies, days, now ?? new Date()) : [];
  const hasData = daysWithData(slots) > 0;

  let body: ReactNode;
  if (isLoading) {
    body = <Skeleton className="h-40 rounded-md" />;
  } else if (!history) {
    body = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: onRetry }}
        fullscreen={false}
        state={isNetworkError(error) ? 'offline' : 'error'}
        title="Không tải được số liệu"
      />
    );
  } else if (!hasData) {
    body = (
      <ScreenState
        description="Số liệu của mỗi ngày sẽ có vào sáng hôm sau. Cứ dùng ứng dụng như bình thường nhé."
        fullscreen={false}
        icon="clock"
        state="empty"
        title="Chưa có số liệu trong khoảng này"
      />
    );
  } else {
    body = (
      <View className="gap-md">
        {asTable ? <ActivityTable slots={slots} /> : <ActivityBars slots={slots} />}
        <Button
          fullWidth
          iconLeft={asTable ? 'chart-1' : 'document'}
          label={asTable ? 'Xem dạng biểu đồ' : 'Xem dạng bảng'}
          size="sm"
          variant="tertiary"
          onPress={() => setAsTable((current) => !current)}
        />
      </View>
    );
  }

  return (
    <Section icon="chart-1" title="Hoạt động của bạn">
      <View className="gap-sm">
        <Tabs
          items={TAB_ITEMS}
          value={String(days)}
          onChange={(key) => {
            hapticSelection();
            onDaysChange(key === '30' ? 30 : 7);
          }}
        />
        <Card>{body}</Card>
      </View>
    </Section>
  );
}
