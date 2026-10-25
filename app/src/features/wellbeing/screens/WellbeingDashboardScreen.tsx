import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import type { WellbeingDays } from '../api/wellbeing.types';
import { WellbeingDashboardBody } from '../components/WellbeingDashboardBody';
import { WellbeingLoadState } from '../components/WellbeingLoadState';
import { WELLBEING_DEFAULT_DAYS } from '../constants/wellbeing.constants';
import { useWellbeingHistory, useWellbeingSetting } from '../queries/wellbeing.queries';
import { isNotEnabled } from '../utils/wellbeing-errors';
import { WELLBEING_ONBOARDING_HREF, WELLBEING_SETTINGS_HREF } from '../utils/wellbeing-routes';

/**
 * "Sức khoẻ học tập" (app.md p7-03 §3 "Dashboard"): mức tải gần đây, hoạt động 7/30 ngày, điều nhận thấy, gợi ý — CỦA CHÍNH MÌNH, chỉ mình thấy.
 * Chưa bật (cài đặt `enabled: false`, hoặc lịch sử trả `WELL_001` vì vừa tắt ở máy khác) ⇒ `<Redirect>` sang màn giải thích/bật (`<Redirect>` chứ không `router.replace` trong effect:
 * effect chạy SAU lần vẽ đầu nên màn chớp lên một nhịp trước khi bị đẩy đi). Lịch sử chỉ tải khi đã biết là đang bật.
 * Kéo-để-làm-mới tải lại cả cài đặt lẫn lịch sử. Không có gì ghi xuống đĩa: mọi thứ nằm ở cache bộ nhớ, đóng app là hết.
 */
export function WellbeingDashboardScreen() {
  const setting = useWellbeingSetting();
  const [days, setDays] = useState<WellbeingDays>(WELLBEING_DEFAULT_DAYS);
  const history = useWellbeingHistory(days, setting.data?.enabled === true);

  const header = (
    <AppBar
      actions={
        <Button
          accessibilityLabel="Cài đặt theo dõi sức khoẻ"
          iconLeft="setting"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={() => router.push(WELLBEING_SETTINGS_HREF)}
        />
      }
      title="Sức khoẻ học tập"
      onBack={router.back}
    />
  );

  if (setting.data && !setting.data.enabled) return <Redirect href={WELLBEING_ONBOARDING_HREF} />;
  if (history.isError && isNotEnabled(history.error)) {
    return <Redirect href={WELLBEING_ONBOARDING_HREF} />;
  }
  if (!setting.data) {
    return (
      <WellbeingLoadState
        error={setting.error}
        header={header}
        isLoading={setting.isLoading || !setting.isError}
        onRetry={() => void setting.refetch()}
      />
    );
  }

  return (
    <Screen
      header={header}
      refreshing={setting.isRefetching || history.isRefetching}
      onRefresh={() => {
        void setting.refetch();
        void history.refetch();
      }}
    >
      <WellbeingDashboardBody
        days={days}
        history={history}
        setting={setting.data}
        onDaysChange={setDays}
      />
    </Screen>
  );
}
