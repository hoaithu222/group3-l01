import { memo } from 'react';

import { OFFER_STATUS_META } from '@/features/recruiter';
import type { OfferStatus } from '@/features/recruiter';
import { Badge } from '@/shared/ui';

export interface OfferStatusBadgeProps {
  status: OfferStatus;
}

/** Trạng thái lời mời BẰNG CHỮ + màu (Đã gửi / Đã xem / Quan tâm / Từ chối / Đã thu hồi / Hết hạn) — không chỉ dựa vào màu. */
const OfferStatusBadge = memo(function OfferStatusBadge({ status }: OfferStatusBadgeProps) {
  const meta = OFFER_STATUS_META[status];
  return (
    <Badge color={meta.color} size="sm" variant="tinted">
      {meta.label}
    </Badge>
  );
});

export default OfferStatusBadge;
