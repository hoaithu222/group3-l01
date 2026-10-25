import type { QuizScoreRowDto } from '../api/live-quiz.types';
import { mergeMyScore } from '../utils/leaderboard';

/**
 * BE gửi `me` riêng qua `user:{id}` là `{ rank, score }` — KHÔNG có `userId`. Thiếu `userId` thì bảng xếp hạng không nhận ra
 * dòng của mình trong top. `mergeMyScore` bù từ snapshot cũ hoặc từ người đăng nhập.
 */

const prev: QuizScoreRowDto = { cumulativeMs: 4_200, rank: 5, score: 1_200, userId: 'u-me' };

describe('mergeMyScore', () => {
  it('payload chỉ có rank/score ⇒ giữ userId + cumulativeMs của hàng cũ', () => {
    expect(mergeMyScore(prev, { rank: 2, score: 2_500 }, 'u-me')).toEqual({
      cumulativeMs: 4_200,
      rank: 2,
      score: 2_500,
      userId: 'u-me',
    });
  });

  it('snapshot chưa có `me` ⇒ dùng id người đăng nhập', () => {
    expect(mergeMyScore(null, { rank: 1, score: 900 }, 'u-me')).toEqual({
      cumulativeMs: 0,
      rank: 1,
      score: 900,
      userId: 'u-me',
    });
  });

  it('payload không nhắc tới `me` (bản gửi cả phòng) ⇒ giữ nguyên', () => {
    expect(mergeMyScore(prev, undefined, 'u-me')).toBe(prev);
  });

  it('`me: null` ⇒ xoá (tôi không còn trong bảng)', () => {
    expect(mergeMyScore(prev, null, 'u-me')).toBeNull();
  });

  it('không biết tôi là ai (chưa có snapshot, chưa có id) ⇒ giữ prev, không bịa userId rỗng', () => {
    expect(mergeMyScore(null, { rank: 1, score: 10 }, undefined)).toBeNull();
  });

  it('payload đủ trường ⇒ lấy của payload', () => {
    const full = { cumulativeMs: 100, rank: 1, score: 3_000, userId: 'u-me' };
    expect(mergeMyScore(prev, full, 'u-me')).toEqual(full);
  });
});
