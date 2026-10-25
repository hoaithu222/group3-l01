import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import type { OfferStatus } from '@/features/recruiter';

import { patchProfileOpenOffer } from '../service/offer.queries';
import { portalKeys } from '../service/portal.keys';
import type { TalentProfile } from '../types/talent.types';

interface OfferUpdatedPayload {
  offerId: string;
  companyId: string;
  status: OfferStatus;
  threadLocked: boolean;
}

interface OfferMessagePayload {
  offerId: string;
}

interface CompanyUpdatedPayload {
  companyId: string;
}

/** Trạng thái "lời mời mở" ở BE (`OPEN_OFFER_STATUSES`) — hồ sơ ứng viên chỉ nhớ lời mời còn mở. */
const OPEN: readonly OfferStatus[] = ['SENT', 'READ', 'INTERESTED'];

/**
 * Làm mới TRỰC TIẾP dữ liệu của cổng HR khi BE báo thay đổi (admin.md p6-08 §3, `useOfferSocket`):
 *  - `offer:updated` → danh sách + chi tiết lời mời + hạn mức; hồ sơ ứng viên đang mở được VÁ `openOffer` tại chỗ;
 *  - `offer:message-created` → thread của lời mời đó + danh sách (cột "Tin mới"). Payload KHÔNG có nội dung — tải lại qua REST (đã kiểm quyền);
 *  - `company:updated` (duyệt/tạm ngưng/đổi gói) → doanh nghiệp của tôi + mọi thứ phụ thuộc trạng thái (banner, tìm ứng viên, hạn mức).
 *
 * ⛔ KHÔNG làm mới khoá `profile`/`proof` (kể cả khi công ty đổi trạng thái): mỗi lần BE trả hồ sơ là một dòng nhật ký + một lượt trong trần 300 lượt/ngày — hồ sơ chỉ được vá tại chỗ.
 * Sự kiện của doanh nghiệp KHÁC (cùng người dùng là sinh viên ở app) bị bỏ qua nhờ so `companyId`. Socket không thay REST: mất kết nối thì React Query vẫn làm mới khi tab lấy lại tiêu điểm.
 */
export function useOfferSocket(companyId: string | undefined): void {
  const qc = useQueryClient();

  useSocketEvent<OfferUpdatedPayload>(SocketEvent.OFFER_UPDATED, (p) => {
    if (!companyId || p.companyId !== companyId) return;
    void qc.invalidateQueries({ queryKey: portalKeys.offerLists(companyId) });
    void qc.invalidateQueries({ queryKey: portalKeys.offer(p.offerId) });
    void qc.invalidateQueries({ queryKey: portalKeys.usage(companyId) });
    syncProfiles(qc, companyId, p);
  });

  useSocketEvent<OfferMessagePayload>(SocketEvent.OFFER_MESSAGE_CREATED, (p) => {
    if (!companyId) return;
    void qc.invalidateQueries({ queryKey: portalKeys.messages(p.offerId) });
    void qc.invalidateQueries({ queryKey: portalKeys.offerLists(companyId) });
  });

  useSocketEvent<CompanyUpdatedPayload>(SocketEvent.COMPANY_UPDATED, (p) => {
    if (!companyId || p.companyId !== companyId) return;
    void qc.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === 'portal' && q.queryKey[1] !== 'profile' && q.queryKey[1] !== 'proof',
    });
  });
}

/** Vá `openOffer` của hồ sơ nào đang trong cache và trỏ tới lời mời này: còn mở → cập nhật trạng thái, đã đóng → `null` (nút "Gửi lời mời" hiện lại). */
function syncProfiles(qc: QueryClient, companyId: string, p: OfferUpdatedPayload): void {
  const profiles = qc.getQueriesData<TalentProfile>({ queryKey: ['portal', 'profile', companyId] });
  for (const [key, profile] of profiles) {
    if (profile?.openOffer?.id !== p.offerId) continue;
    const userId = String(key[3] ?? '');
    patchProfileOpenOffer(
      qc,
      companyId,
      userId,
      OPEN.includes(p.status) ? { ...profile.openOffer, status: p.status } : null,
    );
  }
}
