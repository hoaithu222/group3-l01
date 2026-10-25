import type { AuthUser } from "../../../core/types/express";
import { normalizeSearch } from "../../../core/utils/normalize";
import { emailDomainOf, nameKeyOf, releasedNameKey, releasedTaxCodeKey, taxCodeKeyOf } from "../domain/company-keys";
import { periodKeyOf, recentPeriods } from "../domain/periods";
import { companyFromStatuses, nextCompanyStatus, type CompanyAction } from "../domain/state-machines";
import type { AdminCompaniesQuery, AdminCompanyPatchDto } from "../dtos";
import { ValidationError, VersionConflictError } from "../../../core/exceptions";
import type { Company, JobOfferStatus } from "../entities/recruiter.interface";
import type { CompanyPatch } from "../repositories/company.repository.interface";
import type { CompanyService } from "./company.service";
import { mapCompanyUnique } from "./company.service";
import { companyStatusRow } from "./recruiter-outbox-rows";
import { presentCompany, presentMember, type CompanyView, type MemberView } from "./recruiter.presenter";
import type { RecruiterDeps } from "./recruiter.deps";
import { recruiterErrors } from "./recruiter.errors";

export interface AdminCompanyItem {
  id: string;
  name: string;
  website: string;
  status: string;
  tier: string;
  createdAt: string;
  membersCount: number;
  offersThisMonth: number;
  quota: number;
  reportedCount: number;
}

export interface AdminCompanyDetail {
  company: CompanyView;
  emailDomain: string | null;
  reportedCount: number;
  members: MemberView[];
  /** 6 kỳ gần nhất (mới → cũ): số lượt đã dùng / hạn mức hiện hành. */
  usage: Array<{ period: string; used: number }>;
  quota: number;
  /** Số lời mời theo trạng thái — KHÔNG nội dung/tiêu đề/người nhận. */
  offersByStatus: Record<JobOfferStatus, number>;
}

/**
 * Vận hành doanh nghiệp (be.md §4/§5): danh sách, chi tiết, duyệt/từ chối/tạm ngưng/khôi phục (CAS `version`, lý do bắt buộc + audit), đổi gói/hạn mức/thông tin.
 * Tạm ngưng: thread lời mời mở thành chỉ đọc NGAY nhờ `effectiveThreadLocked` (suy từ trạng thái công ty, không ghi hàng loạt); xoá cache quyền → HR bị 403 `RECR_002` sau khi
 * `bumpCompany` (version scope) + `invalidateUsers`. Từ chối nhả khoá tên/MST để người khác đăng ký lại.
 */
export class CompanyAdminService {
  constructor(
    private readonly d: RecruiterDeps,
    private readonly companies: CompanyService
  ) {}

  async list(q: AdminCompaniesQuery): Promise<{ data: AdminCompanyItem[]; total: number }> {
    const { data, total } = await this.d.companies.list({ q: q.q, status: q.status, tier: q.tier, page: q.page, limit: q.limit });
    const period = periodKeyOf(this.d.now());
    const [counts, usage] = await Promise.all([this.d.members.countActiveByCompanies(data.map((c) => c.id)), this.d.usage.listByPeriod(period)]);
    const usedBy = new Map(usage.map((u) => [u.companyId, u.used]));
    const items = await Promise.all(
      data.map(
        async (c): Promise<AdminCompanyItem> => ({
          id: c.id,
          name: c.name,
          website: c.website,
          status: c.status,
          tier: c.tier,
          createdAt: c.createdAt.toISOString(),
          membersCount: counts.get(c.id) ?? 0,
          offersThisMonth: usedBy.get(c.id) ?? 0,
          quota: await this.companies.quota.quotaOf(c),
          reportedCount: c.reportedCount,
        })
      )
    );
    return { data: items, total };
  }

  async detail(actor: AuthUser, companyId: string): Promise<AdminCompanyDetail> {
    const c = await this.companies.load(companyId);
    const now = this.d.now();
    const periods = recentPeriods(now, 6);
    const [members, used, offersByStatus, quota] = await Promise.all([
      this.d.members.listByCompany(companyId, { activeOnly: true }),
      this.d.usage.usedByPeriods(companyId, periods),
      this.d.offers.countByStatus(companyId),
      this.companies.quota.quotaOf(c),
    ]);
    const users = await this.d.directory.findUsers(members.map((m) => m.userId));
    return {
      company: presentCompany(c, await this.companies.logoUrl(c, actor)),
      emailDomain: c.emailDomain,
      reportedCount: c.reportedCount,
      members: members.map((m) => presentMember(m, users.get(m.userId))),
      usage: periods.map((period) => ({ period, used: used.get(period) ?? 0 })),
      quota,
      offersByStatus,
    };
  }

  /** `POST /admin/companies/:companyId/(approve|reject|suspend|reinstate)`. */
  async act(actor: AuthUser, companyId: string, action: Exclude<CompanyAction, "resubmit">, reason: string): Promise<CompanyView> {
    const company = await this.companies.load(companyId);
    const next = nextCompanyStatus(company.status, action);
    if (!next) throw recruiterErrors.invalidState({ status: company.status, action });
    const now = this.d.now();
    const patch: CompanyPatch = {
      status: next,
      statusReason: action === "reject" || action === "suspend" ? reason : null,
      reviewedBy: actor.id,
      reviewedAt: now,
      ...(action === "reject" ? { nameKey: releasedNameKey(companyId), taxCodeKey: releasedTaxCodeKey(companyId) } : {}),
    };
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.companies.update(companyId, company.version, patch, { fromStatuses: companyFromStatuses(action) }, tx);
      if (u) await this.d.outbox.add(tx, companyStatusRow(u, { owner: true }, now));
      return u;
    });
    if (!updated) throw recruiterErrors.invalidState({ status: company.status, action });
    await this.companies.afterMembershipChange(companyId, await this.d.members.activeUserIds(companyId));
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: `company.${action}`, targetType: "Company", targetId: companyId, reason, metadata: { from: company.status, to: next } });
    if (action === "suspend") await this.d.reports.closeOpenByTarget({ targetType: "COMPANY", targetId: companyId, actor: { id: actor.id, role: actor.role }, resolution: "CONTENT_REMOVED", reason });
    return presentCompany(updated, await this.companies.logoUrl(updated, actor));
  }

  /** `PATCH /admin/companies/:companyId` — đổi gói/hạn mức và sửa tên/website/MST (kể cả khi đã duyệt). CAS `expectedVersion`. */
  async patch(actor: AuthUser, companyId: string, dto: AdminCompanyPatchDto): Promise<CompanyView> {
    const company = await this.companies.load(companyId);
    const patch = this.buildPatch(company, dto);
    if (patch.nameKey || patch.taxCodeKey) {
      if (await this.d.companies.findByKeys(patch.nameKey ?? company.nameKey, patch.taxCodeKey ?? company.taxCodeKey, companyId)) throw recruiterErrors.duplicateCompany();
    }
    const now = this.d.now();
    let updated: Company | null;
    try {
      updated = await this.d.tx.run(async (tx) => {
        const u = await this.d.companies.update(companyId, dto.expectedVersion, patch, {}, tx);
        if (u && (patch.tier !== undefined || patch.offerQuotaOverride !== undefined)) await this.d.outbox.add(tx, companyStatusRow(u, {}, now));
        return u;
      });
    } catch (err) {
      return mapCompanyUnique(err);
    }
    if (!updated) throw new VersionConflictError((await this.companies.load(companyId)).version);
    await this.d.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "company.admin-update",
      targetType: "Company",
      targetId: companyId,
      reason: dto.reason,
      metadata: { fields: Object.keys(patch), tier: patch.tier !== undefined ? [company.tier, patch.tier] : undefined, offerQuotaOverride: patch.offerQuotaOverride !== undefined ? [company.offerQuotaOverride, patch.offerQuotaOverride] : undefined },
    });
    return presentCompany(updated, await this.companies.logoUrl(updated, actor));
  }

  private buildPatch(company: Company, dto: AdminCompanyPatchDto): CompanyPatch {
    const patch: CompanyPatch = {};
    const rekey = company.status !== "REJECTED";
    if (dto.tier !== undefined && dto.tier !== company.tier) patch.tier = dto.tier;
    if (dto.offerQuotaOverride !== undefined && dto.offerQuotaOverride !== company.offerQuotaOverride) patch.offerQuotaOverride = dto.offerQuotaOverride;
    if (dto.name !== undefined && dto.name !== company.name) {
      patch.name = dto.name;
      patch.normalizedName = normalizeSearch(dto.name);
      if (rekey) patch.nameKey = nameKeyOf(dto.name);
      if (patch.nameKey === "") throw new ValidationError("Tên doanh nghiệp không hợp lệ");
    }
    if (dto.taxCode !== undefined && (dto.taxCode ?? null) !== company.taxCode) {
      patch.taxCode = dto.taxCode ?? null;
      if (rekey) patch.taxCodeKey = taxCodeKeyOf(dto.taxCode, company.id);
    }
    if (dto.website !== undefined && dto.website !== company.website) {
      patch.website = dto.website;
      patch.emailDomain = emailDomainOf(dto.website);
    }
    return patch;
  }
}
