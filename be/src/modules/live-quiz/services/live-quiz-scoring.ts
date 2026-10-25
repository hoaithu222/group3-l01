import { LIMITS } from "../../../core/constants/limits";
import type { LiveQuizScoring } from "../entities/live-quiz.interface";

/**
 * Hàm THUẦN tính điểm live quiz (p5-01 be.md §5) — dùng chung với `answer.lua` (cùng công thức, cùng phép toán số thực IEEE-754
 * nên Lua và JS ra CÙNG số nguyên) và job ghi kết quả bền (tính lại điểm từng câu từ đáp án đã lưu).
 */

/** Điểm ZSET = `score * TIEBREAK_BASE + (TIEBREAK_BASE − 1 − cumulativeMs)` — cùng điểm thì ai đúng nhanh hơn (tổng ms nhỏ hơn) xếp trên. */
export const TIEBREAK_BASE = 10_000_000;
/** Điểm ZSET của người mới vào (score 0, cumulativeMs 0) — `− 1` để `floor(c / BASE)` luôn ra đúng `score`. */
export const INITIAL_COMPOSITE = TIEBREAK_BASE - 1;

/** Đúng: `base + floor(speedBonus × (1 − elapsed/span))`, `elapsed` kẹp `[0, span]`; sai/không trả lời: 0. */
export function computePoints(correct: boolean, elapsedMs: number, secondsPerQuestion: number, scoring: LiveQuizScoring): number {
  if (!correct) return 0;
  const span = secondsPerQuestion * 1000;
  const e = Math.min(Math.max(elapsedMs, 0), span);
  return scoring.base + Math.floor(scoring.speedBonus * (1 - e / span));
}

export function decodeComposite(composite: number): { score: number; cumulativeMs: number } {
  const score = Math.floor(composite / TIEBREAK_BASE);
  return { score, cumulativeMs: TIEBREAK_BASE - 1 - (composite - score * TIEBREAK_BASE) };
}

/** Tỉ lệ đúng (0–100, 2 chữ số thập phân) — đầu vào `quiz.scored.scorePct` của gamification (p4-03). */
export function scorePercent(correct: number, totalQuestions: number): number {
  if (totalQuestions <= 0) return 0;
  return Math.round((correct / totalQuestions) * 10_000) / 100;
}

/** "Đạt" của live quiz dùng CÙNG ngưỡng mặc định với thi thử (`LIMITS.mock.passPctDefault`). */
export function isPassing(scorePct: number): boolean {
  return scorePct >= LIMITS.mock.passPctDefault;
}
