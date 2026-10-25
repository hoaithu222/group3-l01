import { memo } from 'react';

import { COMPANY_TIER_LABEL } from '@/features/recruiter';
import { Badge, Progress, Text } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { useCompanyUsage } from '../service/company.queries';

export interface CompanyUsageCardProps {
  companyId: string;
}

/** Ngày làm mới hạn mức: đầu THÁNG SAU của kỳ hiện tại (`2026-09` → `01/10/2026`; kỳ theo Asia/Ho_Chi_Minh). */
function refreshDate(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return '—';
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `01/${String(nextMonth).padStart(2, '0')}/${nextYear}`;
}

/**
 * Khối "Gói & hạn mức" (admin.md p6-08 §2.7): gói hiện tại, đã dùng/hạn mức tháng, ngày làm mới. Thanh toán/nâng gói NGOÀI phạm vi P0 nên chỉ có dòng "Nâng gói: liên hệ".
 * Thu hồi hay hết hạn lời mời KHÔNG hoàn lại lượt — nói rõ để HR không hiểu nhầm. Chưa có số → "—", không bao giờ "0".
 */
const CompanyUsageCard = memo(function CompanyUsageCard({ companyId }: CompanyUsageCardProps) {
  const { data: usage } = useCompanyUsage(companyId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-body-14-medium text-fg-1">Gói &amp; hạn mức</span>
        {usage ? (
          <Badge color="neutral" size="sm" variant="tinted">
            {COMPANY_TIER_LABEL[usage.tier]}
          </Badge>
        ) : null}
      </div>
      {usage ? (
        <>
          <Progress max={Math.max(usage.quota, 1)} size="sm" value={usage.used} variant={usage.remaining === 0 ? 'warning' : 'primary'} />
          <Text size="small">
            Đã dùng {formatNumber(usage.used)}/{formatNumber(usage.quota)} lời mời tháng {usage.period.split('-').reverse().join('/')} — còn {formatNumber(usage.remaining)} lượt. Làm mới ngày {refreshDate(usage.period)}.
          </Text>
        </>
      ) : (
        <Text size="small" skin="muted">
          —
        </Text>
      )}
      <Text size="tiny" skin="muted">
        Nâng gói: liên hệ đội hỗ trợ. Lời mời đã thu hồi hoặc hết hạn không được hoàn lại lượt.
      </Text>
    </div>
  );
});

export default CompanyUsageCard;
