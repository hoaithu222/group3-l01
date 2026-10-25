import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { DeclineReason } from '../api/recruiter.types';
import { offerKeys } from '../queries/offers.keys';
import {
  useBlockCompany,
  useDeclineOffer,
  useRespondInterested,
} from '../queries/offers.mutations';
import {
  isOfferChanged,
  recruiterErrorCode,
  recruiterErrorMessage,
} from '../utils/recruiter-errors';

export type OfferSheet = 'block' | 'decline' | 'interested' | 'report' | null;

/**
 * Hành động trên chi tiết lời mời (app.md §3–§4): Quan tâm / Từ chối / Chặn / Báo cáo và tấm đang mở. `RECR_009` (lời mời đã đổi trạng thái — hai thiết bị,
 * doanh nghiệp vừa thu hồi) ⇒ tải lại chi tiết + danh sách, toast "Lời mời đã thay đổi" và đóng tấm (tấm cũ mô tả trạng thái không còn đúng). Lỗi khác hiện TRONG
 * tấm, giữ nguyên lựa chọn của người dùng. `RECR_002` (công ty vừa tạm ngưng) cũng tải lại chi tiết để nút Quan tâm biến mất.
 */
export function useOfferDetailActions(offerId: string) {
  const qc = useQueryClient();
  const interested = useRespondInterested(offerId);
  const decline = useDeclineOffer(offerId);
  const block = useBlockCompany();
  const [sheet, setSheet] = useState<OfferSheet>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: offerKeys.detail(offerId) });
    void qc.invalidateQueries({ queryKey: offerKeys.list() });
  };

  const onFailure = (error: unknown) => {
    if (isOfferChanged(error)) {
      refresh();
      showToast('info', 'Lời mời đã thay đổi');
      setSheet(null);
    } else if (recruiterErrorCode(error) === 'RECR_002') {
      refresh();
    }
  };

  const open = (next: OfferSheet) => {
    interested.reset();
    decline.reset();
    setSheet(next);
  };

  const inSheet = (error: Error | null): string | null =>
    error && !isOfferChanged(error) ? recruiterErrorMessage(error) : null;

  return {
    blocking: block.isPending,
    close: () => setSheet(null),
    confirmBlock: (companyId: string) =>
      block.mutate(companyId, {
        onError: (error) => {
          setSheet(null);
          showToast('error', recruiterErrorMessage(error));
        },
        onSuccess: () => {
          setSheet(null);
          showToast('success', 'Đã chặn doanh nghiệp');
        },
      }),
    confirmDecline: (reason: DeclineReason) =>
      decline.mutate(reason, {
        onError: onFailure,
        onSuccess: () => {
          // Rung "xong" đi cùng toast: phản hồi của việc đã CHỐT ở server (không rung lúc bấm — tấm vẫn có thể báo lỗi).
          hapticSuccess();
          setSheet(null);
          showToast('success', 'Đã từ chối lời mời');
        },
      }),
    confirmInterested: (shareEmail: boolean) =>
      interested.mutate(shareEmail, {
        onError: onFailure,
        onSuccess: () => {
          hapticSuccess();
          setSheet(null);
          showToast('success', 'Đã bày tỏ quan tâm — bạn có thể trao đổi với doanh nghiệp');
        },
      }),
    declineError: inSheet(decline.error),
    declining: decline.isPending,
    interestedError: inSheet(interested.error),
    interesting: interested.isPending,
    open,
    sheet,
  };
}
