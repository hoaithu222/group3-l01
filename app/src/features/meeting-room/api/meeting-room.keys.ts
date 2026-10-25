/** Khoá cache của `meeting-room` (app.md p2-05 §4.2) — tách khỏi `meetingsKeys` (p2-04) để không đè kiểu dữ liệu của nhau. */
export const meetingRoomKeys = {
  all: ['meeting-room'] as const,
  attendees: (meetingId: string) => ['meeting-room', 'attendees', meetingId] as const,
  brief: (meetingId: string) => ['meeting-room', 'brief', meetingId] as const,
  chatAccess: (conversationId: string) => ['meeting-room', 'chat-access', conversationId] as const,
  lobby: (meetingId: string) => ['meeting-room', 'lobby', meetingId] as const,
  room: (meetingId: string) => ['meeting-room', 'room', meetingId] as const,
};

/**
 * Khoá của `features/meetings` (p2-04) — viết lại LITERAL thay vì import (không import chéo feature). Sau khi bắt đầu/kết thúc/khoá
 * phòng, chi tiết cuộc họp phía lịch họp (`myActions`, trạng thái, `currentCallId`) phải làm mới — giữ đúng hình dạng khoá của họ.
 */
export const MEETINGS_DETAIL_KEY = (meetingId: string) => ['meetings', 'detail', meetingId] as const;

/**
 * Tiền tố MỌI cửa sổ lịch họp (`meetingsKeys.ranges()` của `features/meetings`) — cùng lý do ghi LITERAL như trên. Bắt đầu/kết thúc
 * phiên đổi trạng thái + nút "Vào" của thẻ trên lịch (tab Lịch họp vẫn mounted) mà BE không phát `meeting:updated` kèm theo.
 */
export const MEETINGS_RANGES_KEY = ['meetings', 'range'] as const;
