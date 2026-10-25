import { useMutation, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { announcementKeys } from '../api/announcements.keys';
import { announcementsService } from '../api/announcements.service';
import type { AnnouncementView, CreateAnnouncementInput } from '../api/announcements.types';
import {
  patchAnnouncement,
  removeAnnouncement,
  upsertAnnouncement,
} from '../utils/announcement-cache';
import { describeAnnouncementError } from '../utils/error-info';

type AnnouncementList = AnnouncementView[] | undefined;

/**
 * "Tôi đã đọc" — LẠC QUAN: `confirmedByMe = true` ngay (huy hiệu → "Đã xác nhận", nút biến mất), lỗi thì hoàn lại đúng
 * dòng đó. Hoàn lại TỪNG DÒNG chứ không khôi phục cả bản chụp danh sách: trong lúc chờ, socket có thể đã huỷ/thêm dòng
 * KHÁC — khôi phục cả mảng sẽ xoá nhầm những thay đổi đó.
 *
 * `ANN_003` (410 — yêu cầu đã huỷ/hết hạn) đóng vòng: không hoàn về "Cần xác nhận" (người dùng sẽ bấm lại vô ích) mà đặt
 * `expired: true` ngay; `onSettled` tải lại danh sách để dòng của yêu cầu ĐÃ HUỶ biến mất.
 */
export function useConfirmRead(channelId: string) {
  const queryClient = useQueryClient();
  const queryKey = announcementKeys.channel(channelId);

  return useMutation({
    mutationFn: (messageId: string) => announcementsService.confirm(messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient
        .getQueryData<AnnouncementList>(queryKey)
        ?.find((item) => item.messageId === messageId);
      queryClient.setQueryData<AnnouncementList>(queryKey, (list) =>
        patchAnnouncement(list, messageId, { confirmedByMe: true }),
      );
      return { previousConfirmed: previous?.confirmedByMe ?? false };
    },
    onError: (error, messageId, context) => {
      const info = describeAnnouncementError(error);
      queryClient.setQueryData<AnnouncementList>(queryKey, (list) =>
        patchAnnouncement(list, messageId, {
          confirmedByMe: context?.previousConfirmed ?? false,
          ...(info.gone && { expired: true }),
        }),
      );
      showToast('error', info.message);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });
}

/** Người quản lý gửi yêu cầu (hoặc yêu cầu lại khi đã hết hạn/huỷ — BE khôi phục). Thành công ⇒ chèn view trả về vào cache. */
export function useRequestConfirm(channelId: string) {
  const queryClient = useQueryClient();
  const queryKey = announcementKeys.channel(channelId);

  return useMutation({
    mutationFn: (input: CreateAnnouncementInput) => announcementsService.create(input),
    onSuccess: (view) => {
      queryClient.setQueryData<AnnouncementList>(queryKey, (list) =>
        upsertAnnouncement(list, view),
      );
      showToast('success', 'Đã gửi yêu cầu xác nhận');
    },
    onError: (error) => showToast('error', describeAnnouncementError(error).message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });
}

/** Huỷ yêu cầu (idempotent, 204). Không lạc quan: hộp thoại xác nhận đã có, và huỷ nhầm là mất huy hiệu của mọi người. */
export function useCancelRequest(channelId: string) {
  const queryClient = useQueryClient();
  const queryKey = announcementKeys.channel(channelId);

  return useMutation({
    mutationFn: (messageId: string) => announcementsService.cancel(messageId),
    onSuccess: (_result, messageId) => {
      queryClient.setQueryData<AnnouncementList>(queryKey, (list) =>
        removeAnnouncement(list, messageId),
      );
      showToast('success', 'Đã huỷ yêu cầu xác nhận');
    },
    onError: (error) => showToast('error', describeAnnouncementError(error).message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });
}
