import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { decodeOffsetCursor, encodeOffsetCursor } from "../../../core/utils/cursor";
import { dayKeyOf } from "../domain/periods";
import { buildTalentPipeline, hashTalentQuery } from "../domain/talent-query";
import type { TalentSearchQuery } from "../dtos";
import type { TalentIndexDoc } from "../entities/recruiter.interface";
import { presentTalentCard, type TalentCardView } from "./recruiter.presenter";
import type { RecruiterDeps } from "./recruiter.deps";
import { recruiterErrors } from "./recruiter.errors";
import type { SkillProofDto } from "../../career/public";

export interface TalentPage {
  data: TalentCardView[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

export interface TalentProfileView {
  /** Thẻ ứng viên (mọi kỹ năng, không giới hạn 6) — cùng luật che trường như kết quả tìm. */
  card: TalentCardView;
  /** Huy hiệu chi tiết (thời điểm mở khoá + số liệu tổng) — chỉ khi ứng viên bật `showSkills`; minh chứng từng huy hiệu ở `…/skills/:skillId/proof`. */
  badges: Array<{ skillId: string; code: string; name: string; icon: string; category: string; unlockedAt: string; proof: { tasksDone: number; storyPoints: number; avgPeerScore: number | null } }>;
  /** Lời mời ĐANG MỞ của công ty này với ứng viên (nếu có) — nút "Gửi lời mời" đổi thành "Xem lời mời". */
  openOffer: { id: string; status: string; sentAt: string } | null;
}

/**
 * Tìm ứng viên + xem hồ sơ + minh chứng (be.md §5). CHỈ đọc `TalentSearchIndex` (bản chiếu đã lọc quyền riêng tư) — không truy vấn dữ liệu nghiệp vụ lúc tìm, không email/SĐT/tên nhóm.
 * Kết quả tìm cache 60 s theo (công ty, phiên bản `talent:search:ver`, băm bộ lọc): tắt Open to work / chặn / đổi quyền riêng tư → `bump` phiên bản → cache cũ vô hiệu ngay
 * (trần "biến mất khỏi kết quả" ≤ 1 phút KỂ CẢ cache, CR-06). Quyền (công ty APPROVED + nhân sự ACTIVE) đã kiểm bởi `companyScope` trước khi vào đây.
 */
export class TalentSearchService {
  constructor(private readonly d: RecruiterDeps) {}

  async search(companyId: string, q: TalentSearchQuery): Promise<TalentPage> {
    const offset = decodeOffsetCursor(q.cursor);
    const input = { skills: q.skills, minContribution: q.minContribution, minBadges: q.minBadges, role: q.role, location: q.location, q: q.q, offset, limit: q.limit };
    const version = await this.d.searchCache.version();
    const key = `talent:search:${companyId}:${version}:${hashTalentQuery(input)}`;
    const cached = await this.d.searchCache.get<TalentPage>(key);
    if (cached) return cached;

    const { pipeline } = buildTalentPipeline(companyId, input);
    const rows = await this.d.index.search(pipeline);
    const withMatch = (q.skills?.length ?? 0) > 0;
    const hasMore = rows.length > q.limit;
    const page: TalentPage = {
      data: rows.slice(0, q.limit).map((r) => presentTalentCard(r, LIMITS.talent.displayedSkillsMax, withMatch)),
      meta: { nextCursor: hasMore ? encodeOffsetCursor(offset + q.limit) : null, hasMore, limit: q.limit },
    };
    await this.d.searchCache.set(key, page, LIMITS.talent.searchCacheSeconds);
    return page;
  }

  /** `GET /companies/:companyId/talent/:userId` — 404 khi không còn Open to work/bị chặn (CR-06/CR-12); MỖI lượt xem ghi `AuditLog` + gộp `TalentProfileView`. */
  async profile(actor: AuthUser, companyId: string, studentId: string): Promise<TalentProfileView> {
    const doc = await this.visibleDoc(companyId, studentId);
    const now = this.d.now();
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "talent.profile-view", targetType: "USER", targetId: studentId, metadata: { companyId } });
    await this.d.views.record(companyId, studentId, dayKeyOf(now), actor.id, now);

    const badges = doc.skills.length > 0 ? await this.badgesOf(studentId, doc) : [];
    const open = (await this.d.offers.openByStudentCompany(studentId, companyId))[0];
    return {
      card: presentTalentCard({ ...doc, matchScore: 0, preferredRoles: doc.preferredRoles, skills: doc.skills, portfolioUrl: doc.portfolioUrl }, doc.skills.length, false),
      badges,
      openOffer: open ? { id: open.id, status: open.status, sentAt: open.sentAt.toISOString() } : null,
    };
  }

  /** `GET …/talent/:userId/skills/:skillId/proof` — chỉ huy hiệu nằm trong bản chiếu (ứng viên bật `showSkills`); lọc tiêu đề/tên nhóm theo người xem (HR: ẩn trừ khi `proofTitles`). */
  async proof(actor: AuthUser, companyId: string, studentId: string, skillId: string): Promise<SkillProofDto> {
    const doc = await this.visibleDoc(companyId, studentId);
    if (!doc.skills.some((s) => s.skillId === skillId)) throw recruiterErrors.talentNotFound();
    return this.d.proofs.proofFor(actor, studentId, skillId);
  }

  /** Bản chiếu của ứng viên nếu (đang Open to work) VÀ (không chặn công ty) VÀ (tài khoản còn ACTIVE); ngược lại 404 trung tính. */
  private async visibleDoc(companyId: string, studentId: string): Promise<TalentIndexDoc> {
    const doc = await this.d.index.find(studentId);
    if (!doc || !doc.openToWork || doc.blockedCompanyIds.includes(companyId)) throw recruiterErrors.talentNotFound();
    const user = await this.d.directory.findUser(studentId);
    if (!user || user.status !== "ACTIVE") throw recruiterErrors.talentNotFound();
    return doc;
  }

  private async badgesOf(studentId: string, doc: TalentIndexDoc): Promise<TalentProfileView["badges"]> {
    const shown = new Set(doc.skills.map((s) => s.skillId));
    const live = await this.d.badges.activeBadges(studentId);
    return live
      .filter((b) => shown.has(b.skill.id))
      .map((b) => ({ skillId: b.skill.id, code: b.skill.code, name: b.skill.name, icon: b.skill.icon, category: b.skill.category, unlockedAt: b.unlockedAt, proof: b.proof }));
  }
}
