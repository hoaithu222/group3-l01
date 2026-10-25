import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import type { CompanyMember } from "../entities/recruiter.interface";
import type { AddMemberDto } from "../dtos";
import { NotFoundError } from "../../../core/exceptions";
import { UniqueViolationError } from "../repositories/tx";
import type { CompanyService } from "./company.service";
import { presentMember, type MemberView } from "./recruiter.presenter";
import type { RecruiterDeps } from "./recruiter.deps";
import { recruiterErrors } from "./recruiter.errors";

/**
 * Nhân sự doanh nghiệp (be.md §4/§5): danh sách, thêm theo email (người ĐÃ có tài khoản), gỡ. Một người ≤ 1 doanh nghiệp (`activeKey` unique); người đã bị gỡ được KÍCH HOẠT LẠI
 * trên hàng cũ (`[companyId, userId]` unique). Không bao giờ gỡ được OWNER cuối cùng (RECR_012). Thêm người chỉ khi công ty APPROVED (middleware `companyScope({ approved })`).
 */
export class CompanyMemberService {
  constructor(
    private readonly d: RecruiterDeps,
    private readonly companies: Pick<CompanyService, "afterMembershipChange">
  ) {}

  async list(companyId: string): Promise<MemberView[]> {
    const members = await this.d.members.listByCompany(companyId, { activeOnly: true });
    const users = await this.d.directory.findUsers(members.map((m) => m.userId));
    return members.map((m) => presentMember(m, users.get(m.userId)));
  }

  async add(actor: AuthUser, companyId: string, dto: AddMemberDto): Promise<MemberView> {
    const target = await this.d.directory.findByEmail(dto.email);
    if (!target || target.status !== "ACTIVE") throw recruiterErrors.userNotFound();
    const active = await this.d.members.findActiveByUser(target.id);
    if (active) throw recruiterErrors.memberElsewhere({ alreadyMember: active.companyId === companyId });
    if ((await this.d.members.countActive(companyId)) >= LIMITS.company.membersMax) throw recruiterErrors.membersFull(LIMITS.company.membersMax);

    let member: CompanyMember;
    try {
      member = await this.d.tx.run(async (tx) => {
        const previous = await this.d.members.findByCompanyUser(companyId, target.id, tx);
        if (!previous) return this.d.members.create({ id: this.d.newId(), companyId, userId: target.id, role: dto.role, invitedBy: actor.id }, tx);
        const back = await this.d.members.reactivate(previous.id, target.id, dto.role, actor.id, tx);
        if (!back) throw recruiterErrors.memberElsewhere({ alreadyMember: true });
        return back;
      });
    } catch (err) {
      if (err instanceof UniqueViolationError) throw recruiterErrors.memberElsewhere();
      throw err;
    }
    await this.companies.afterMembershipChange(companyId, [target.id]);
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "company.member-add", targetType: "Company", targetId: companyId, metadata: { userId: target.id, role: dto.role } });
    return presentMember(member, target);
  }

  async remove(actor: AuthUser, companyId: string, userId: string): Promise<{ removed: true }> {
    const member = await this.d.members.findByCompanyUser(companyId, userId);
    if (!member || member.status !== "ACTIVE") throw new NotFoundError("Không tìm thấy nhân sự này trong doanh nghiệp");
    // `touch` ép hai lượt gỡ đồng thời (hai OWNER gỡ nhau) chạy tuần tự → đếm OWNER lại trên dữ liệu đã commit, không bao giờ về 0.
    const removed = await this.d.tx.run(async (tx) => {
      await this.d.companies.touch(companyId, tx);
      if (member.role === "OWNER" && (await this.d.members.countActiveOwners(companyId, tx)) <= 1) throw recruiterErrors.lastOwner();
      return this.d.members.remove(member.id, tx);
    });
    if (!removed) throw new NotFoundError("Không tìm thấy nhân sự này trong doanh nghiệp");
    await this.companies.afterMembershipChange(companyId, [userId]);
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "company.member-remove", targetType: "Company", targetId: companyId, metadata: { userId, role: member.role } });
    return { removed: true };
  }
}
