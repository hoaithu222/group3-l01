import { router } from 'expo-router';
import { useCallback } from 'react';

import { PATHS } from '@/shell/config/constants';

import { meetingRoomApi } from '../store/meeting-room.store';
import { dismissRoomScreen } from './meeting-room.leave';

/** Điều hướng ra khỏi màn phòng: quay lại nơi đã mở (chi tiết cuộc họp), không có lịch sử (mở từ deep link/MiniBar) thì về chi tiết/trang chủ. */
export function navigateOutOfRoom(meetingId: string | null): void {
  if (router.canGoBack()) router.back();
  else if (meetingId) router.replace({ params: { meetingId }, pathname: '/meetings/[meetingId]' });
  else router.replace(PATHS.HOME);
}

/**
 * "Thoát" khỏi màn phòng (nút Đóng/Thoát/Về chi tiết, phím Back khi chưa vào phòng): dọn theo pha (`dismissRoomScreen`) rồi rời màn. Phòng đang
 * chạy thì chỉ thu nhỏ — muốn dừng hẳn phải qua `leaveMeeting`.
 */
export function useExitMeetingRoom(): () => Promise<void> {
  return useCallback(async () => {
    const meetingId = meetingRoomApi.get().meetingId;
    await dismissRoomScreen();
    navigateOutOfRoom(meetingId);
  }, []);
}

/**
 * p2-06: "Viết biên bản" ở màn kết thúc — dọn phòng như "Thoát" rồi THAY màn phòng bằng trình soạn biên bản (`meetings/[id]/recap-edit`),
 * để nút Back từ trình soạn về chi tiết cuộc họp chứ không quay lại màn phòng đã đóng. Mở bằng ĐƯỜNG DẪN (không import `meeting-recap`).
 */
export function useWriteRecapFromRoom(): () => Promise<void> {
  return useCallback(async () => {
    const meetingId = meetingRoomApi.get().meetingId;
    await dismissRoomScreen();
    if (meetingId) router.replace({ params: { meetingId }, pathname: '/meetings/[meetingId]/recap-edit' });
    else router.replace(PATHS.HOME);
  }, []);
}
