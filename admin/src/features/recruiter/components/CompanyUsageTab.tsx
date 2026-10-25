import { memo } from 'react';

import { Progress, Text } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { OFFER_STATUS_META, OFFER_STATUSES } from '../constants/recruiter.constants';
import type { AdminCompanyDetail } from '../types/recruiter.types';

export interface CompanyUsageTabProps {
  detail: Pick<AdminCompanyDetail, 'usage' | 'quota' | 'offersByStatus'>;
}

/** `2026-09` → `09/2026` (kỳ theo Asia/Ho_Chi_Minh, BE đã tính). */
const periodLabel = (period: string): string => {
  const [year, month] = period.split('-');
  return month && year ? `${month}/${year}` : period;
};

/**
 * Tab "Sử dụng" (admin.md p6-08 §2.1): lời mời ĐÃ DÙNG theo tháng (6 kỳ gần nhất, so với hạn mức hiện hành) và số lời mời theo trạng thái. CHỈ số đếm —
 * BE cố ý không trả danh sách người nhận hay nội dung lời mời, nên tab này cũng không có chỗ nào để hiện chúng (riêng tư ứng viên).
 * Hạn mức đã đổi theo thời gian thì thanh của tháng cũ so với hạn mức HIỆN TẠI, chỉ mang tính tham khảo.
 */
const CompanyUsageTab = memo(function CompanyUsageTab({ detail }: CompanyUsageTabProps) {
  const { usage, quota, offersByStatus } = detail;

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Lời mời đã dùng theo tháng" className="flex flex-col gap-2">
        <Text size="small" weight="medium">
          Lời mời đã dùng theo tháng (hạn mức {formatNumber(quota)})
        </Text>
        <ul className="flex flex-col gap-2">
          {usage.map((u) => (
            <li key={u.period} className="flex items-center gap-3">
              <span className="w-16 shrink-0 tabular-nums text-body-14 text-fg-2">
                {periodLabel(u.period)}
              </span>
              <Progress
                className="flex-1"
                max={Math.max(quota, 1)}
                size="sm"
                value={u.used}
                variant={quota > 0 && u.used >= quota ? 'warning' : 'primary'}
              />
              <span className="w-20 shrink-0 text-right tabular-nums text-body-14 text-fg-1">
                {formatNumber(u.used)} / {formatNumber(quota)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Lời mời theo trạng thái" className="flex flex-col gap-2">
        <Text size="small" weight="medium">
          Lời mời theo trạng thái (mọi thời điểm)
        </Text>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {OFFER_STATUSES.map((status) => (
            <div key={status} className="flex flex-col gap-0.5">
              <dt className="text-caption-12 text-fg-4">{OFFER_STATUS_META[status].label}</dt>
              <dd className="tabular-nums text-body-16-medium text-fg-1">
                {formatNumber(offersByStatus[status] ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
});

export default CompanyUsageTab;
