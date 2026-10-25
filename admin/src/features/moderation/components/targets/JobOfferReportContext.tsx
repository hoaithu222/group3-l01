import { memo } from 'react';

import { EMPLOYMENT_TYPE_LABEL, OFFER_STATUS_META } from '@/features/recruiter';
import { Badge, BoxPanel, Callout } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import type { ReportedOffer } from '../../types/recruiter-moderation.types';
import ReportInfoRow from '../ReportInfoRow';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

export interface JobOfferReportContextProps {
  offer: ReportedOffer;
  /** Thời điểm xem lần này (BE đã ghi nhật ký) — chỉ để nói cho người xem biết. */
  viewedNote?: boolean;
}

/**
 * Khối "Lời mời bị báo cáo" (p6-08, admin.md §2.3): tiêu đề, NỘI DUNG lời mời, loại việc, khu vực, doanh nghiệp gửi, trạng thái (bằng CHỮ) và ngày gửi.
 * KHÔNG có thread trao đổi và KHÔNG có tên/email người nhận — BE không trả (D-06: người báo cáo là người nhận, vận hành chỉ xem đúng lời mời bị báo cáo).
 * Nội dung dài xuống dòng theo nguyên văn (`whitespace-pre-wrap`); render dạng CHỮ thuần — không dựng HTML từ dữ liệu người dùng.
 */
const JobOfferReportContext = memo(function JobOfferReportContext({
  offer,
  viewedNote = true,
}: JobOfferReportContextProps) {
  const status = OFFER_STATUS_META[offer.status];
  return (
    <BoxPanel border="hairline" title="Lời mời bị báo cáo">
      <div className="flex flex-col gap-3 p-3">
        {viewedNote ? (
          <Callout
            description="Lần xem này đã được ghi vào nhật ký quản trị. Chỉ hiện nội dung lời mời bị báo cáo, không có trao đổi hay thông tin người nhận."
            icon="eye-bold"
            intent="info"
            variant="ghost"
          />
        ) : null}
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          <ReportInfoRow label="Doanh nghiệp gửi">
            <span className="text-body-14-semibold">{offer.company.name || '—'}</span>
          </ReportInfoRow>
          <ReportInfoRow label="Trạng thái lời mời">
            <Badge color={status.color} size="sm" variant="tinted">
              {status.label}
            </Badge>
          </ReportInfoRow>
          <ReportInfoRow label="Ngày gửi">
            <span className="tabular-nums">{formatDate(offer.sentAt, TIME_FORMAT)}</span>
          </ReportInfoRow>
          <ReportInfoRow label="Loại việc">
            <span>{EMPLOYMENT_TYPE_LABEL[offer.employmentType]}</span>
          </ReportInfoRow>
          <ReportInfoRow label="Khu vực">
            <span className={offer.location ? undefined : 'text-fg-5'}>{offer.location ?? '—'}</span>
          </ReportInfoRow>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-caption-12 text-fg-4">Tiêu đề</span>
          <span className="break-words text-body-14-semibold text-fg-1">{offer.title}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-caption-12 text-fg-4">Nội dung</span>
          <p className="whitespace-pre-wrap break-words text-body-14 text-fg-1">{offer.message}</p>
        </div>
      </div>
    </BoxPanel>
  );
});

export default JobOfferReportContext;
