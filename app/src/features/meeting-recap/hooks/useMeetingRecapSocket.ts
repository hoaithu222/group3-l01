import { useQueryClient } from '@tanstack/react-query';

import { useRoomSubscription, useSocketEvent } from '@/core/socket';

import { MEETINGS_DETAIL_KEY, recapKeys, recordingKeys } from '../api/meeting-recap.keys';
import { MeetingRecapEvent } from '../api/meeting-recap.socket';
import type { RecapPublishedPayload, RecordingUpdatedPayload } from '../api/meeting-recap.types';

/**
 * Realtime của biên bản/bản ghi MỘT cuộc họp đang xem (app.md §4.2): `room:join meet:{id}` lúc mở màn (refcount ở `core/socket`), rồi
 * `meeting:recap-published` → làm mới biên bản + chi tiết (`hasPublishedRecap`); `meeting:recording-updated` → làm mới danh sách/chi tiết
 * bản ghi (READY hiện ra, bản bị xoá biến mất). Chỉ LÀM MỚI (không vá tay): quyền xem/`myActions` do server tính lại.
 */
export function useMeetingRecapSocket(meetingId: string | undefined): void {
  const queryClient = useQueryClient();
  useRoomSubscription('meet', meetingId);

  useSocketEvent<RecapPublishedPayload>(MeetingRecapEvent.RECAP_PUBLISHED, (payload) => {
    if (!meetingId || payload.meetingId !== meetingId) return;
    void queryClient.invalidateQueries({ queryKey: recapKeys.detail(meetingId) });
    void queryClient.invalidateQueries({ queryKey: MEETINGS_DETAIL_KEY(meetingId) });
  });

  useSocketEvent<RecordingUpdatedPayload>(MeetingRecapEvent.RECORDING_UPDATED, (payload) => {
    if (!meetingId || payload.meetingId !== meetingId) return;
    void queryClient.invalidateQueries({ queryKey: recordingKeys.list(meetingId) });
    void queryClient.invalidateQueries({ queryKey: recordingKeys.detail(payload.recordingId) });
    if (payload.status === 'READY' || payload.deleted) void queryClient.invalidateQueries({ queryKey: MEETINGS_DETAIL_KEY(meetingId) });
  });
}
