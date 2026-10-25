import { z } from "zod";
import { LIMITS } from "../../core/constants/limits";
import { meetsThresholds, thresholdGaps, type Threshold } from "./criteria-evaluator";

/**
 * Tiêu chí huy hiệu KỸ NĂNG (p6-06 README §2) — hàm thuần trên lõi ngưỡng dùng chung `criteria-evaluator.ts` (p4-03).
 *
 * Hai dạng:
 *  - HIỂN THỊ (API/admin): story points và điểm review thang 10 là số thực (`minStoryPoints: 2.5`, `minAvgPeerScore: 8`).
 *  - LƯU (`StoredSkillCriteria`, khớp type Prisma `SkillCriteria`): nhân 10 làm tròn thành số nguyên (`…X10`) — tránh sai số dấu phẩy động.
 * `requireReview` = MỌI task được tính phải có điểm chấm ⇒ số task đã qua chấm (`reviewScoreCount`) ≥ `requiredTasksDone`.
 */
export const skillCriteriaSchema = z
  .object({
    requiredTasksDone: z.number().int().min(LIMITS.skill.requiredTasksDoneMin).max(LIMITS.skill.requiredTasksDoneMax),
    minStoryPoints: z.number().min(0).max(LIMITS.skill.minStoryPointsMax).nullable().optional(),
    minAvgPeerScore: z.number().min(0).max(LIMITS.skill.peerScoreMax).nullable().optional(),
    requireReview: z.boolean(),
  })
  .strict();
export type SkillCriteriaInput = z.infer<typeof skillCriteriaSchema>;

export interface StoredSkillCriteria {
  requiredTasksDone: number;
  minStoryPointsX10: number | null;
  minAvgPeerScoreX10: number | null;
  requireReview: boolean;
}

export interface DisplaySkillCriteria {
  requiredTasksDone: number;
  minStoryPoints: number | null;
  minAvgPeerScore: number | null;
  requireReview: boolean;
}

/** Bộ số tổng hợp của một người cho một kỹ năng (`UserSkillProgress`). */
export interface SkillProgressValues {
  tasksDone: number;
  storyPointsX10: number;
  reviewScoreSumX10: number;
  reviewScoreCount: number;
}

export const toX10 = (v: number): number => Math.round(v * 10);
export const fromX10 = (v: number): number => v / 10;

const optX10 = (v: number | null | undefined): number | null => (v === null || v === undefined ? null : toX10(v));
const optFromX10 = (v: number | null): number | null => (v === null ? null : fromX10(v));

export function toStoredCriteria(c: SkillCriteriaInput): StoredSkillCriteria {
  return { requiredTasksDone: c.requiredTasksDone, minStoryPointsX10: optX10(c.minStoryPoints), minAvgPeerScoreX10: optX10(c.minAvgPeerScore), requireReview: c.requireReview };
}

export function toDisplayCriteria(c: StoredSkillCriteria): DisplaySkillCriteria {
  return { requiredTasksDone: c.requiredTasksDone, minStoryPoints: optFromX10(c.minStoryPointsX10), minAvgPeerScore: optFromX10(c.minAvgPeerScoreX10), requireReview: c.requireReview };
}

/** Điểm review trung bình ×10 (làm tròn); chưa có task nào được chấm → `null`. */
export function avgPeerScoreX10(p: Pick<SkillProgressValues, "reviewScoreSumX10" | "reviewScoreCount">): number | null {
  return p.reviewScoreCount > 0 ? Math.round(p.reviewScoreSumX10 / p.reviewScoreCount) : null;
}

function thresholds(c: StoredSkillCriteria, p: SkillProgressValues): Threshold[] {
  const avg = avgPeerScoreX10(p);
  return [
    { key: "tasks", current: p.tasksDone, min: c.requiredTasksDone },
    { key: "storyPointsX10", current: p.storyPointsX10, min: c.minStoryPointsX10 },
    // Chưa có điểm chấm nào mà tiêu chí đòi điểm TB → coi là 0 (chưa đạt), không phải "không áp dụng".
    { key: "peerScoreX10", current: avg ?? 0, min: c.minAvgPeerScoreX10 },
    { key: "reviewedTasks", current: p.reviewScoreCount, min: c.requireReview ? c.requiredTasksDone : null },
  ];
}

export function evaluateSkillCriteria(c: StoredSkillCriteria, p: SkillProgressValues): boolean {
  return meetsThresholds(thresholds(c, p));
}

export interface SkillRemaining {
  tasks: number;
  storyPointsX10: number;
  peerScoreX10: number;
  reviewedTasks: number;
}

/** Còn thiếu bao nhiêu để đạt (mỗi phần ≥ 0) — `SkillTrackerWidget` ("còn 12 task ReactJS · 3,5 điểm review"). */
export function skillRemaining(c: StoredSkillCriteria, p: SkillProgressValues): SkillRemaining {
  const g = thresholdGaps(thresholds(c, p));
  return { tasks: g.tasks ?? 0, storyPointsX10: g.storyPointsX10 ?? 0, peerScoreX10: g.peerScoreX10 ?? 0, reviewedTasks: g.reviewedTasks ?? 0 };
}

/** Tiêu chí mới KHÓ hơn bản cũ ở ít nhất một ngưỡng (admin hiện Callout "huy hiệu đã cấp không bị thu hồi" — CR-24). */
export function isCriteriaHarder(prev: StoredSkillCriteria, next: StoredSkillCriteria): boolean {
  const up = (a: number | null, b: number | null) => (b ?? 0) > (a ?? 0);
  return (
    next.requiredTasksDone > prev.requiredTasksDone ||
    up(prev.minStoryPointsX10, next.minStoryPointsX10) ||
    up(prev.minAvgPeerScoreX10, next.minAvgPeerScoreX10) ||
    (next.requireReview && !prev.requireReview)
  );
}
