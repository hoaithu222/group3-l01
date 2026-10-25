import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

/** Một ô "Thành tích" ở Trang chủ: bộ đếm `counters` của `GET /me/gamification` + cách vẽ nó. */
export interface AchievementStat {
  icon: IconName;
  key: string;
  label: string;
  tone: IconTileTone;
  value: number;
}

/** Số ô tối đa của lưới 2×2. */
export const ACHIEVEMENT_GRID_LIMIT = 4;

/**
 * Bộ đếm CÓ NGHĨA với người dùng, theo thứ tự ưu tiên (khoá theo BE `STORED_COUNTER_KEYS`). Bỏ `srReviewDays` (số ngày
 * ôn — trùng ý với chuỗi) và `longestStreak` (đã ở thẻ chuỗi). Ô có giá trị 0 bị ẩn (`pickAchievementStats`), nên một
 * người chưa làm bài thi nào không thấy ô "Bài thi đạt 0" — không bịa số 0 để lấp chỗ.
 */
const STAT_DEFS: readonly Omit<AchievementStat, 'value'>[] = [
  { icon: 'checkmark-circle', key: 'tasksDone', label: 'Việc hoàn thành', tone: 'success' },
  { icon: 'clock', key: 'tasksOnTime', label: 'Đúng hạn', tone: 'info' },
  { icon: 'document', key: 'quizzesPassed', label: 'Bài thi đạt', tone: 'accent' },
  { icon: 'book', key: 'srReviews', label: 'Lượt ôn thẻ', tone: 'brand' },
  { icon: 'star', key: 'quizHighScores', label: 'Bài thi điểm cao', tone: 'accent' },
  { icon: 'chat-bubble', key: 'reviewsGiven', label: 'Nhận xét đã gửi', tone: 'info' },
  { icon: 'upload', key: 'setsPublished', label: 'Bộ thẻ đã đăng', tone: 'success' },
];

/** Lấy tối đa `limit` bộ đếm khác 0 (theo thứ tự ưu tiên). Tất cả bằng 0 ⇒ mảng rỗng ⇒ nơi gọi ẩn cả khối. */
export function pickAchievementStats(
  counters: Readonly<Record<string, number>>,
  limit: number = ACHIEVEMENT_GRID_LIMIT,
): AchievementStat[] {
  return STAT_DEFS.flatMap((def) => {
    const value = counters[def.key] ?? 0;
    return value > 0 ? [{ ...def, value }] : [];
  }).slice(0, limit);
}
