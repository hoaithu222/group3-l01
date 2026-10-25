import type { QuizScoreRowDto } from '../api/live-quiz.types';

/**
 * Gộp `me` của `quiz:leaderboard` (BE chỉ gửi `{ rank, score }`) vào hàng của tôi đã có trong snapshot. Thiếu `userId`
 * thì `LiveLeaderboard` không nhận ra dòng của mình trong top (nhấn nền sai, lại in thêm một dòng "bạn" ở đáy). Chưa biết
 * tôi là ai (snapshot chưa có, chưa đăng nhập) ⇒ giữ nguyên `prev`.
 */
export function mergeMyScore(
  prev: QuizScoreRowDto | null,
  incoming: Partial<QuizScoreRowDto> | null | undefined,
  myId: string | undefined,
): QuizScoreRowDto | null {
  if (incoming === undefined) return prev;
  if (incoming === null) return null;
  const userId = incoming.userId ?? prev?.userId ?? myId;
  if (!userId) return prev;
  return {
    cumulativeMs: incoming.cumulativeMs ?? prev?.cumulativeMs ?? 0,
    rank: incoming.rank ?? prev?.rank ?? 0,
    score: incoming.score ?? prev?.score ?? 0,
    userId,
  };
}
