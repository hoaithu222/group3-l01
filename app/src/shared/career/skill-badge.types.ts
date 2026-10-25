/**
 * Kiểu HIỂN THỊ dùng chung của huy hiệu kỹ năng xác thực (p6-06) — khớp DTO BE `be/src/modules/career/services/skill.presenter.ts`
 * (`SkillBadgeDto`) và `skill-query.service.ts` (`SkillProofDto`). Đặt ở `@/shared/career` vì p6-03 (mentor), p6-07 (portfolio), p6-08
 * (nhà tuyển dụng) và thẻ thành viên (p1-02) cùng vẽ huy hiệu — mỗi nơi tự tải dữ liệu bằng service của mình rồi truyền vào đây.
 */
export type SkillCategory = 'FRONTEND' | 'BACKEND' | 'MOBILE' | 'DATA' | 'DESIGN' | 'DEVOPS' | 'QA' | 'SOFT';

export interface SkillSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: SkillCategory;
  /** Tên icon trong bộ icon của app; lạ ⇒ icon mặc định. */
  icon: string;
}

export interface SkillBadge {
  skill: SkillSummary;
  unlockedAt: string;
  /** Chỉ chính chủ nhận huy hiệu đã thu hồi (kèm câu trung tính `revokedNotice`). */
  revoked: boolean;
  revokedNotice: string | null;
  proof: { tasksDone: number; storyPoints: number; avgPeerScore: number | null };
}

export interface ProofTask {
  /** `null` = tiêu đề bị ẩn theo quyền riêng tư (server quyết). */
  title: string | null;
  storyPoints: number;
  completedAt: string;
  reviewScore: number | null;
  /** `null` = người xem không thuộc nhóm đó. */
  workspaceName: string | null;
}

export interface SkillProof {
  skill: SkillSummary;
  unlockedAt: string;
  revoked: boolean;
  tasksDone: number;
  storyPoints: number;
  avgPeerScore: number | null;
  tasks: ProofTask[];
}
