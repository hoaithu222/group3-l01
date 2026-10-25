import type { MeetingDetailDto } from '../api/meetings.types';
import { useServerNow } from './useServerNow';

/**
 * Đồng hồ của màn chi tiết theo GIỜ SERVER: `nowMs` (để vẽ đếm ngược/đã diễn ra bao lâu) và `joinRemainingMs` (còn bao lâu tới
 * `joinOpensAt` — mốc phòng chờ mở). Chỉ tick khi còn ý nghĩa: SCHEDULED tới `startAt`, LIVE liên tục (đếm thời gian đã diễn ra),
 * ENDED/CANCELLED không tick.
 *
 * Offset lấy từ `meeting.receivedAt` (dấu giờ máy lúc nhận `serverNow`, đóng ở service) nên dữ liệu đọc từ CACHE (mở lại màn, vá lạc
 * quan/socket) vẫn đúng: chỉ dựa vào `serverNow` + "bây giờ" sẽ lệch đúng bằng tuổi của cache. Gọi trong component chỉ dựng SAU KHI
 * đã có `meeting` (hook cần `serverNow` ngay lần render đầu).
 */
export function useMeetingClock(meeting: MeetingDetailDto): {
  joinRemainingMs: number;
  nowMs: number;
} {
  const startMs = Date.parse(meeting.startAt);
  const scheduled = meeting.status === 'SCHEDULED';
  const nowMs = useServerNow(
    meeting.serverNow,
    scheduled || meeting.status === 'LIVE',
    scheduled && Number.isFinite(startMs) ? startMs : undefined,
    meeting.receivedAt,
  );
  const joinOpensMs = Date.parse(meeting.joinOpensAt);
  return {
    joinRemainingMs: Number.isFinite(joinOpensMs) ? Math.max(0, joinOpensMs - nowMs) : 0,
    nowMs,
  };
}
