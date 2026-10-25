/**
 * Kiểu admin kỹ năng — viết tay theo BE thật (`be/src/modules/career`: `services/skill-admin.presenter.ts` `AdminSkillDto`,
 * `services/skill-preview.service.ts` `EligiblePreviewDto`, `services/skill-badge-admin.service.ts` `AdminUserSkillRow`,
 * `services/skill-query.service.ts` `AdminProofDto`). Điểm ở đơn vị HIỂN THỊ (BE đã chia 10).
 */
export type SkillCategory =
  'FRONTEND' | 'BACKEND' | 'MOBILE' | 'DATA' | 'DESIGN' | 'DEVOPS' | 'QA' | 'SOFT';

export interface SkillCriteria {
  requiredTasksDone: number;
  /** `null` = không áp dụng. */
  minStoryPoints: number | null;
  minAvgPeerScore: number | null;
  requireReview: boolean;
}

export interface AdminSkill {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: SkillCategory;
  /** Đã chuẩn hoá (`normalizeSkillLabel`). */
  labelMatch: string[];
  criteria: SkillCriteria;
  icon: string;
  isActive: boolean;
  order: number;
  version: number;
  holdersCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSkillsParams {
  page: number;
  limit: number;
  q?: string;
  category?: SkillCategory;
  active?: 'true' | 'false';
}

export interface SkillPayloadBase {
  name: string;
  description: string | null;
  category: SkillCategory;
  labelMatch: string[];
  criteria: SkillCriteria;
  icon: string;
  order: number;
}

export interface CreateSkillPayload extends SkillPayloadBase {
  code: string;
}

export interface UpdateSkillPayload extends Partial<SkillPayloadBase> {
  id: string;
  expectedVersion: number;
  reason?: string;
}

export interface EligiblePreview {
  eligibleCount: number;
  /** Đã có huy hiệu (kể cả đã thu hồi — không cấp lại). */
  alreadyHolding: number;
  willGrant: number;
  sampleUserIds: string[];
}

export interface LabelSuggestion {
  name: string;
  normalized: string;
  count: number;
}

export interface SkillProgress {
  tasksDone: number;
  storyPoints: number;
  avgPeerScore: number | null;
  reviewedTasks: number;
  achieved: boolean;
  remaining: { tasks: number; storyPoints: number; peerScore: number; reviewedTasks: number };
}

export interface AdminBadgeState {
  unlockedAt: string;
  revokedAt: string | null;
  revokedBy: { id: string; name: string } | null;
  revokedReason: string | null;
}

export interface AdminUserSkillRow {
  skill: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    category: SkillCategory;
    icon: string;
    isActive: boolean;
    criteria: SkillCriteria;
  };
  progress: SkillProgress;
  badge: AdminBadgeState | null;
}

export interface AdminSkillProof {
  skill: { id: string; code: string; name: string };
  unlockedAt: string;
  revoked: boolean;
  tasksDone: number;
  storyPoints: number;
  avgPeerScore: number | null;
  criteriaSnapshot: SkillCriteria;
  /** CHỈ id rút gọn — admin không đọc tiêu đề/nội dung task của nhóm. */
  tasks: Array<{
    taskRef: string;
    storyPoints: number;
    completedAt: string;
    reviewScore: number | null;
    active: boolean;
  }>;
}

export interface ReevaluateResult {
  jobId: string;
  skills: number;
}
