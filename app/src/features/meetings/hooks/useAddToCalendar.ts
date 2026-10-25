import { useMutation } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { meetingsService } from '../api/meetings.service';
import type { MeetingDetailDto } from '../api/meetings.types';
import { classifyMeetingError } from '../utils/meeting-errors';
import { openIcsWithSystem } from '../utils/meeting-ics';

/**
 * "Thêm vào lịch": tải `.ics` (`GET /meetings/:id/ics` — BE trả TỆP, KHÔNG gửi email) → ghi cache → mở bảng chia sẻ hệ điều hành để người dùng chọn ứng
 * dụng lịch. Cả chuỗi là MỘT mutation nên `isPending` khoá nút suốt từ lúc tải tới lúc bảng chia sẻ bật (bấm đúp lúc bảng đang mở là `SharingInProgressException`).
 *
 * Lỗi đi qua `classifyMeetingError` như mọi thao tác họp: mất mạng ("Cần kết nối mạng…"), 404 `MEET_001` (huỷ/xoá/không còn quyền), 403 `PERM_004`
 * (chỉ có metadata) và lỗi ghi tệp/mở bảng (đã được `openIcsWithSystem` đổi thành câu tiếng Việt). Không có `onSuccess` toast: bảng chia sẻ hiện ra đã là phản hồi.
 */
export function useAddToCalendar(meeting: Pick<MeetingDetailDto, 'code' | 'id'>) {
  const { code, id } = meeting;
  const add = useMutation({
    mutationFn: async () => openIcsWithSystem(await meetingsService.ics(id), code),
    onError: (error) => showToast('error', classifyMeetingError(error).message),
    onSuccess: (opened) => {
      if (!opened) showToast('info', 'Thiết bị không hỗ trợ mở tệp lịch.');
    },
  });

  return { addToCalendar: () => add.mutate(), pending: add.isPending };
}
