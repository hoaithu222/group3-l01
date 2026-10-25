import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';

import { recruiterKeys } from '../service/recruiter.queries';

/** Loại thông báo BE gửi cho vận hành khi có doanh nghiệp cần xử lý (`be/.../recruiter.notification-types.ts`). */
const NEEDS_REVIEW_TYPE = 'company.needs-review';

interface NotificationPayload {
  type?: string;
}

/**
 * Làm mới danh sách doanh nghiệp khi có đăng ký mới / gửi duyệt lại (realtime cho vận hành).
 *
 * ⚠ BE KHÔNG có phòng `admin:recruiter` (kế hoạch nhắc tới, mã chưa có — `socket.guards.ts` chỉ khai `admin:moderation|media|ops`): tín hiệu duy nhất tới
 * vận hành là `notification:created` loại `company.needs-review` (đã có sẵn ở `user:{id}`), BE gộp MỘT thông báo/giờ. Nên "realtime" ở đây là
 * xấp xỉ theo giờ + làm mới khi tab lấy lại tiêu điểm (React Query mặc định) — không phải từng đăng ký một. Khi BE mở phòng riêng thì đổi hook này.
 * Sự kiện KHÔNG kèm hồ sơ — chỉ là tín hiệu để refetch qua REST (đã kiểm quyền).
 */
export function useRecruiterSocket(): void {
  const queryClient = useQueryClient();

  useSocketEvent<NotificationPayload>(SocketEvent.NOTIFICATION_CREATED, (payload) => {
    if (payload?.type === NEEDS_REVIEW_TYPE) {
      void queryClient.invalidateQueries({ queryKey: recruiterKeys.all });
    }
  });
}
