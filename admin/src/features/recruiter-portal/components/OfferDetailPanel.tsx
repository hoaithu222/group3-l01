import { memo } from 'react';

import { DECLINE_REASON_LABEL, EMPLOYMENT_TYPE_LABEL, InfoRow, safeExternalUrl } from '@/features/recruiter';
import { Avatar } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import type { OfferDetail } from '../types/offer.types';
import OfferStatusBadge from './OfferStatusBadge';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';
const dash = <span className="text-fg-5">—</span>;

export interface OfferDetailPanelProps {
  offer: OfferDetail;
}

/**
 * Nội dung chi tiết lời mời (admin.md p6-08 §2.6): ứng viên, trạng thái (lý do từ chối dạng MÃ → chữ), thời điểm gửi/đọc/phản hồi/hết hạn, tiêu đề, nội dung (văn bản thuần, xuống dòng
 * theo nguyên văn), JD (liên kết ký 60 s — chỉ http/https, mở tab mới) và EMAIL ứng viên — CHỈ khi sinh viên đã chọn "Chia sẻ email" lúc Quan tâm (`sharedEmail`); mọi trường hợp khác
 * không có email ở bất cứ đâu. Ứng viên đã ẩn danh hoá hiện "Tài khoản đã xoá" (BE đặt sẵn tên).
 */
const OfferDetailPanel = memo(function OfferDetailPanel({ offer }: OfferDetailPanelProps) {
  const jd = safeExternalUrl(offer.jdUrl);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar
          name={offer.student.displayName}
          size="md"
          src={offer.student.avatarUrl ?? undefined}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-body-16-medium text-fg-1">{offer.student.displayName}</span>
          <OfferStatusBadge status={offer.status} />
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <InfoRow label="Người gửi">{offer.recruiter.name}</InfoRow>
        <InfoRow label="Loại việc">{EMPLOYMENT_TYPE_LABEL[offer.employmentType]}</InfoRow>
        <InfoRow label="Khu vực">{offer.location ?? dash}</InfoRow>
        <InfoRow label="Gửi lúc">
          <span className="tabular-nums">{formatDate(offer.sentAt, TIME_FORMAT)}</span>
        </InfoRow>
        <InfoRow label="Đã xem lúc">
          {offer.readAt ? <span className="tabular-nums">{formatDate(offer.readAt, TIME_FORMAT)}</span> : dash}
        </InfoRow>
        <InfoRow label="Phản hồi lúc">
          {offer.respondedAt ? (
            <span className="tabular-nums">{formatDate(offer.respondedAt, TIME_FORMAT)}</span>
          ) : (
            dash
          )}
        </InfoRow>
        <InfoRow label="Hết hạn">
          <span className="tabular-nums">{formatDate(offer.expiresAt, TIME_FORMAT)}</span>
        </InfoRow>
        {offer.declineReason ? (
          <InfoRow label="Lý do từ chối">{DECLINE_REASON_LABEL[offer.declineReason]}</InfoRow>
        ) : null}
        {offer.sharedEmail ? (
          <InfoRow label="Email ứng viên chia sẻ">
            <span className="break-all">{offer.sharedEmail}</span>
          </InfoRow>
        ) : null}
        {jd ? (
          <InfoRow label="Mô tả công việc (JD)">
            <a
              className="text-link hover:underline"
              href={jd}
              rel="noopener noreferrer"
              target="_blank"
            >
              Mở tệp JD
            </a>
          </InfoRow>
        ) : null}
      </dl>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-caption-12 text-fg-4">Tiêu đề</span>
        <span className="break-words text-body-14-semibold text-fg-1">{offer.title}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-caption-12 text-fg-4">Nội dung lời mời</span>
        <p className="whitespace-pre-wrap break-words text-body-14 text-fg-1">{offer.message}</p>
      </div>
    </div>
  );
});

export default OfferDetailPanel;
