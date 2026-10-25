import { NotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { fromX10, toDisplayCriteria, type DisplaySkillCriteria } from "../../../shared/criteria/skill-criteria";
import { shortRef } from "./skill-admin.presenter";
import { noBadge } from "./skill-errors";
import type { SkillDefinition, UserSkillBadge } from "../entities/skill.interface";
import type { ISkillBadgeRepository } from "../repositories/skill-badge.repository.interface";
import type { ISkillDefinitionRepository } from "../repositories/skill-definition.repository.interface";
import type { ISkillCreditRepository, IUserSkillProgressRepository } from "../repositories/skill-ledger.repository.interface";
import { presentBadge, presentCatalogItem, presentSummary, type SkillBadgeDto, type SkillCatalogItemDto, type SkillSummaryDto } from "./skill.presenter";
import type { ProofTaskView, SkillVisibilityService } from "./skill-visibility.service";

export interface SkillProofDto {
  skill: SkillSummaryDto;
  unlockedAt: string;
  revoked: boolean;
  tasksDone: number;
  storyPoints: number;
  avgPeerScore: number | null;
  tasks: ProofTaskView[];
  /** Nhắc người xem: dữ liệu do hệ thống ghi nhận (không tự khai). */
  verifiedBy: "SYSTEM";
}

export interface AdminProofDto extends Omit<SkillProofDto, "tasks" | "verifiedBy"> {
  criteriaSnapshot: DisplaySkillCriteria;
  tasks: Array<{ taskRef: string; storyPoints: number; completedAt: string; reviewScore: number | null; active: boolean }>;
}

export interface SkillQueryDeps {
  definitions: ISkillDefinitionRepository;
  progress: IUserSkillProgressRepository;
  credits: ISkillCreditRepository;
  badges: ISkillBadgeRepository;
  visibility: SkillVisibilityService;
}

const notFound = () => new NotFoundError("Không tìm thấy huy hiệu kỹ năng");

/** Đọc danh mục + tiến độ + huy hiệu cho người dùng (p6-06 be.md §4). KHÔNG có đường ghi huy hiệu (CR-03). */
export class SkillQueryService {
  constructor(private readonly d: SkillQueryDeps) {}

  /** `GET /skills` — kỹ năng đang bật + tiến độ + trạng thái huy hiệu của TÔI. */
  async catalog(userId: string): Promise<SkillCatalogItemDto[]> {
    const [skills, progress, badges] = await Promise.all([this.d.definitions.listActive(), this.d.progress.listByUser(userId), this.d.badges.listByUser(userId, true)]);
    const pBy = new Map(progress.map((p) => [p.skillId, p]));
    const bBy = new Map(badges.map((b) => [b.skillId, b]));
    return skills.map((s) => presentCatalogItem(s, pBy.get(s.id), bBy.get(s.id)));
  }

  /** `GET /skills/:id` — kỹ năng đang bật, hoặc kỹ năng đã tắt mà tôi có huy hiệu. Còn lại 404 ("Kỹ năng không còn"). */
  async detail(userId: string, skillId: string): Promise<SkillCatalogItemDto> {
    const skill = await this.d.definitions.findById(skillId);
    if (!skill) throw new NotFoundError("Kỹ năng không còn");
    const [progress, badge] = await Promise.all([this.d.progress.find(userId, skillId), this.d.badges.find(userId, skillId)]);
    if (!skill.isActive && !badge) throw new NotFoundError("Kỹ năng không còn");
    return presentCatalogItem(skill, progress, badge ?? undefined);
  }

  /** `GET /me/skills` — huy hiệu của tôi, KỂ CẢ đã thu hồi (chỉ chính chủ thấy, câu trung tính). */
  async myBadges(userId: string): Promise<SkillBadgeDto[]> {
    return this.present(await this.d.badges.listByUser(userId, true));
  }

  /** `GET /users/:id/skills` — huy hiệu CÒN hiệu lực; không được xem → 404. */
  async userBadges(viewer: AuthUser, targetId: string): Promise<SkillBadgeDto[]> {
    if (!(await this.d.visibility.canViewBadges(viewer, targetId))) throw notFound();
    return this.present(await this.d.badges.listByUser(targetId, false));
  }

  /** `GET /users/:id/skills/:skillId/proof` — minh chứng lọc theo người xem. Huy hiệu đã thu hồi chỉ chính chủ xem được. */
  async proof(viewer: AuthUser, targetId: string, skillId: string): Promise<SkillProofDto> {
    if (!(await this.d.visibility.canViewBadges(viewer, targetId))) throw notFound();
    return this.proofUnchecked(viewer, targetId, skillId);
  }

  /**
   * Như `proof` nhưng KHÔNG kiểm "người xem được huy hiệu của người này" — caller (p6-08 `recruiter`) tự chịu trách nhiệm kiểm quyền (nhân sự công ty APPROVED, người kia
   * đang Open to work và không chặn công ty, đã bật `showSkills`). Lọc tiêu đề/tên nhóm theo `viewer` VẪN áp dụng (HR không thấy tiêu đề trừ khi `proofTitles` bật).
   */
  async proofUnchecked(viewer: AuthUser, targetId: string, skillId: string): Promise<SkillProofDto> {
    const [badge, skill] = await Promise.all([this.d.badges.find(targetId, skillId), this.d.definitions.findById(skillId)]);
    if (!badge || !skill || (badge.revokedAt && viewer.id !== targetId)) throw notFound();
    const credits = await this.orderedCredits(badge);
    return {
      skill: presentSummary(skill),
      unlockedAt: badge.unlockedAt.toISOString(),
      revoked: badge.revokedAt !== null,
      tasksDone: badge.proof.tasksDone,
      storyPoints: fromX10(badge.proof.storyPointsX10),
      avgPeerScore: badge.proof.avgPeerScoreX10 === null ? null : fromX10(badge.proof.avgPeerScoreX10),
      tasks: await this.d.visibility.proofTasks(viewer.id, targetId, credits),
      verifiedBy: "SYSTEM",
    };
  }

  /** Minh chứng cho VẬN HÀNH (admin.md §2.3): chỉ id task rút gọn, điểm, ngày, review — KHÔNG tiêu đề/nội dung/tên nhóm. */
  async adminProof(userId: string, skillId: string): Promise<AdminProofDto> {
    const [badge, skill] = await Promise.all([this.d.badges.find(userId, skillId), this.d.definitions.findById(skillId)]);
    if (!badge || !skill) throw noBadge();
    const credits = await this.orderedCredits(badge);
    return {
      skill: presentSummary(skill),
      unlockedAt: badge.unlockedAt.toISOString(),
      revoked: badge.revokedAt !== null,
      tasksDone: badge.proof.tasksDone,
      storyPoints: fromX10(badge.proof.storyPointsX10),
      avgPeerScore: badge.proof.avgPeerScoreX10 === null ? null : fromX10(badge.proof.avgPeerScoreX10),
      criteriaSnapshot: toDisplayCriteria(badge.criteriaSnapshot),
      tasks: credits.map((c) => ({
        taskRef: shortRef(c.taskId),
        storyPoints: fromX10(c.storyPointsX10),
        completedAt: c.completedAt.toISOString(),
        reviewScore: c.reviewScoreX10 === null ? null : fromX10(c.reviewScoreX10),
        active: c.status === "ACTIVE",
      })),
    };
  }

  /** Credit của minh chứng theo đúng thứ tự đã chụp (bỏ credit đã bị xoá — vd ẩn danh hoá). */
  async orderedCredits(badge: UserSkillBadge) {
    const rows = await this.d.credits.findByIds(badge.proof.taskCreditIds);
    const byId = new Map(rows.map((c) => [c.id, c]));
    return badge.proof.taskCreditIds.flatMap((id) => {
      const c = byId.get(id);
      return c ? [c] : [];
    });
  }

  private async present(badges: UserSkillBadge[]): Promise<SkillBadgeDto[]> {
    const skills = new Map<string, SkillDefinition>((await this.d.definitions.findByIds(badges.map((b) => b.skillId))).map((s) => [s.id, s]));
    return badges.flatMap((b) => {
      const s = skills.get(b.skillId);
      return s ? [presentBadge(s, b)] : [];
    });
  }
}
