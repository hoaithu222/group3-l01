import {
  avgPeerScoreX10,
  evaluateSkillCriteria,
  fromX10,
  skillRemaining,
  toDisplayCriteria,
  type DisplaySkillCriteria,
  type SkillProgressValues,
} from "../../../shared/criteria/skill-criteria";
import type { SkillCategory, SkillDefinition, UserSkillBadge, UserSkillProgress } from "../entities/skill.interface";

/** DTO trả client (app/admin) — số hiển thị (không còn ×10). Minh chứng chi tiết đi qua endpoint `…/proof` riêng (lọc theo người xem). */
export interface SkillSummaryDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: SkillCategory;
  icon: string;
}

export interface SkillProgressDto {
  tasksDone: number;
  storyPoints: number;
  avgPeerScore: number | null;
  reviewedTasks: number;
  achieved: boolean;
  remaining: { tasks: number; storyPoints: number; peerScore: number; reviewedTasks: number };
}

export interface SkillBadgeStateDto {
  unlockedAt: string;
  revoked: boolean;
}

export interface SkillCatalogItemDto extends SkillSummaryDto {
  labelMatch: string[];
  criteria: DisplaySkillCriteria;
  order: number;
  myProgress: SkillProgressDto;
  myBadge: SkillBadgeStateDto | null;
}

export interface SkillBadgeDto {
  skill: SkillSummaryDto;
  unlockedAt: string;
  revoked: boolean;
  /** Chỉ chính chủ thấy huy hiệu bị thu hồi — câu trung tính, KHÔNG lộ lý do nội bộ của vận hành. */
  revokedNotice: string | null;
  proof: { tasksDone: number; storyPoints: number; avgPeerScore: number | null };
}

export const REVOKED_NOTICE = "Huy hiệu đã được thu hồi sau rà soát";

const EMPTY: SkillProgressValues = { tasksDone: 0, storyPointsX10: 0, reviewScoreSumX10: 0, reviewScoreCount: 0 };

export function presentSummary(s: SkillDefinition): SkillSummaryDto {
  return { id: s.id, code: s.code, name: s.name, description: s.description, category: s.category, icon: s.icon };
}

export function presentProgress(s: SkillDefinition, p: SkillProgressValues | null): SkillProgressDto {
  const v = p ?? EMPTY;
  const avg = avgPeerScoreX10(v);
  const r = skillRemaining(s.criteria, v);
  return {
    tasksDone: v.tasksDone,
    storyPoints: fromX10(v.storyPointsX10),
    avgPeerScore: avg === null ? null : fromX10(avg),
    reviewedTasks: v.reviewScoreCount,
    achieved: evaluateSkillCriteria(s.criteria, v),
    remaining: { tasks: r.tasks, storyPoints: fromX10(r.storyPointsX10), peerScore: fromX10(r.peerScoreX10), reviewedTasks: r.reviewedTasks },
  };
}

export function presentBadgeState(b: UserSkillBadge | undefined): SkillBadgeStateDto | null {
  return b ? { unlockedAt: b.unlockedAt.toISOString(), revoked: b.revokedAt !== null } : null;
}

export function presentCatalogItem(s: SkillDefinition, p: UserSkillProgress | null | undefined, b: UserSkillBadge | undefined): SkillCatalogItemDto {
  return {
    ...presentSummary(s),
    labelMatch: [...s.labelMatch],
    criteria: toDisplayCriteria(s.criteria),
    order: s.order,
    myProgress: presentProgress(s, p ?? null),
    myBadge: presentBadgeState(b),
  };
}

export function presentBadge(s: SkillDefinition, b: UserSkillBadge): SkillBadgeDto {
  return {
    skill: presentSummary(s),
    unlockedAt: b.unlockedAt.toISOString(),
    revoked: b.revokedAt !== null,
    revokedNotice: b.revokedAt ? REVOKED_NOTICE : null,
    proof: {
      tasksDone: b.proof.tasksDone,
      storyPoints: fromX10(b.proof.storyPointsX10),
      avgPeerScore: b.proof.avgPeerScoreX10 === null ? null : fromX10(b.proof.avgPeerScoreX10),
    },
  };
}
