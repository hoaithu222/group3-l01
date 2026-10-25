import type { SkillSummary } from '@/shared/career';

export type { SkillBadge, SkillProof, SkillSummary } from '@/shared/career';

/**
 * DTO của p6-06 — khớp `be/src/modules/career/services/skill.presenter.ts` (`SkillCatalogItemDto`) và
 * `career-profile.service.ts` (`CareerDto`). Điểm ở đơn vị HIỂN THỊ (BE đã chia 10).
 */
export interface SkillCriteria {
  requiredTasksDone: number;
  /** `null` = không áp dụng. */
  minStoryPoints: number | null;
  minAvgPeerScore: number | null;
  requireReview: boolean;
}

export interface SkillProgress {
  tasksDone: number;
  storyPoints: number;
  avgPeerScore: number | null;
  /** Số task đã qua chấm chéo (tiêu chí "qua review"). */
  reviewedTasks: number;
  achieved: boolean;
  remaining: { tasks: number; storyPoints: number; peerScore: number; reviewedTasks: number };
}

export interface SkillCatalogItem extends SkillSummary {
  /** Nhãn khớp đã chuẩn hoá ("nodejs"). */
  labelMatch: string[];
  criteria: SkillCriteria;
  order: number;
  myProgress: SkillProgress;
  myBadge: { unlockedAt: string; revoked: boolean } | null;
}

export interface CareerVisibility {
  showSkills: boolean;
  proofTitles: boolean;
  showContribution: boolean;
  showQuiz: boolean;
  appearInOthersPortfolios: boolean;
}

export interface CareerProfile {
  openToWork: boolean;
  headline: string | null;
  preferredRoles: string[];
  location: string | null;
  visibility: CareerVisibility;
}

/** Socket `skill:unlocked` (`user:{id}`) — payload v1. */
export interface SkillUnlockedEvent {
  v: number;
  skillId: string;
  code: string;
  name: string;
  icon: string;
  unlockedAt: string;
}
