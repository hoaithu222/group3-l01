import { pickAchievementStats } from '../utils/achievement-stats';

/** Lưới "Thành tích" 2×2: chỉ bộ đếm khác 0, theo thứ tự ưu tiên, tối đa 4 ô. */
describe('pickAchievementStats', () => {
  it('tất cả bằng 0 (hoặc thiếu khoá) ⇒ rỗng — nơi gọi ẩn cả khối', () => {
    expect(pickAchievementStats({})).toEqual([]);
    expect(pickAchievementStats({ tasksDone: 0, srReviews: 0, longestStreak: 9 })).toEqual([]);
  });

  it('ẩn ô bằng 0, giữ thứ tự ưu tiên, tối đa 4 ô', () => {
    const stats = pickAchievementStats({
      quizzesPassed: 2,
      reviewsGiven: 1,
      srReviews: 30,
      tasksDone: 12,
      tasksOnTime: 0,
    });

    expect(stats.map((s) => [s.key, s.value])).toEqual([
      ['tasksDone', 12],
      ['quizzesPassed', 2],
      ['srReviews', 30],
      ['reviewsGiven', 1],
    ]);
  });

  it('nhiều hơn 4 bộ đếm khác 0 ⇒ cắt ở 4 (lưới 2×2)', () => {
    const stats = pickAchievementStats({
      quizHighScores: 1,
      quizzesPassed: 1,
      reviewsGiven: 1,
      setsPublished: 1,
      srReviews: 1,
      tasksDone: 1,
      tasksOnTime: 1,
    });

    expect(stats.map((s) => s.key)).toEqual([
      'tasksDone',
      'tasksOnTime',
      'quizzesPassed',
      'srReviews',
    ]);
  });
});
