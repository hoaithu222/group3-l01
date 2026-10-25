import { router } from 'expo-router';
import { Linking } from 'react-native';

import { showToast } from '@/shared/utils/toast.utils';
import { PATHS } from '@/shell/config/constants';

import type { MeetingListItemDto } from '../api/meetings.types';

/** Điều hướng của `meetings` — MỘT chỗ để đổi đích của `openMeetingRoom` mà không phải sửa từng màn. */

export function openMeetingDetail(meetingId: string): void {
  router.push({ params: { meetingId }, pathname: '/meetings/[meetingId]' });
}

/** Lịch họp (agenda) — điểm vào từ hub nhóm / Tôi. */
export function openMeetingsCalendar(): void {
  router.push(PATHS.MEETINGS);
}

/** Tạo cuộc họp; `workspaceId` gắn sẵn nhóm (từ hub nhóm), `dayKey` (`YYYY-MM-DD`) gắn sẵn ngày (từ lưới tháng). */
export function openNewMeeting(workspaceId?: string, dayKey?: string): void {
  const params = { ...(workspaceId ? { workspaceId } : {}), ...(dayKey ? { date: dayKey } : {}) };
  router.push(
    Object.keys(params).length > 0 ? { params, pathname: PATHS.MEETINGS_NEW } : PATHS.MEETINGS_NEW,
  );
}

/** Mở nhóm chat của cuộc họp (`Meeting.conversationId`, p1-05) — route `messages/[conversationId]` có sẵn. */
export function openMeetingChat(conversationId: string): void {
  router.push({ params: { conversationId }, pathname: '/messages/[conversationId]' });
}

export function openEditMeeting(meetingId: string): void {
  router.push({ params: { meetingId }, pathname: '/meetings/[meetingId]/edit' });
}

/**
 * Vào phòng họp nội bộ (p2-05): pre-join → phòng chờ/lobby → phòng — route `meeting-room/[meetingId]` NGOÀI `(app)` (toàn màn, không thanh tab).
 * Nút "Bắt đầu"/"Vào" đều tới đây; màn phòng tự chọn `start` hay `join` theo `myActions` mới nhất của server.
 */
export function openMeetingRoom(meetingId: string): void {
  router.push({ params: { meetingId }, pathname: '/meeting-room/[meetingId]' });
}

/** Nút "Vào" trên thẻ: cuộc họp nền tảng ngoài mở link; nội bộ vào phòng. Quyền do server quyết (`myActions`), ở đây chỉ chọn đường. */
export function joinFromCard(item: MeetingListItemDto): void {
  if (item.platform === 'INTERNAL') openMeetingRoom(item.id);
  else openMeetingDetail(item.id); // link ngoài chỉ có trong chi tiết (thẻ danh sách không mang `externalUrl`)
}

/** Mở link họp ngoài (Zoom/Teams/Meet). Chỉ `https://` — BE đã kiểm, kiểm lại ở đây để không bao giờ `openURL` scheme lạ. */
export async function openExternalMeeting(url: string): Promise<void> {
  if (!/^https:\/\//i.test(url)) {
    showToast('error', 'Liên kết họp không hợp lệ.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    showToast('error', 'Không mở được liên kết họp.');
  }
}

/** p2-06: biên bản (xem) — màn thuộc `features/meeting-recap`, mở bằng ĐƯỜNG DẪN (không import chéo feature). */
export function openMeetingRecap(meetingId: string): void {
  router.push({ params: { meetingId }, pathname: '/meetings/[meetingId]/recap' });
}

/** p2-06: trình soạn biên bản (chủ trì/đồng chủ trì/người viết). */
export function openMeetingRecapEditor(meetingId: string): void {
  router.push({ params: { meetingId }, pathname: '/meetings/[meetingId]/recap-edit' });
}

/** p2-06: danh sách bản ghi của cuộc họp. */
export function openMeetingRecordings(meetingId: string): void {
  router.push({ params: { meetingId }, pathname: '/meetings/[meetingId]/recordings' });
}
