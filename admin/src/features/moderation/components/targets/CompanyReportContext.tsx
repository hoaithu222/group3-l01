import { memo } from 'react';
import { Link } from 'react-router-dom';

import {
  COMPANY_TIER_LABEL,
  CompanyStatusBadge,
  safeExternalUrl,
} from '@/features/recruiter';
import type { AdminCompanyDetail } from '@/features/recruiter';
import { Badge, BoxPanel, Callout } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import ReportInfoRow from '../ReportInfoRow';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

export interface CompanyReportContextProps {
  detail: AdminCompanyDetail;
}

/**
 * Khối "Doanh nghiệp bị báo cáo" (p6-08, admin.md §2.3): tên (liên kết sang ngăn kéo vận hành), website (chỉ http/https), MST, trạng thái BẰNG CHỮ, gói + hạn mức,
 * số thành viên và lần xử lý gần nhất. CHỈ hồ sơ doanh nghiệp — dù BE trả kèm danh sách nhân sự (email) cho ngăn kéo vận hành, khối này KHÔNG hiện email/tên ai:
 * người kiểm duyệt cần biết doanh nghiệp nào, không cần biết ai làm ở đó. Muốn xem thêm thì mở ngăn kéo doanh nghiệp (có kiểm quyền `user:view`).
 */
const CompanyReportContext = memo(function CompanyReportContext({
  detail,
}: CompanyReportContextProps) {
  const { company } = detail;
  const website = safeExternalUrl(company.website);

  return (
    <BoxPanel border="hairline" title="Doanh nghiệp bị báo cáo">
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReportInfoRow label="Tên doanh nghiệp">
          <Link
            className="text-body-14-semibold text-link hover:underline"
            to={`/recruiter?tab=companies&status=all&companyId=${encodeURIComponent(company.id)}`}
          >
            {company.name}
          </Link>
        </ReportInfoRow>
        <ReportInfoRow label="Trạng thái">
          <CompanyStatusBadge status={company.status} />
        </ReportInfoRow>
        <ReportInfoRow label="Gói">
          <Badge color="neutral" size="sm" variant="tinted">
            {COMPANY_TIER_LABEL[company.tier]}
          </Badge>
          <span className="tabular-nums text-fg-3">{formatNumber(detail.quota)} lời mời/tháng</span>
        </ReportInfoRow>
        <ReportInfoRow label="Website">
          {website ? (
            <a
              className="min-w-0 truncate text-link hover:underline"
              href={website}
              rel="noopener noreferrer"
              target="_blank"
            >
              {company.website}
            </a>
          ) : (
            <span className="text-fg-5">—</span>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Mã số thuế">
          {company.taxCode ? (
            <span className="font-mono">{company.taxCode}</span>
          ) : (
            <span className="text-fg-5">—</span>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Thành viên">
          <span className="tabular-nums">{formatNumber(detail.members.length)}</span>
        </ReportInfoRow>
      </div>
      {company.statusReason && company.status !== 'APPROVED' ? (
        <div className="border-t border-divider-1 p-3">
          <Callout
            description={`Lý do: ${company.statusReason}`}
            intent="warning"
            title={`Lần xử lý gần nhất (${formatDate(company.updatedAt, TIME_FORMAT)})`}
          />
        </div>
      ) : null}
    </BoxPanel>
  );
});

export default CompanyReportContext;
