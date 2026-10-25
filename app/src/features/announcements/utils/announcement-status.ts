import type { AnnouncementView } from '../api/announcements.types';

export type AnnouncementStatus = 'pending' | 'confirmed' | 'expired';

/** Nhãn CHỮ của huy hiệu — trạng thái không bao giờ chỉ nằm ở màu (`docs/rules/mobile-ux.md`). */
export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = {
  confirmed: 'Đã xác nhận',
  expired: 'Đã hết hạn',
  pending: 'Cần xác nhận',
};

export type ExpiryFields = Pick<AnnouncementView, 'deadlineAt' | 'expired'>;

/**
 * Hết hạn theo BE (`expired`) HOẶC theo đồng hồ đã hiệu chỉnh: BE không phát sự kiện khi qua hạn, nên yêu cầu mở sẵn trong
 * lúc hạn trôi qua vẫn phải tự chuyển sang "Đã hết hạn".
 *
 * ⚠️ Nhận `nowMs` thay vì tự đọc đồng hồ: render KHÔNG được đọc đồng hồ (React Compiler được bật — kết quả sẽ bị nhớ theo
 * `view` và không bao giờ đổi khi thời gian trôi). `useIsExpired` giữ "bây giờ" trong state và hẹn giờ cập nhật nó.
 */
export function isExpiredAt(view: ExpiryFields, nowMs: number): boolean {
  if (view.expired) return true;
  return view.deadlineAt !== null && nowMs >= Date.parse(view.deadlineAt);
}

/** Đã xác nhận thắng hết hạn: người đã bấm vẫn thấy "Đã xác nhận" sau khi quá hạn. */
export function resolveStatus(
  view: Pick<AnnouncementView, 'confirmedByMe'>,
  expired: boolean,
): AnnouncementStatus {
  if (view.confirmedByMe) return 'confirmed';
  return expired ? 'expired' : 'pending';
}
