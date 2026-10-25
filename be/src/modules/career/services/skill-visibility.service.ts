import { roleHasPermission } from "../../../core/constants/permissions";
import type { AuthUser } from "../../../core/types/express";
import { defaultCareer, type UserCareer } from "../entities/career.interface";
import type { UserSkillTaskCredit } from "../entities/skill.interface";
import type { ICareerProfileRepository } from "../repositories/career-profile.repository";
import type { ISkillSourceRepository } from "../repositories/skill-source.repository";

/**
 * Luật xem THÊM do module khác cắm vào (p6-08: nhân viên doanh nghiệp APPROVED xem người bật `openToWork`; p6-07: trang portfolio đã publish) —
 * `registerSkillViewerRule` qua `career/public.ts`, không sửa service này.
 */
export type SkillViewerRule = (ctx: { viewerId: string; targetId: string; career: UserCareer }) => Promise<boolean>;

const viewerRules = new Map<string, SkillViewerRule>();

export function registerSkillViewerRule(name: string, rule: SkillViewerRule): void {
  viewerRules.set(name, rule);
}

export interface ProofTaskView {
  title: string | null;
  storyPoints: number;
  completedAt: string;
  reviewScore: number | null;
  workspaceName: string | null;
}

export interface SkillVisibilityDeps {
  careers: ICareerProfileRepository;
  source: ISkillSourceRepository;
}

/**
 * Ai xem được huy hiệu / minh chứng (README §6). Huy hiệu: chính mình · vận hành `skill:view` · thành viên cùng ≥ 1 nhóm ACTIVE khi người đó bật
 * `showSkills` · luật cắm thêm (p6-07/p6-08). Còn lại → 404 (không lộ là có tồn tại).
 * Minh chứng: tiêu đề task hiện khi người xem là chính chủ, người đó bật `proofTitles`, hoặc người xem là thành viên nhóm CỦA TASK ĐÓ; tên nhóm chỉ
 * hiện với thành viên nhóm đó (CR-26: người ngoài + `proofTitles=false` ⇒ không tiêu đề, không tên nhóm).
 */
export class SkillVisibilityService {
  constructor(private readonly d: SkillVisibilityDeps) {}

  async career(userId: string): Promise<UserCareer> {
    return (await this.d.careers.find(userId)) ?? defaultCareer(userId);
  }

  async canViewBadges(viewer: AuthUser, targetId: string): Promise<boolean> {
    if (viewer.id === targetId) return true;
    const target = (await this.d.source.users([targetId])).get(targetId);
    if (!target || target.status === "ANONYMIZED") return false;
    if (roleHasPermission(viewer.role, "skill:view")) return true;
    const career = await this.career(targetId);
    if (career.visibility.showSkills && (await this.sharesWorkspace(viewer.id, targetId))) return true;
    for (const rule of viewerRules.values()) if (await rule({ viewerId: viewer.id, targetId, career })) return true;
    return false;
  }

  /** Danh sách task minh chứng theo góc nhìn người xem (thứ tự giữ nguyên `credits`). */
  async proofTasks(viewerId: string, targetId: string, credits: readonly UserSkillTaskCredit[]): Promise<ProofTaskView[]> {
    const self = viewerId === targetId;
    const career = await this.career(targetId);
    const wsIds = [...new Set(credits.map((c) => c.workspaceId))];
    const member = self ? new Set(wsIds) : await this.d.source.memberWorkspaceIds(viewerId, wsIds);
    const tasks = await this.d.source.tasks(credits.map((c) => c.taskId));
    const namedWs = [...member];
    const wsNames = namedWs.length > 0 ? await this.d.source.workspaceNames(namedWs) : new Map<string, string>();
    return credits.map((c) => {
      const titleAllowed = self || career.visibility.proofTitles || member.has(c.workspaceId);
      return {
        title: titleAllowed ? (tasks.get(c.taskId)?.title ?? null) : null,
        storyPoints: c.storyPointsX10 / 10,
        completedAt: c.completedAt.toISOString(),
        reviewScore: c.reviewScoreX10 === null ? null : c.reviewScoreX10 / 10,
        workspaceName: member.has(c.workspaceId) ? (wsNames.get(c.workspaceId) ?? null) : null,
      };
    });
  }

  private async sharesWorkspace(a: string, b: string): Promise<boolean> {
    const mine = await this.d.source.memberWorkspaceIds(a);
    if (mine.size === 0) return false;
    return (await this.d.source.memberWorkspaceIds(b, [...mine])).size > 0;
  }
}
