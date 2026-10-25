import type { AdminLiveQuizSession } from '../types/live-quiz-ops.types';

/** Mã rút gọn của một id: `#` + 6 ký tự cuối (đủ phân biệt trong danh sách, không phơi id đầy đủ trên bảng). */
export const shortId = (id: string): string => `#${id.slice(-6)}`;

/**
 * Tiến độ câu hỏi: "3 / 10". Sảnh chờ chưa mở câu nào → "— / 10". `currentIndex` đếm từ 0 và BE có thể để nó bằng
 * `total` khi đã hết câu, nên kẹp lại để không hiện "11 / 10".
 */
export function progressLabel(
  session: Pick<AdminLiveQuizSession, 'status' | 'currentIndex' | 'total'>,
): string {
  if (session.status === 'WAITING') return `— / ${session.total}`;
  return `${Math.min(session.currentIndex + 1, session.total)} / ${session.total}`;
}
