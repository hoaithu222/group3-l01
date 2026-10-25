import type { BadgeProps } from '@/shared/ui/badge';

import type { OfferItem, OfferStatus } from '../api/recruiter.types';

/** Nhóm lọc ở hộp thư (app.md §3): Tất cả · Mới (chờ trả lời) · Quan tâm · Đã đóng. BE chỉ lọc được MỘT `status` nên nhóm được lọc phía app. */
export type OfferGroup = 'all' | 'closed' | 'interested' | 'new';

export const OFFER_GROUPS: readonly { key: OfferGroup; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'new', label: 'Mới' },
  { key: 'interested', label: 'Quan tâm' },
  { key: 'closed', label: 'Đã đóng' },
];

/** Lời mời còn "mở" — cùng nghĩa `OPEN_OFFER_STATUSES` của BE (giữ `activeKey` một cặp công ty/sinh viên). */
const isOpenOffer = (status: OfferStatus): boolean =>
  status === 'SENT' || status === 'READ' || status === 'INTERESTED';

/** Còn chờ bạn trả lời: chưa mở hoặc mới xem chứ chưa bấm Quan tâm/Từ chối. */
export const isAwaitingReply = (status: OfferStatus): boolean =>
  status === 'SENT' || status === 'READ';

/** Chi tiết có thanh hành động ở đáy không: đang chờ trả lời, hoặc đã Quan tâm và thread còn mở (nút "Trao đổi"). */
export const hasOfferActions = (offer: { status: OfferStatus; threadOpen: boolean }): boolean =>
  isAwaitingReply(offer.status) || (offer.status === 'INTERESTED' && offer.threadOpen);

export function matchesGroup(status: OfferStatus, group: OfferGroup): boolean {
  if (group === 'all') return true;
  if (group === 'new') return isAwaitingReply(status);
  if (group === 'interested') return status === 'INTERESTED';
  return !isOpenOffer(status);
}

/** Cần chú ý: chưa mở lần nào, hoặc có tin trao đổi chưa đọc — số này hiện trên thẻ "Lời mời" ở màn Nghề nghiệp. */
export const needsAttention = (offer: Pick<OfferItem, 'status' | 'unreadMessages'>): boolean =>
  offer.status === 'SENT' || offer.unreadMessages > 0;

/** Tông huy hiệu — chỉ để quét nhanh, NGHĨA nằm ở chữ (`OFFER_STATUS_LABEL`); "Quan tâm" xanh, "Mới" nổi, phần còn lại trung tính/cảnh báo. */
export const OFFER_STATUS_VARIANT: Record<OfferStatus, NonNullable<BadgeProps['variant']>> = {
  DECLINED: 'neutral',
  EXPIRED: 'neutral',
  INTERESTED: 'success',
  READ: 'info',
  SENT: 'brand',
  WITHDRAWN: 'warning',
};
