import type { StoredAnswer, StoredReveal } from '../store/live-quiz.store';

interface StreakSource {
  answers: Record<number, StoredAnswer>;
  reveals: Record<number, StoredReveal>;
  sessionId: string | null;
}

/**
 * Chuỗi câu ĐÚNG liên tiếp tính tới câu `index` (kể cả câu này), từ những gì máy này ĐÃ THẤY (`live-quiz.store`). BE không trả
 * chuỗi, nên đây là số suy ra: vào phòng muộn hoặc mở lại app giữa phiên thì câu cũ thiếu đáp án công bố ⇒ chuỗi ĐẾM THIẾU chứ
 * không bao giờ đếm thừa (câu thiếu dữ liệu ngắt chuỗi, không đoán). `currentCorrect` là đáp án công bố của câu hiện tại lấy từ
 * snapshot — phòng khi store chưa kịp ghi.
 */
export function answerStreak(
  source: StreakSource,
  sessionId: string,
  index: number,
  currentCorrect: number | null,
): number {
  if (source.sessionId !== sessionId) return 0;
  let streak = 0;
  for (let i = index; i >= 0; i -= 1) {
    const correct =
      i === index ? (currentCorrect ?? source.reveals[i]?.correct) : source.reveals[i]?.correct;
    const mine = source.answers[i]?.choice;
    if (correct === null || correct === undefined || mine !== correct) break;
    streak += 1;
  }
  return streak;
}
