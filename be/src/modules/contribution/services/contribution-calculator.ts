import type { ContributionConfigValue, ContributionWeights } from "../../../core/constants/contribution";
import { addDaysToLocalDate, localDate, startOfLocalDateKey } from "../../../core/utils/local-date";
import type { ContributionComponents, ContributionTotals, MemberContribution } from "../entities/contribution.interface";
import { allocateShares } from "./contribution-shares";

export { allocateShares };

/**
 * Bộ tính điểm đóng góp — HÀM THUẦN (không I/O), công thức D-09 (README p4-06 §2, be.md §5.3):
 *   cPoints = SP(u) / max SP(thành viên)     cOnTime = đúng hạn / có hạn     cPeer = điểm chấm TB / 10
 *   score   = 100 × Σ wᵢ·cᵢ / Σ wᵢ  (chỉ trên thành phần CÓ dữ liệu — N/A thì trọng số chia lại)
 *   share   = score / Σ score        (1 chữ số, phần dư lớn nhất để tổng đúng 100,0; hoà → theo userId)
 */
export interface CalcTask {
  taskId: string;
  assigneeIds: readonly string[];
  storyPoints: number | null;
  dueDate: Date | null;
  completedAt: Date;
}

export interface CalcReview {
  assigneeIds: readonly string[];
  score10: number | null;
}

export interface CalcInput {
  /** Fact thẻ `active` trong kỳ. */
  tasks: readonly CalcTask[];
  /** Fact lượt chấm trong kỳ. */
  reviews: readonly CalcReview[];
  config: ContributionConfigValue;
  /** Thành viên hiện tại (ACTIVE, không GUEST) — luôn có dòng dù chưa đóng góp; người chỉ có trong fact vẫn được thêm. */
  memberIds: readonly string[];
  timezone: string;
}

export interface CalcResult {
  members: MemberContribution[];
  totals: ContributionTotals;
  /** Điểm thẻ của người nhiều nhất nhóm (mẫu số của `cPoints`), 0 khi chưa ai có điểm. */
  maxStoryPoints: number;
}

const HOUR_MS = 3_600_000;

export const round1 = (x: number): number => Math.round((x + Number.EPSILON) * 10) / 10;
export const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

/**
 * Thời điểm hết hạn (mốc LOẠI TRỪ) để tính đúng hạn: 00:00 ngày kế tiếp của ngày hạn (theo `tz`) + `graceHours`. Thẻ hoàn thành
 * TRƯỚC mốc này là đúng hạn, tức `completedAt ≤ cuối ngày hạn + grace`.
 */
export function onTimeDeadline(dueDate: Date, timezone: string, graceHours: number, cache?: Map<string, number>): number {
  const dayKey = localDate(dueDate, timezone);
  let endOfDay = cache?.get(dayKey);
  if (endOfDay === undefined) {
    endOfDay = startOfLocalDateKey(addDaysToLocalDate(dayKey, 1), timezone).getTime();
    cache?.set(dayKey, endOfDay);
  }
  return endOfDay + graceHours * HOUR_MS;
}

/** `true`/`false` khi thẻ có hạn; `null` khi không có hạn (không vào thành phần đúng hạn). */
export function isOnTime(completedAt: Date, dueDate: Date | null, timezone: string, graceHours: number): boolean | null {
  if (!dueDate) return null;
  return completedAt.getTime() < onTimeDeadline(dueDate, timezone, graceHours);
}

interface Accumulator {
  sp: number;
  tasksDone: number;
  unestimated: number;
  withDue: number;
  onTime: number;
  late: number;
  reviewSum: number;
  reviewCount: number;
}

const emptyAcc = (): Accumulator => ({ sp: 0, tasksDone: 0, unestimated: 0, withDue: 0, onTime: 0, late: 0, reviewSum: 0, reviewCount: 0 });

const NO_WEIGHTS: ContributionWeights = { points: 0, onTime: 0, peer: 0 };

function creditTasks(input: CalcInput, acc: (id: string) => Accumulator): ContributionTotals {
  const totals: ContributionTotals = { storyPointsDone: 0, tasksDone: 0 };
  const deadlines = new Map<string, number>();
  for (const task of input.tasks) {
    const assignees = [...new Set(task.assigneeIds)];
    if (assignees.length === 0) continue;
    const points = task.storyPoints ?? input.config.unestimatedPoints;
    const deadline = task.dueDate ? onTimeDeadline(task.dueDate, input.timezone, input.config.onTimeGraceHours, deadlines) : null;
    totals.tasksDone += 1;
    totals.storyPointsDone += points;
    for (const id of assignees) {
      const a = acc(id);
      a.sp += points / assignees.length;
      a.tasksDone += 1;
      if (task.storyPoints === null) a.unestimated += 1;
      if (deadline !== null) {
        a.withDue += 1;
        if (task.completedAt.getTime() < deadline) a.onTime += 1;
        else a.late += 1;
      }
    }
  }
  totals.storyPointsDone = round2(totals.storyPointsDone);
  return totals;
}

function creditReviews(reviews: readonly CalcReview[], acc: (id: string) => Accumulator): void {
  for (const review of reviews) {
    if (review.score10 === null) continue;
    for (const id of new Set(review.assigneeIds)) {
      const a = acc(id);
      a.reviewSum += review.score10;
      a.reviewCount += 1;
    }
  }
}

function componentsOf(a: Accumulator, maxSp: number): ContributionComponents {
  return {
    points: maxSp > 0 ? a.sp / maxSp : null,
    onTime: a.withDue > 0 ? a.onTime / a.withDue : null,
    peer: a.reviewCount > 0 ? Math.min(1, Math.max(0, a.reviewSum / a.reviewCount / 10)) : null,
  };
}

/** Điểm 0..100 (1 chữ số) + trọng số đã chia lại cho thành phần có dữ liệu. */
export function scoreOf(components: ContributionComponents, weights: ContributionWeights): { score: number; weightsUsed: ContributionWeights } {
  const keys = ["points", "onTime", "peer"] as const;
  let sumW = 0;
  let sum = 0;
  for (const k of keys) {
    const c = components[k];
    if (c === null) continue;
    sumW += weights[k];
    sum += weights[k] * c;
  }
  if (sumW <= 0) return { score: 0, weightsUsed: NO_WEIGHTS };
  const weightsUsed = { ...NO_WEIGHTS };
  for (const k of keys) if (components[k] !== null) weightsUsed[k] = round1((weights[k] * 100) / sumW);
  return { score: round1((100 * sum) / sumW), weightsUsed };
}

export function calculateContribution(input: CalcInput): CalcResult {
  const acc = new Map<string, Accumulator>();
  const of = (id: string): Accumulator => {
    let a = acc.get(id);
    if (!a) {
      a = emptyAcc();
      acc.set(id, a);
    }
    return a;
  };
  for (const id of input.memberIds) of(id);

  const totals = creditTasks(input, of);
  creditReviews(input.reviews, of);

  const maxSp = Math.max(0, ...[...acc.values()].map((a) => a.sp));
  const scored = [...acc].map(([userId, a]) => {
    const components = componentsOf(a, maxSp);
    return { userId, a, components, ...scoreOf(components, input.config.weights) };
  });
  const shares = allocateShares(new Map(scored.map((s) => [s.userId, Math.round(s.score * 10)])));

  const members: MemberContribution[] = scored.map(({ userId, a, components, score, weightsUsed }) => ({
    userId,
    storyPointsDone: round2(a.sp),
    tasksDone: a.tasksDone,
    unestimatedTasks: a.unestimated,
    tasksWithDue: a.withDue,
    tasksOnTime: a.onTime,
    tasksLate: a.late,
    reviewCount: a.reviewCount,
    peerScoreAvg: a.reviewCount > 0 ? round1(a.reviewSum / a.reviewCount) : null,
    components,
    weightsUsed,
    score,
    share: shares.get(userId) ?? 0,
  }));
  members.sort((x, y) => y.score - x.score || (x.userId < y.userId ? -1 : 1));
  return { members, totals, maxStoryPoints: round2(maxSp) };
}
