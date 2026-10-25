import { roleHasPermission } from "../../../core/constants/permissions";
import type { PermissionKey } from "../../../core/constants/permissions";
import { registerDataPermissionProvider } from "../../../core/permission/data-permissions";
import type { AuthUser } from "../../../core/types/express";
import { registerAssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";
import { registerReportTargetExtension, type ReportTargetExtension, type ReportTargetLookup } from "../../../shared/ports/report.port";
import { dataPermissionsFor } from "../domain/state-machines";
import type { RecruiterDeps } from "./recruiter.deps";
import { registerCompanyScopeResolver } from "./company-scope.resolver";

export const COMPANY_REPORT_TARGET = "COMPANY";
export const JOB_OFFER_REPORT_TARGET = "JOB_OFFER";

/**
 * Điểm nối của `recruiter` vào lõi (idempotent — mọi registry là `Map.set`): resolver scope `COMPANY`, provider quyền THEO DỮ LIỆU `company` (`recruiter:*` cho nhân sự), đích báo cáo `COMPANY`/`JOB_OFFER`
 * (đăng ký ở CẢ API lẫn worker — `report.events` chạy ở worker). Quyền đọc asset (`COMPANY_LOGO`, `JOB_OFFER`) là CHỈ-API (URL ký do API phục vụ) → `registerRecruiterAssetResolvers`.
 */
export function registerRecruiterIntegrations(d: RecruiterDeps): void {
  registerCompanyScopeResolver(d);
  registerDataPermissionProvider({ name: "company", resources: ["recruiter"], forUser: (userId) => companyDataPermissions(d, userId) });
  registerReportTargetExtension(COMPANY_REPORT_TARGET, new CompanyReportTarget(d));
  registerReportTargetExtension(JOB_OFFER_REPORT_TARGET, new JobOfferReportTarget(d));
}

/**
 * `CompanyPermissionProvider.forUser` (be.md §5): thành viên ACTIVE → `recruiter:view` (vào cổng thấy trạng thái); công ty APPROVED → + `recruiter:create`; OWNER + APPROVED → + `recruiter:update`.
 * ⚠ Các khoá này KHÔNG được dùng để bảo vệ API vận hành (`/admin/*` dùng `roleHasPermission` theo vai hệ thống): `requirePermission` chấp nhận cả quyền theo dữ liệu nên HR sẽ lọt.
 */
export async function companyDataPermissions(d: Pick<RecruiterDeps, "members" | "companies">, userId: string): Promise<PermissionKey[]> {
  const member = await d.members.findActiveByUser(userId);
  if (!member) return [];
  const company = await d.companies.findById(member.companyId);
  return company ? dataPermissionsFor(company.status, member.role) : [];
}

/** Quyền đọc asset của recruiter (CHỈ API): logo công ty và JD đính kèm lời mời. */
export function registerRecruiterAssetResolvers(d: Pick<RecruiterDeps, "companies" | "members" | "offers">): void {
  registerAssetTargetReadResolver("COMPANY_LOGO", {
    canRead: async (user, link) => {
      const company = await d.companies.findById(link.targetId);
      if (!company) return false;
      if (roleHasPermission(user.role, "recruiter:view")) return true;
      const member = await d.members.findByCompanyUser(company.id, user.id);
      if (member?.status === "ACTIVE") return true;
      // Công ty đã qua duyệt (APPROVED, hoặc SUSPENDED sau đó) — mọi người đăng nhập thấy logo (danh sách lời mời/thẻ công ty); PENDING/REJECTED chỉ nhân sự + vận hành.
      return company.status === "APPROVED" || company.status === "SUSPENDED";
    },
  });
  registerAssetTargetReadResolver("JOB_OFFER", {
    canRead: async (user, link) => {
      const offer = await d.offers.findById(link.targetId);
      if (!offer) return false;
      if (offer.studentId === user.id) return true;
      const member = await d.members.findByCompanyUser(offer.companyId, user.id);
      return member?.status === "ACTIVE";
    },
  });
}

/**
 * Đích báo cáo `COMPANY`: chỉ SINH VIÊN từng nhận lời mời của công ty đó báo cáo được (chống báo cáo hàng loạt/dò danh bạ); nhân sự công ty → "tự báo cáo"; công ty chưa qua duyệt → 404.
 * Chỉ quản trị nền tảng xử lý (`PLATFORM_ONLY`, hành động qua `POST /admin/companies/:id/suspend`).
 */
export class CompanyReportTarget implements ReportTargetExtension {
  constructor(private readonly d: Pick<RecruiterDeps, "companies" | "members" | "offers">) {}

  async resolve(reporter: AuthUser, targetId: string): Promise<ReportTargetLookup> {
    const company = await this.d.companies.findById(targetId);
    if (!company || (company.status !== "APPROVED" && company.status !== "SUSPENDED")) return "NOT_FOUND";
    const member = await this.d.members.findByCompanyUser(company.id, reporter.id);
    if (member?.status === "ACTIVE") return "SELF";
    if (!(await this.d.offers.hasOfferBetween(reporter.id, company.id))) return "NOT_FOUND";
    return platformOnly(COMPANY_REPORT_TARGET, company.id, company.createdBy);
  }

  async onReportCreated(input: { targetId: string; openCount: number }): Promise<void> {
    await this.d.companies.setReportedCount(input.targetId, input.openCount);
  }
}

/** Đích báo cáo `JOB_OFFER`: chỉ SINH VIÊN NHẬN lời mời báo cáo được; chính người gửi → "tự báo cáo"; người khác → 404 trung tính. */
export class JobOfferReportTarget implements ReportTargetExtension {
  constructor(private readonly d: Pick<RecruiterDeps, "offers">) {}

  async resolve(reporter: AuthUser, targetId: string): Promise<ReportTargetLookup> {
    const offer = await this.d.offers.findById(targetId);
    if (!offer) return "NOT_FOUND";
    if (offer.recruiterId === reporter.id) return "SELF";
    if (offer.studentId !== reporter.id) return "NOT_FOUND";
    return platformOnly(JOB_OFFER_REPORT_TARGET, offer.id, offer.recruiterId);
  }

  async onReportCreated(input: { targetId: string; openCount: number }): Promise<void> {
    await this.d.offers.setReportedCount(input.targetId, input.openCount);
  }
}

function platformOnly(targetType: string, targetId: string, authorId: string): ReportTargetLookup {
  return {
    targetType,
    targetId,
    groupKey: `${targetType}:${targetId}`,
    scopeType: null,
    scopeId: null,
    scopeIsPrivate: false,
    workspaceId: null,
    targetAuthorId: authorId,
    handlerLevel: "PLATFORM_ONLY",
  };
}
