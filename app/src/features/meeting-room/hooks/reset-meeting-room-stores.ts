import { meetingRoomApi } from '../store/meeting-room.store';
import { clearRejoin } from './meeting-room.join';
import { teardownMeetingSession } from './meeting-room.teardown';

/**
 * Đăng xuất/đổi tài khoản/rời màn kết thúc: ngắt media, dọn đếm giờ và đưa store về ban đầu — `wipe-steps.ts` (`meetingRoom`) gọi ĐÚNG hàm
 * này vì controller LiveKit giữ kết nối ngoài React (chỉ `reset()` store thì âm thanh/camera vẫn chạy tiếp cho người trước). Idempotent: gọi
 * được kể cả khi chưa có phiên (`disconnect()` của cổng media là no-op).
 */
export async function resetMeetingRoomStores(): Promise<void> {
  clearRejoin();
  await teardownMeetingSession();
  meetingRoomApi.reset();
}
