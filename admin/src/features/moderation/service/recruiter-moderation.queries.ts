import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';
import type { ApiResponse } from '@/shared/types/api.types';

import type { ReportedOffer } from '../types/recruiter-moderation.types';
import { errorCodeOf } from '../utils/report-errors';
import { OFFER_INVALID_STATE_CODE } from './recruiter-moderation.api';
import { recruiterModerationService } from './recruiter-moderation.service';
import { refreshModeration } from './moderation.queries';

/**
 * Cùng gốc `['moderation']` nhưng KHÔNG trùng tiền tố nào mà `refreshModeration` làm mới (`list`/`detail`/`open-count`): mỗi lần tải nội dung lời mời
 * là một dòng nhật ký `job-offer.view-reported`, nên không được refetch ngầm khi xử lý xong báo cáo (cùng lý do với khoá `content` — xem `refreshModeration`).
 */
export const recruiterModerationKeys = {
  offer: (offerId: string) => ['moderation', 'job-offer', offerId] as const,
};

/**
 * Nội dung lời mời bị báo cáo. `enabled` chỉ bật SAU KHI người dùng xác nhận (mỗi lần gọi thật BE ghi nhật ký):
 * `staleTime: Infinity` + tắt mọi `refetchOn*` + `retry: false` để không có lượt gọi lại ngầm (đổi tab trình duyệt, mạng chập chờn) —
 * muốn xem lại phải xác nhận lại. `gcTime: 0` để nội dung không nằm lại trong cache khi rời trang.
 */
export const useReportedOffer = (offerId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: recruiterModerationKeys.offer(offerId ?? ''),
    queryFn: () => recruiterModerationService.reported(offerId as string),
    select: (res) => res.data,
    enabled: enabled && !!offerId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

/**
 * `POST /admin/job-offers/:id/withdraw` (`recruiter:approve`) — audit `job-offer.admin-withdraw`, đóng luôn báo cáo mở. Cập nhật TẠI CHỖ trạng thái đang hiện
 * (không refetch — xem `recruiterModerationKeys`). `RECR_009` (không còn mở) không đáng để hộp thoại kẹt: nuốt ở nơi gọi, hàng đợi được làm mới.
 */
export const useWithdrawOffer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recruiterModerationService.withdraw,
    onSuccess: (res, { offerId }) => {
      qc.setQueryData<ApiResponse<ReportedOffer>>(recruiterModerationKeys.offer(offerId), (old) =>
        old ? { ...old, data: { ...old.data, status: res.data.status } } : old,
      );
      refreshModeration(qc);
      showToast('success', 'Đã thu hồi lời mời vi phạm và ghi nhật ký');
    },
    onError: (err) => {
      if (errorCodeOf(err) === OFFER_INVALID_STATE_CODE) refreshModeration(qc);
    },
  });
};
