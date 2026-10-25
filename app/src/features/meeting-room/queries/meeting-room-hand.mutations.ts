import { useMutation, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomHostService as host } from '../api/meeting-room-host.service';
import { meetingRoomKeys } from '../api/meeting-room.keys';
import { meetingRoomApi } from '../store/meeting-room.store';
import { hostActionMessage } from '../utils/meeting-room-errors';

/**
 * Hạ tay MỘT người (chủ trì/đồng chủ trì) — cùng khuôn `useHostAction` của `meeting-room.mutations.ts`: lỗi → toast `hostActionMessage`
 * (`MEET_020` "không còn trong phòng"…), xong → làm mới ảnh chụp phòng. Không toast khi thành công: bàn tay rời danh sách "Đang giơ tay"
 * ngay khi LiveKit báo attribute đổi — đó là phản hồi (như Meet). Tách file vì đợt này không sửa `meeting-room.mutations.ts`.
 */
export function useLowerHandMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => {
      const meetingId = meetingRoomApi.get().meetingId;
      if (!meetingId) return Promise.reject(new Error('Chưa ở trong cuộc họp'));
      return host.lowerHand(meetingId, userId);
    },
    onError: (error) => showToast('error', hostActionMessage(error)),
    onSuccess: () => {
      const meetingId = meetingRoomApi.get().meetingId;
      if (meetingId)
        void queryClient.invalidateQueries({ queryKey: meetingRoomKeys.room(meetingId) });
    },
  });
}
