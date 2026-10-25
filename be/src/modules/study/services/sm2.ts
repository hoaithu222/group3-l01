import { LIMITS } from "../../../core/constants/limits";
import { startOfLocalDayPlus } from "./local-date";

/**
 * SM-2 THUẦN (p4-02 README §2/be.md §5.5) — không I/O, tất định. 4 nút → q: `AGAIN=1 · HARD=3 · GOOD=4 · EASY=5`.
 * `EF' = max(1.3, EF + 0.1 − (5−q)(0.08 + (5−q)·0.02))`; q < 3 → `repetition = 0, interval = 1` (rơi lại học); ngược lại
 * interval `1 → 6 → round(interval × EF TRƯỚC lượt này)`, trần `LIMITS.sr.intervalMaxDays`. `nextReviewAt` = 00:00 ngày
 * địa phương `+interval` (không phải `now + interval×24h`) để thẻ luôn rơi vào đầu ngày.
 */
export const SR_RATINGS = ["AGAIN", "HARD", "GOOD", "EASY"] as const;
export type SrRatingValue = (typeof SR_RATINGS)[number];

export const SR_STATUSES = ["NEW", "LEARNING", "REVIEW", "SUSPENDED"] as const;
export type SrStatusValue = (typeof SR_STATUSES)[number];

export const RATING_GRADE: Readonly<Record<SrRatingValue, number>> = { AGAIN: 1, HARD: 3, GOOD: 4, EASY: 5 };
/** q dùng khi câu sai trong thi thử rơi vào thẻ đã có tiến độ (giữa AGAIN và HARD). */
export const LAPSE_GRADE = 2;

export const EASINESS_FLOOR = 1.3;
export const EASINESS_DEFAULT = 2.5;

export interface SrState {
  status: SrStatusValue;
  easiness: number;
  interval: number;
  repetition: number;
  lapses: number;
  nextReviewAt: Date;
  lastRating: SrRatingValue | null;
  lastReviewedAt: Date | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function nextEasiness(easiness: number, q: number): number {
  const d = 5 - q;
  return Math.max(EASINESS_FLOOR, round2(easiness + 0.1 - d * (0.08 + d * 0.02)));
}

/** Chỉ trả ĐÚNG các trường của `SrState` (đầu vào có thể là `SrProgress` đầy đủ — không được lọt `id`/`version`… vào patch ghi DB). */
function apply(p: SrState, q: number, rating: SrRatingValue | null, now: Date, tz: string, maxInterval: number): SrState {
  const nextEf = nextEasiness(p.easiness, q);
  if (q < 3) {
    return {
      status: "LEARNING",
      repetition: 0,
      interval: 1,
      lapses: p.lapses + 1,
      easiness: nextEf,
      nextReviewAt: startOfLocalDayPlus(now, tz, 1),
      lastRating: rating ?? p.lastRating,
      lastReviewedAt: rating ? now : p.lastReviewedAt,
    };
  }
  const repetition = p.repetition + 1;
  const interval = repetition === 1 ? 1 : repetition === 2 ? 6 : Math.min(maxInterval, Math.max(1, Math.round(p.interval * p.easiness)));
  return {
    status: "REVIEW",
    repetition,
    interval,
    lapses: p.lapses,
    easiness: nextEf,
    nextReviewAt: startOfLocalDayPlus(now, tz, interval),
    lastRating: rating,
    lastReviewedAt: now,
  };
}

/** Một lượt ôn với nút `rating`. */
export function review(p: SrState, rating: SrRatingValue, now: Date, tz: string, maxInterval: number = LIMITS.sr.intervalMaxDays): SrState {
  return apply(p, RATING_GRADE[rating], rating, now, tz, maxInterval);
}

/** Câu sai trong thi thử vào thẻ đã có tiến độ: như q = 2 (rơi lại học, không đổi `lastRating`/`lastReviewedAt`). */
export function lapse(p: SrState, now: Date, tz: string): SrState {
  return apply(p, LAPSE_GRADE, null, now, tz, LIMITS.sr.intervalMaxDays);
}

/** Tiến độ khởi tạo cho thẻ SAI lần đầu trong thi thử (`interval 1`, hẹn 00:00 ngày mai). */
export function initialWrongState(now: Date, tz: string): SrState {
  return {
    status: "LEARNING",
    easiness: EASINESS_DEFAULT,
    interval: 1,
    repetition: 0,
    lapses: 0,
    nextReviewAt: startOfLocalDayPlus(now, tz, 1),
    lastRating: null,
    lastReviewedAt: null,
  };
}

/** Tiến độ khởi tạo cho thẻ MỚI (đăng ký ôn cả bộ) — `nextReviewAt = now`. */
export function initialNewState(now: Date): SrState {
  return {
    status: "NEW",
    easiness: EASINESS_DEFAULT,
    interval: 0,
    repetition: 0,
    lapses: 0,
    nextReviewAt: now,
    lastRating: null,
    lastReviewedAt: null,
  };
}

/**
 * Trạng thái khôi phục khi thẻ bị tạm ngừng (mất quyền) được mở lại: chưa từng có khoảng ôn (`interval 0`) → `NEW`;
 * đang rơi lại học (`repetition 0`, gồm thẻ sai từ thi thử `interval 1`) → `LEARNING`; còn lại `REVIEW`.
 */
export function resumeStatus(p: Pick<SrState, "interval" | "repetition">): SrStatusValue {
  if (p.interval === 0) return "NEW";
  return p.repetition === 0 ? "LEARNING" : "REVIEW";
}
