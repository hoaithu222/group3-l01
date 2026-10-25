import type { UseQueryResult } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { Reveal } from '@/shared/ui/motion';

import type { WellbeingDays, WellbeingHistory, WellbeingSetting } from '../api/wellbeing.types';
import { useAlertActions } from '../hooks/useAlertActions';
import { WELLBEING_SETTINGS_HREF } from '../utils/wellbeing-routes';
import { ActivityChartSection } from './ActivityChartSection';
import { FactorList } from './FactorList';
import { RiskLevelCard } from './RiskLevelCard';
import { SuggestionList } from './SuggestionList';
import { WellbeingAlertCard } from './WellbeingAlertCard';

export interface WellbeingDashboardBodyProps {
  days: WellbeingDays;
  history: UseQueryResult<WellbeingHistory>;
  onDaysChange: (days: WellbeingDays) => void;
  setting: WellbeingSetting;
}

/**
 * Thân màn Sức khoẻ (app.md p7-03 §3 "Dashboard"), xếp theo mức ưu tiên từ trên xuống: cảnh báo đang chờ (nếu có) → mức tải → hoạt động 7/30 ngày → điều nhận thấy → gợi ý → nhắc quyền riêng tư.
 * Mức/nhân tố/gợi ý lấy từ `setting.latest` (đánh giá mới nhất trong vài ngày qua) chứ không từ lịch sử: lịch sử chỉ phục vụ biểu đồ nên đổi 7↔30 ngày không làm mức nhấp nháy.
 * Thẻ cảnh báo nằm TRONG màn (không nút ✕/"Xem chi tiết": đang ở chi tiết rồi) — thẻ nổi toàn cục tự ẩn ở nhánh này để không có hai thẻ cùng một lời nhắc. `useAlertActions` đặt Ở ĐÂY (luôn còn)
 * chứ không trong thẻ: thẻ bị gỡ ngay khi bấm nên hook trong thẻ sẽ mất toast lỗi.
 */
export function WellbeingDashboardBody({
  days,
  history,
  onDaysChange,
  setting,
}: WellbeingDashboardBodyProps) {
  const actions = useAlertActions(setting.pendingAlert?.id ?? null);
  const alert = setting.alertsEnabled ? setting.pendingAlert : null;
  const latest = setting.latest;

  // Khe 24 giữa các khối (`gap-xl`, `screen-layout.md`). `Reveal`: thẻ mức tải + biểu đồ hiện dần lệch nhịp khi mở màn (tự tắt
  // khi "Giảm chuyển động"). ⛔ Thẻ cảnh báo KHÔNG bọc: nó có nút bấm, chờ 260ms mới bấm được là chậm có chủ đích.
  return (
    <View className="gap-xl py-xs">
      {alert ? (
        <WellbeingAlertCard
          alert={alert}
          busy={actions.busy}
          onDismiss={actions.dismiss}
          onSnooze={actions.snooze}
        />
      ) : null}
      <Reveal>
        <RiskLevelCard assessment={latest} />
      </Reveal>
      <Reveal index={1}>
        <ActivityChartSection
          days={days}
          error={history.error}
          history={history.data}
          isLoading={history.isLoading}
          onDaysChange={onDaysChange}
          onRetry={() => void history.refetch()}
        />
      </Reveal>
      <FactorList factors={latest?.factors ?? []} />
      <SuggestionList primary={latest?.suggestion ?? null} />
      <View className="items-center gap-xs pb-md">
        <Text className="text-center text-body-md text-fg-2">
          Chỉ bạn thấy những số liệu này. Bạn có thể tắt hoặc xoá dữ liệu bất cứ lúc nào.
        </Text>
        <LinkButton
          label="Cài đặt và quyền riêng tư"
          onPress={() => router.push(WELLBEING_SETTINGS_HREF)}
        />
      </View>
    </View>
  );
}
