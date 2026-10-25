import { showToast } from '@/shared/utils/toast.utils';

import { getMeetingMedia } from '../media/meeting-media.registry';
import { meetingRoomApi } from '../store/meeting-room.store';
import { ensureDevice } from './meeting-room.permissions';

/**
 * Bật/tắt mic, camera của MÌNH trong phòng — hàm thuần (không React) để cả thanh điều khiển lẫn `MeetingMiniBar` (thu nhỏ) dùng chung MỘT đường.
 * Bật thì xin quyền đúng lúc bấm; KHÔNG bao giờ tự bật. Kết quả ghi theo track THẬT mà cổng media báo lại, không theo ý định của người dùng.
 */

export async function toggleMicrophone(): Promise<void> {
  const { micOn, publish } = meetingRoomApi.get();
  if (!micOn && !publish.audio) {
    showToast('info', 'Bạn chỉ có quyền nghe trong cuộc họp này.');
    return;
  }
  if (!micOn && !(await ensureDevice('mic'))) return;
  try {
    meetingRoomApi.patch({ micOn: await getMeetingMedia().setMicrophoneEnabled(!micOn) });
  } catch {
    showToast('error', 'Không bật/tắt được mic. Hãy thử lại.');
  }
}

export async function toggleCamera(): Promise<void> {
  const { camOn, publish } = meetingRoomApi.get();
  if (!camOn && !publish.video) {
    showToast('info', 'Bạn không có quyền bật camera trong cuộc họp này.');
    return;
  }
  if (!camOn && !(await ensureDevice('cam'))) return;
  try {
    meetingRoomApi.patch({ camOn: await getMeetingMedia().setCameraEnabled(!camOn) });
  } catch {
    showToast('error', 'Không bật/tắt được camera. Hãy thử lại.');
  }
}
