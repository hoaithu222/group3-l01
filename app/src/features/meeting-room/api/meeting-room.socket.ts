/**
 * Sự kiện Socket.IO của phòng họp mà `SocketEvent` (`core/socket`) CHƯA khai — khai tại feature để không sửa `core/socket` ngoài phạm vi
 * p2-05 (cùng cách `calls.socket.types.ts` khai `call:host-action`). Chuỗi khớp BE `infrastructure/socket/socket.events.ts` (p2-05).
 * Khi điều phối viên gom vào `SocketEvent` thì đổi các dòng dưới đây thành `SocketEvent.MEETING_*` — không nơi nào khác phải sửa.
 *
 * Phòng nhận: `meet:{meetingId}` (`useRoomSubscription('meet', id)`) và `call:{callId}` (`'call'`); riêng `meeting:lobby` (ADMITTED/DENIED),
 * `call:host-action` (người bị tác động) và `meeting:started` (người được mời) còn tới thẳng `user:{id}` nên không phụ thuộc phòng.
 */
export const MeetingRoomEvent = {
  ENDED: 'meeting:ended',
  HOST_ACTION: 'call:host-action',
  LOBBY: 'meeting:lobby',
  STARTED: 'meeting:started',
} as const;

/** Loại phòng của `useRoomSubscription`. */
export const ROOM_KIND = { call: 'call', meeting: 'meet' } as const;
