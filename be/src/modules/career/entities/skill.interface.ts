import type { StoredSkillCriteria } from "../../../shared/criteria/skill-criteria";

/**
 * Thực thể huy hiệu kỹ năng xác thực (p6-06 README §4). Khác `Badge`/`UserBadge` của gamification (thành tích chung): kỹ năng có MINH CHỨNG
 * từ task thật (`UserSkillTaskCredit`) và người xem khác (thành viên nhóm, nhà tuyển dụng p6-08, portfolio p6-07).
 */
export const SKILL_CATEGORIES = ["FRONTEND", "BACKEND", "MOBILE", "DATA", "DESIGN", "DEVOPS", "QA", "SOFT"] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export type SkillCreditStatus = "ACTIVE" | "REVOKED";

export interface SkillDefinition {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: SkillCategory;
  /** Đã `normalizeSkillLabel`. */
  labelMatch: string[];
  criteria: StoredSkillCriteria;
  icon: string;
  isActive: boolean;
  order: number;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSkillProgress {
  userId: string;
  skillId: string;
  tasksDone: number;
  storyPointsX10: number;
  reviewScoreSumX10: number;
  reviewScoreCount: number;
  lastTaskAt: Date | null;
}

export interface UserSkillTaskCredit {
  id: string;
  userId: string;
  skillId: string;
  taskId: string;
  workspaceId: string;
  storyPointsX10: number;
  reviewScoreX10: number | null;
  completedAt: Date;
  completionCount: number;
  status: SkillCreditStatus;
}

export interface SkillProof {
  taskCreditIds: string[];
  tasksDone: number;
  storyPointsX10: number;
  avgPeerScoreX10: number | null;
}

export interface UserSkillBadge {
  id: string;
  userId: string;
  skillId: string;
  unlockedAt: Date;
  proof: SkillProof;
  criteriaSnapshot: StoredSkillCriteria;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokedReason: string | null;
}

/** Thay đổi cộng dồn vào `UserSkillProgress` (âm khi mở lại task). */
export interface ProgressDelta {
  tasksDone: number;
  storyPointsX10: number;
  reviewScoreSumX10: number;
  reviewScoreCount: number;
  lastTaskAt?: Date;
}

export const ZERO_DELTA: ProgressDelta = { tasksDone: 0, storyPointsX10: 0, reviewScoreSumX10: 0, reviewScoreCount: 0 };

/** Delta của MỘT credit (dấu `sign` = +1 khi tính, −1 khi gỡ). */
export function creditDelta(c: Pick<UserSkillTaskCredit, "storyPointsX10" | "reviewScoreX10">, sign: 1 | -1): ProgressDelta {
  return {
    tasksDone: sign,
    storyPointsX10: sign * c.storyPointsX10,
    reviewScoreSumX10: sign * (c.reviewScoreX10 ?? 0),
    reviewScoreCount: c.reviewScoreX10 === null ? 0 : sign,
  };
}

export const isZeroDelta = (d: ProgressDelta): boolean =>
  d.tasksDone === 0 && d.storyPointsX10 === 0 && d.reviewScoreSumX10 === 0 && d.reviewScoreCount === 0;
