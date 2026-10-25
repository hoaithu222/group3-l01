import { router } from 'expo-router';

import { SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * Phạm vi realtime của MỘT cuộc họp đang xem (app.md p2-04 §4.2): `room:join { kind: 'meet', id }` lúc mở màn, `room:leave` lúc
 * rời (refcount ở `core/socket`) để nhận `meeting:updated` của người khác đổi. Bị xoá khỏi danh sách (`meeting:attendee-removed`
 * với chính mình) ⇒ toast + quay lại — cache đã được `useMeetingSocketSync` dọn ở `(app)/_layout.tsx`, ở đây chỉ lo phần điều hướng.
 */
export function useMeetingDetailScope(meetingId: string | undefined): void {
  const userId = useAuthStore((state) => state.user?.id);
  useRoomSubscription('meet', meetingId);

  useSocketEvent<{ meetingId: string; userId: string }>(
    SocketEvent.MEETING_ATTENDEE_REMOVED,
    (payload) => {
      if (payload.meetingId !== meetingId || payload.userId !== userId) return;
      showToast('info', 'Bạn không còn trong cuộc họp này.');
      router.back();
    },
  );
}
