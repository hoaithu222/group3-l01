import { useMutation, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { jobSettingsService } from '../api/career-settings.service';
import { companyBlocksService } from '../api/company-blocks.service';
import { offersService } from '../api/offers.service';
import type {
  DeclineReason,
  JobSettings,
  JobSettingsPayload,
  ReportReason,
} from '../api/recruiter.types';
import { applyOfferDetail } from '../utils/offer-cache';
import { recruiterErrorCode, recruiterErrorMessage } from '../utils/recruiter-errors';
import { careerKeys } from './career.keys';
import { offerKeys } from './offers.keys';

/**
 * Lưu hồ sơ Tìm việc (app.md §4): TẮT thì LẠC QUAN (công tắc đổi tức thì, lỗi ⇒ trả về bản cũ); BẬT thì KHÔNG — bật cần đồng ý chính sách và
 * server xác nhận (`consentVersion` khớp), hiện "đã bật" trước khi server nhận là nói dối người dùng về việc dữ liệu đã được chia sẻ.
 * Thành công ⇒ ghi bản server trả về và làm mới `['me','career']` của p6-06 (cùng chứa `openToWork`).
 */
export function useUpdateJobSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: JobSettingsPayload) => jobSettingsService.update(payload),
    onMutate: async (payload) => {
      if (payload.openToWork) return { previous: undefined };
      await qc.cancelQueries({ queryKey: offerKeys.jobSettings() });
      const previous = qc.getQueryData<JobSettings>(offerKeys.jobSettings());
      if (previous) {
        qc.setQueryData<JobSettings>(offerKeys.jobSettings(), {
          ...previous,
          headline: payload.headline,
          location: payload.location,
          openToWork: false,
          preferredRoles: payload.preferredRoles,
        });
      }
      return { previous };
    },
    // ⚠️ Toast ở ĐÂY (cấp hook) chứ không ở `mutate(…, { onError })`: callback của lời gọi không chạy nếu màn đã dựng lại giữa chừng (lưu xong đổi dữ liệu ⇒ màn remount).
    onError: (error, payload, context) => {
      if (context?.previous) qc.setQueryData(offerKeys.jobSettings(), context.previous);
      // Chính sách đổi giữa lúc mở màn và lúc bấm: BE trả `VAL_001` kèm phiên bản mới ⇒ tải lại để tấm đồng ý hiện đúng bản mới.
      if (payload.openToWork && recruiterErrorCode(error) === 'VAL_001') {
        void qc.invalidateQueries({ queryKey: offerKeys.jobSettings() });
        showToast('error', 'Chính sách dữ liệu vừa được cập nhật. Hãy đọc và đồng ý lại.');
        return;
      }
      showToast('error', recruiterErrorMessage(error));
    },
    onSuccess: (saved) => {
      qc.setQueryData(offerKeys.jobSettings(), saved);
      void qc.invalidateQueries({ queryKey: careerKeys.me() });
    },
  });
}

/** Quan tâm: server trả bản chi tiết mới (đã `INTERESTED`, có `sharedEmail` nếu chọn). Lỗi để nơi gọi hiện TRONG tấm (`RECR_009`, `RECR_002`). */
export function useRespondInterested(offerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shareEmail: boolean) => offersService.interested(offerId, shareEmail),
    onSuccess: (detail) => applyOfferDetail(qc, detail),
  });
}

export function useDeclineOffer(offerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: DeclineReason) => offersService.decline(offerId, reason),
    onSuccess: (detail) => applyOfferDetail(qc, detail),
  });
}

/** Chặn: mọi lời mời mở với công ty đó bị khoá thread ngay (server) ⇒ tải lại cả danh sách lẫn chi tiết. */
export function useBlockCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => companyBlocksService.block(companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: offerKeys.blocks() });
      void qc.invalidateQueries({ queryKey: offerKeys.all });
    },
  });
}

/** Bỏ chặn KHÔNG mở lại thread cũ (be.md §5) — không cần làm mới lời mời. */
export function useUnblockCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => companyBlocksService.unblock(companyId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: offerKeys.blocks() }),
  });
}

export function useReportOffer(offerId: string) {
  return useMutation({
    mutationFn: (vars: { description?: string; reason: ReportReason }) =>
      companyBlocksService.reportOffer(offerId, vars.reason, vars.description),
  });
}
