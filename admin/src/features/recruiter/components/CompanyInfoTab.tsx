import { memo } from 'react';

import { Avatar, Badge, Callout } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import {
  COMPANY_SIZE_LABEL,
  COMPANY_TIER_LABEL,
} from '../constants/recruiter.constants';
import type { AdminCompanyDetail } from '../types/recruiter.types';
import { ownerEmailMismatchesWebsite } from '../utils/email-domain';
import { safeExternalUrl } from '../utils/external-url';
import CompanyStatusBadge from './CompanyStatusBadge';
import InfoRow from './InfoRow';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';
const dash = <span className="text-fg-5">—</span>;

export interface CompanyInfoTabProps {
  detail: AdminCompanyDetail;
}

/**
 * Tab "Thông tin" (admin.md p6-08 §2.1): hồ sơ, gói + hạn mức, lý do của lần duyệt/từ chối/tạm ngưng gần nhất, và CẢNH BÁO khi email chủ sở hữu khác tên miền
 * website (tín hiệu duyệt). Không có gì về ứng viên/lời mời cụ thể — vận hành chỉ thấy hồ sơ doanh nghiệp. Website chỉ là liên kết khi là http(s).
 */
const CompanyInfoTab = memo(function CompanyInfoTab({ detail }: CompanyInfoTabProps) {
  const { company } = detail;
  const website = safeExternalUrl(company.website);
  const mismatch = ownerEmailMismatchesWebsite(detail.members, detail.emailDomain);

  return (
    <div className="flex flex-col gap-3">
      {mismatch ? (
        <Callout
          description={`Email của chủ sở hữu không cùng tên miền với website (${detail.emailDomain}). Cân nhắc xác minh thêm trước khi duyệt.`}
          intent="warning"
          title="Tên miền email khác website"
        />
      ) : null}
      {company.statusReason ? (
        <Callout
          description={company.statusReason}
          intent="neutral"
          title="Lý do của lần xử lý gần nhất"
        />
      ) : null}
      <div className="flex items-center gap-3">
        <Avatar name={company.name} shape="square" size="lg" src={company.logoUrl ?? undefined} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-body-16-medium text-fg-1">{company.name}</span>
          <CompanyStatusBadge status={company.status} />
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <InfoRow label="Website">
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
            dash
          )}
        </InfoRow>
        <InfoRow label="Mã số thuế">
          {company.taxCode ? <span className="font-mono">{company.taxCode}</span> : dash}
        </InfoRow>
        <InfoRow label="Ngành">{company.industry ?? dash}</InfoRow>
        <InfoRow label="Quy mô">
          {company.sizeRange ? COMPANY_SIZE_LABEL[company.sizeRange] : dash}
        </InfoRow>
        <InfoRow label="Gói">
          <Badge color="neutral" size="sm" variant="tinted">
            {COMPANY_TIER_LABEL[company.tier]}
          </Badge>
          <span className="tabular-nums text-fg-3">
            hạn mức {formatNumber(detail.quota)} lời mời/tháng
          </span>
        </InfoRow>
        <InfoRow label="Báo cáo đang mở">
          <span className="tabular-nums">{formatNumber(detail.reportedCount)}</span>
        </InfoRow>
        <InfoRow label="Ngày đăng ký">
          <span className="tabular-nums">{formatDate(company.createdAt, TIME_FORMAT)}</span>
        </InfoRow>
        <InfoRow label="Cập nhật lần cuối">
          <span className="tabular-nums">{formatDate(company.updatedAt, TIME_FORMAT)}</span>
        </InfoRow>
      </dl>
      <InfoRow label="Mô tả">
        <span className="whitespace-pre-wrap break-words">{company.description ?? '—'}</span>
      </InfoRow>
    </div>
  );
});

export default CompanyInfoTab;
