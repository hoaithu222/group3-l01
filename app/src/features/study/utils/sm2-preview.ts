import type { SrRating } from '../api/sr.types';

/**
 * Bản THUẦN của SM-2 chỉ để HIỆN khoảng ôn dự kiến dưới mỗi nút (app.md p4-02 §2 `sm2-preview`) — KHÔNG quyết định gì:
 * lịch thật do server tính (`be/src/modules/study/services/sm2.ts`), app chỉ đọc kết quả. Giữ khớp công thức đó; lệch là
 * người dùng thấy "Dễ · 16 ngày" mà lần sau server hẹn ngày khác (test ST-07 khoá các con số).
 */
export interface Sm2Progress {
  easiness: number;
  interval: number;
  repetition: number;
}

/** q của từng nút: `AGAIN=1 · HARD=3 · GOOD=4 · EASY=5`. */
export const SR_GRADE: Readonly<Record<SrRating, number>> = { AGAIN: 1, EASY: 5, GOOD: 4, HARD: 3 };
export const SR_RATING_ORDER: readonly SrRating[] = ['AGAIN', 'HARD', 'GOOD', 'EASY'];
export const SR_EASINESS_FLOOR = 1.3;
/** BE `LIMITS.sr.intervalMaxDays`. */
export const SR_INTERVAL_MAX_DAYS = 365;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** `EF' = max(1.3, EF + 0.1 − (5−q)(0.08 + (5−q)·0.02))`. */
export function nextEasiness(easiness: number, q: number): number {
  const d = 5 - q;
  return Math.max(SR_EASINESS_FLOOR, round2(easiness + 0.1 - d * (0.08 + d * 0.02)));
}

/**
 * Trạng thái sau một lượt ôn. q < 3 ⇒ rơi lại học (`repetition 0`, `interval 1`); ngược lại `interval` đi 1 → 6 →
 * `round(interval × EF TRƯỚC lượt này)`, trần 365 (ST-07: 1 → 6 → 16 vì `round(6 × 2.7)`).
 */
export function applyReview(p: Sm2Progress, rating: SrRating): Sm2Progress {
  const q = SR_GRADE[rating];
  const easiness = nextEasiness(p.easiness, q);
  if (q < 3) return { easiness, interval: 1, repetition: 0 };
  const repetition = p.repetition + 1;
  let interval = Math.min(SR_INTERVAL_MAX_DAYS, Math.max(1, Math.round(p.interval * p.easiness)));
  if (repetition === 1) interval = 1;
  else if (repetition === 2) interval = 6;
  return { easiness, interval, repetition };
}

/** Khoảng ôn dự kiến (ngày) cho cả bốn nút. */
export function previewIntervals(p: Sm2Progress): Record<SrRating, number> {
  return {
    AGAIN: applyReview(p, 'AGAIN').interval,
    EASY: applyReview(p, 'EASY').interval,
    GOOD: applyReview(p, 'GOOD').interval,
    HARD: applyReview(p, 'HARD').interval,
  };
}

/** "1 ngày" · "16 ngày" · "2 tháng" · "1 năm" — dưới 30 ngày đếm ngày, dưới 365 làm tròn tháng. */
export function formatInterval(days: number): string {
  if (days < 30) return `${days} ngày`;
  if (days < SR_INTERVAL_MAX_DAYS) return `${Math.round(days / 30)} tháng`;
  return '1 năm';
}
