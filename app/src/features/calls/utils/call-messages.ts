import type { CallEndedReason } from '../store/call-signal.types';

/** Câu hiển thị cho người dùng (tiếng Việt) — gom một chỗ để màn gọi, banner, test cùng dùng. */

export const MEDIA_UNAVAILABLE_MESSAGE =
  'Bản dựng này chưa hỗ trợ cuộc gọi âm thanh/video (cần bản dev-client).';

/** Dòng nói LÝ DO cuộc gọi kết thúc (màn "Cuộc gọi đã kết thúc" giữ ~2 giây). */
export function endedText(reason: CallEndedReason | undefined): string {
  switch (reason) {
    case 'ANSWERED_ELSEWHERE':
      return 'Đã trả lời ở thiết bị khác';
    case 'DECLINED':
      return 'Người nhận đã từ chối';
    case 'DECLINED_ELSEWHERE':
    case 'DECLINED_LOCAL':
      return 'Đã từ chối cuộc gọi';
    case 'CANCELLED':
      return 'Cuộc gọi đã bị huỷ';
    case 'CANCELLED_LOCAL':
      return 'Đã huỷ cuộc gọi';
    case 'NO_ANSWER':
      return 'Không có ai trả lời';
    case 'BUSY':
      return 'Người nhận đang bận';
    case 'MOVED_DEVICE':
      return 'Đã chuyển cuộc gọi sang thiết bị khác';
    case 'REMOVED_BY_HOST':
      return 'Bạn đã được mời ra khỏi phòng';
    case 'REVOKED':
    case 'ARCHIVED':
      return 'Bạn không còn quyền trong cuộc gọi này';
    case 'CONNECT_FAILED':
    case 'FAILED':
      return 'Không kết nối được cuộc gọi';
    case 'FORCE_ENDED':
    case 'HOST_ENDED':
    case 'EMPTY':
    case 'MAX_DURATION':
      return 'Cuộc gọi đã kết thúc';
    default:
      return 'Cuộc gọi đã kết thúc';
  }
}
