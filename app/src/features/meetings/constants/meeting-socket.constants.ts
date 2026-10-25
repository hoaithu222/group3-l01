/**
 * Hằng của đồng bộ socket lịch họp (`hooks/useMeetingSocketSync.ts`) — tách ra để hook giữ dưới trần 150 dòng.
 */

/**
 * Trường đổi làm lịch/thẻ phải tính lại (giờ, trạng thái, nền tảng, tiêu đề…).
 * ⚠️ `title` PHẢI có: payload không mang tiêu đề mới (BE `meeting-event.handler.ts`) nên không có gì để "vá tại chỗ" — thiếu
 * nó thì thẻ trên lịch giữ tên cũ khi người khác đổi tên cuộc họp.
 */
export const RANGE_FIELDS = new Set([
  'startAt',
  'endAt',
  'status',
  'timezone',
  'platform',
  'format',
  'hostId',
  'title',
]);

/** `changedFields` làm danh sách người tham dự (nhãn RSVP, vai trò từng dòng) phải tải lại. */
export const ATTENDEE_FIELDS = new Set(['rsvp', 'roles', 'hostId']);

/**
 * p2-06: biên bản công bố / bản ghi đổi trạng thái — `hasPublishedRecap`/`readyRecordingCount`/`myActions` của chi tiết đổi theo. Chuỗi sự kiện
 * chưa có trong `SocketEvent` (`core/socket`) nên khai tại chỗ, khớp BE `MEETING_RECAP_PUBLISHED`/`MEETING_RECORDING_UPDATED`.
 */
export const RECAP_EVENTS = ['meeting:recap-published', 'meeting:recording-updated'] as const;

/**
 * p2-05: bắt đầu/kết thúc phiên họp đổi `status`/`currentCallId`/`myActions` (nút "Vào") của chi tiết VÀ ô trên lịch — BE KHÔNG phát kèm
 * `meeting:updated`. Khớp `meeting-room/api/meeting-room.socket.ts` (`meeting:started` tới `user:{attendee}`; `meeting:ended` tới
 * `meet:{id}` — chỉ máy đang ở phòng/pre-join nhận).
 */
export const LIFECYCLE_EVENTS = ['meeting:started', 'meeting:ended'] as const;
