/**
 * Sự kiện Socket.IO của biên bản/bản ghi mà `SocketEvent` (`core/socket`) CHƯA khai — khai tại feature để không sửa `core/socket`
 * (cùng cách `meeting-room.socket.ts`). Chuỗi khớp BE `infrastructure/socket/socket.events.ts` (`MEETING_RECAP_PUBLISHED`,
 * `MEETING_RECORDING_UPDATED`). Phòng nhận: `meet:{meetingId}` (`useRoomSubscription('meet', id)`) + `user:{id}` (người tham dự/chủ trì).
 */
export const MeetingRecapEvent = {
  RECAP_PUBLISHED: 'meeting:recap-published',
  RECORDING_UPDATED: 'meeting:recording-updated',
} as const;
