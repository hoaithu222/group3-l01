/**
 * Barrel CÔNG KHAI của `career` cho module khác (ngoại lệ có chủ đích của luật "không import chéo module", `architecture.md`) — nền `career` cho
 * p6-07 (portfolio) và p6-08 (recruiter board). KHÔNG import `career/services/*` hay `career/repositories/*` trực tiếp.
 *
 *  - `createSkillBadgeReadPort()` → `activeBadges(userId)` (huy hiệu còn hiệu lực, KHÔNG minh chứng/tiêu đề task) + `career(userId)` (hồ sơ + quyền riêng tư).
 *  - `registerSkillEventSink(name, sink)` — nhận `skill.unlocked|revoked|restored` (job `gamification/skill.events`), idempotent phía sink.
 *  - `registerSkillViewerRule(name, rule)` — luật xem huy hiệu cắm thêm (p6-08 nhà tuyển dụng khi `openToWork`, p6-07 trang công khai).
 *  - Điểm đóng góp nghề nghiệp (`careerScore`) nằm ở `contribution/public.ts` (p4-06), không nhân đôi ở đây.
 */
import type { AuthUser } from "../../core/types/express";
import { getCareerContainer } from "./career.container";
import type { SkillProofDto } from "./services/skill-query.service";
import type { UserCareer } from "./entities/career.interface";
import { presentBadge, type SkillBadgeDto } from "./services/skill.presenter";

export { registerSkillEventSink } from "./services/skill-events";
export type { SkillEventSink } from "./services/skill-events";
export { registerSkillViewerRule } from "./services/skill-visibility.service";
export type { SkillViewerRule } from "./services/skill-visibility.service";
export type { CareerVisibility, UserCareer } from "./entities/career.interface";
/** (p6-08) Mặc định quyền riêng tư nghề nghiệp — `recruiter` tạo bản ghi `UserCareer` đầu tiên khi sinh viên bật Open to work trước khi chỉnh quyền riêng tư. */
export { DEFAULT_CAREER_VISIBILITY } from "./entities/career.interface";
export type { SkillBadgeDto } from "./services/skill.presenter";
export type { SkillBadgeEventPayload } from "../../shared/events/domain-events";

export type { SkillProofDto } from "./services/skill-query.service";

/** (p6-08) Minh chứng huy hiệu cho nhân sự công ty — chỉ MỘT hàm, KHÔNG kiểm quyền xem (caller phải kiểm) nên tách khỏi `SkillBadgeReadPort`. */
export interface SkillProofReadPort {
  proofFor(viewer: AuthUser, targetId: string, skillId: string): Promise<SkillProofDto>;
}

export function createSkillProofReadPort(): SkillProofReadPort {
  const c = getCareerContainer();
  return { proofFor: (viewer, targetId, skillId) => c.query.proofUnchecked(viewer, targetId, skillId) };
}

export interface SkillBadgeReadPort {
  /** Huy hiệu CÒN hiệu lực (chưa thu hồi), mới → cũ — chỉ số liệu tổng, không tiêu đề task. */
  activeBadges(userId: string): Promise<SkillBadgeDto[]>;
  /** Hồ sơ nghề nghiệp (mặc định khi chưa có bản ghi). */
  career(userId: string): Promise<UserCareer>;
}

export function createSkillBadgeReadPort(): SkillBadgeReadPort {
  const c = getCareerContainer();
  return {
    async activeBadges(userId) {
      const badges = await c.badges.listByUser(userId, false);
      const skills = new Map((await c.definitions.findByIds(badges.map((b) => b.skillId))).map((s) => [s.id, s]));
      return badges.flatMap((b) => {
        const s = skills.get(b.skillId);
        return s ? [presentBadge(s, b)] : [];
      });
    },
    career: (userId) => c.visibility.career(userId),
  };
}
