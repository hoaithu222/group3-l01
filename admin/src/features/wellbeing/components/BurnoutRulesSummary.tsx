import { memo } from 'react';

import { SummaryCard } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import type { BurnoutRules } from '../types/wellbeing.types';

export interface BurnoutRulesSummaryProps {
  rules: BurnoutRules;
}

/** Ba thẻ tóm tắt bộ luật hiện hành: phiên bản (kèm lần sửa cuối / "mặc định"), cửa sổ chấm điểm, ngưỡng hai mức. */
const BurnoutRulesSummary = memo(function BurnoutRulesSummary({ rules }: BurnoutRulesSummaryProps) {
  const versionNote = rules.isDefault
    ? 'Đang dùng bộ luật mặc định'
    : rules.updatedAt
      ? `Cập nhật ${formatDate(rules.updatedAt, 'HH:mm DD/MM/YYYY')}`
      : undefined;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <SummaryCard
        animate={false}
        color="blue"
        description={versionNote}
        icon="shield-check-bold"
        label="Phiên bản bộ luật"
        value={`v${rules.version}`}
      />
      <SummaryCard
        animate={false}
        color="green"
        description="Mỗi luật chỉ nhìn trong phạm vi này"
        icon="calendar-clock-bold"
        label="Cửa sổ chấm điểm"
        value={`${rules.windowDays} ngày`}
      />
      <SummaryCard
        animate={false}
        color="yellow"
        description="Điểm 0–100: từ ngưỡng thứ nhất là Trung bình, từ ngưỡng thứ hai là Cao"
        icon="bullseye-bold"
        label="Ngưỡng mức Trung bình / Cao"
        value={`${rules.levels.medium} / ${rules.levels.high}`}
      />
    </div>
  );
});

export default BurnoutRulesSummary;
