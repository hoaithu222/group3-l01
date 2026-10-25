import { router } from 'expo-router';

/**
 * Điều hướng của biên bản/bản ghi — MỘT chỗ đổi đích. Route nằm dưới `app/(app)/meetings/[meetingId]/` (Stack của phân hệ Lịch họp):
 * `recap` (xem) · `recap-edit` (soạn) · `recordings` (danh sách) · `recordings/[recordingId]` (phát).
 */

export function openRecap(meetingId: string): void {
  router.push({ params: { meetingId }, pathname: '/meetings/[meetingId]/recap' });
}

export function openRecapEditor(meetingId: string, options: { replace?: boolean } = {}): void {
  const href = { params: { meetingId }, pathname: '/meetings/[meetingId]/recap-edit' } as const;
  if (options.replace) router.replace(href);
  else router.push(href);
}

export function openRecordings(meetingId: string): void {
  router.push({ params: { meetingId }, pathname: '/meetings/[meetingId]/recordings' });
}

export function openRecordingPlayer(meetingId: string, recordingId: string): void {
  router.push({ params: { meetingId, recordingId }, pathname: '/meetings/[meetingId]/recordings/[recordingId]' });
}

/** Rời màn con: có lịch sử thì quay lại, không (mở từ thông báo/deep link) thì về chi tiết cuộc họp. */
export function backToMeeting(meetingId: string): void {
  if (router.canGoBack()) router.back();
  else router.replace({ params: { meetingId }, pathname: '/meetings/[meetingId]' });
}
