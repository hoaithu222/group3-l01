import { memo } from 'react';

import { SummaryCard } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import { NO_DATA } from '../constants/wellbeing.constants';
import type { WellbeingOverview } from '../types/wellbeing.types';
import { formatAlertCount, formatApprox } from '../utils/overview.utils';

export interface WellbeingKpisProps {
  /** `undefined` (đang tải / lỗi) → thẻ hiện `—`, không bao giờ `0`. */
  data: WellbeingOverview | undefined;
}

const NOT_ENOUGH = 'Chưa đủ mẫu';

/**
 * Hai thẻ số liệu ẨN DANH (admin.md p7-03 §2.1): số người đang bật theo dõi (BE làm tròn tới chục → hiện "≈") và số cảnh báo tuần này (ô ít cảnh báo bị che → "—").
 * Chưa đủ mẫu (`insufficient`) → thẻ nói "Chưa đủ mẫu" kèm ngưỡng tối thiểu thay vì số. Kế hoạch còn ghi "tỉ lệ bật / người hoạt động 30 ngày" nhưng BE chưa trả số đó.
 */
const WellbeingKpis = memo(function WellbeingKpis({ data }: WellbeingKpisProps) {
  const shortage = data?.insufficient ? data : undefined;
  const live = data && !data.insufficient ? data : undefined;
  const shortNote = shortage ? `Cần ít nhất ${shortage.minimum} người bật theo dõi` : undefined;
  const thisWeek = live?.alertsPerWeek.at(-1);

  let alertsNote = shortNote;
  if (thisWeek) {
    alertsNote =
      thisWeek.alerts === null
        ? 'Ít cảnh báo — ẩn để không nhận ra cá nhân'
        : `Tuần bắt đầu ${formatDate(thisWeek.weekStart)}`;
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <SummaryCard
        animate={false}
        color="blue"
        description={
          shortNote ?? (live ? 'Làm tròn tới chục — không phải số chính xác' : undefined)
        }
        icon="users-bold"
        label="Người đang bật theo dõi"
        value={shortage ? NOT_ENOUGH : live ? formatApprox(live.optInApprox) : NO_DATA}
      />
      <SummaryCard
        animate={false}
        color="yellow"
        description={alertsNote}
        icon="bell-bold"
        label="Cảnh báo tuần này"
        value={shortage ? NOT_ENOUGH : thisWeek ? formatAlertCount(thisWeek.alerts) : NO_DATA}
      />
    </div>
  );
});

export default WellbeingKpis;
