import { useLiveQuizHistory } from '../queries/live-quiz.queries';

/**
 * `setId` của bộ học đã dùng trong phiên `sessionId`, tra từ lịch sử thi của tôi — CHỈ còn là đường lùi cho server cũ: BE nay trả
 * `setId`/`setTitle` ngay ở `GET /live-quiz/:id/results` và snapshot (màn kết quả truyền vào `WrongAnswersCard` qua prop
 * `setId`, `enabled = false` ⇒ không gọi mạng). Phiên vừa kết thúc luôn nằm ở trang đầu lịch sử. Không thấy ⇒ `undefined`.
 */
export function useResultSetId(sessionId: string, enabled: boolean): string | undefined {
  const history = useLiveQuizHistory(enabled);
  return history.data?.pages
    .flatMap((page) => page.items)
    .find((item) => item.sessionId === sessionId)?.setId;
}
