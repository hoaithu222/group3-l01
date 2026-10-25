import { Badge } from '@/shared/ui/badge';

import type { OfferStatus } from '../../api/recruiter.types';
import { OFFER_STATUS_LABEL } from '../../constants/recruiter.constants';
import { OFFER_STATUS_VARIANT } from '../../utils/offer-format';

/** Trạng thái lời mời: Mới · Đã xem · Quan tâm · Đã từ chối · Đã thu hồi · Hết hạn. Luôn có CHỮ — màu chỉ để quét nhanh (app.md §7). */
export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return (
    <Badge label={OFFER_STATUS_LABEL[status]} size="sm" variant={OFFER_STATUS_VARIANT[status]} />
  );
}
