import { ValidationError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { normalizeSearch } from "../../../core/utils/normalize";
import { companyActionsFor } from "../domain/state-machines";
import { emailDomainOf, nameKeyOf, taxCodeKeyOf } from "../domain/company-keys";
import type { Company, CompanyMember } from "../entities/recruiter.interface";
import type { RegisterCompanyDto, UpdateCompanyDto } from "../dtos";
import type { CompanyPatch } from "../repositories/company.repository.interface";
import { UniqueViolationError } from "../repositories/tx";
import { OfferQuotaService, type UsageView } from "./offer-quota.service";
import { companyStatusRow } from "./recruiter-outbox-rows";
import { presentCompany, presentMembership, type CompanyView, type MyCompanyView } from "./recruiter.presenter";
import type { RecruiterDeps } from "./recruiter.deps";
import { recruiterErrors } from "./recruiter.errors";

const LOCKED_WHEN_APPROVED = ["name", "taxCode", "website"] as const;

/** `UniqueViolationError` của tạo/sửa công ty → mã nghiệp vụ: khoá `activeKey` = người này đã thuộc doanh nghiệp (RECR_001); còn lại = trùng tên/MST (RECR_004). */
export function mapCompanyUnique(err: unknown): never {
  if (err instanceof UniqueViolationError) {
    if (err.key.includes("activeKey") || err.key.includes("userId")) throw recruiterErrors.alreadyInCompany();
    throw recruiterErrors.duplicateCompany();
  }
  throw err;
}

/**
 * Đăng ký/sửa/gửi duyệt lại doanh nghiệp + đọc hồ sơ (be.md §5). Duyệt/tạm ngưng thuộc `CompanyAdminService`; nhân sự thuộc `CompanyMemberService`.
 * Mọi thay đổi trạng thái/thành viên: `bumpCompany` (version scope COMPANY → cache quyền của MỌI thành viên vô hiệu ngay) + xoá cache quyền theo dữ liệu.
 */
export class CompanyService {
  readonly quota: OfferQuotaService;

  constructor(private readonly d: RecruiterDeps) {
    this.quota = new OfferQuotaService(d);
  }

  /** `POST /companies` — công ty PENDING + người đăng ký là OWNER, một transaction. */
  async register(user: AuthUser, dto: RegisterCompanyDto): Promise<MyCompanyView> {
    if (await this.d.members.findActiveByUser(user.id)) throw recruiterErrors.alreadyInCompany();
    const nameKey = nameKeyOf(dto.name);
    if (nameKey.length === 0) throw new ValidationError("Tên doanh nghiệp không hợp lệ");
    const id = this.d.newId();
    const taxCodeKey = taxCodeKeyOf(dto.taxCode, id);
    if (await this.d.companies.findByKeys(nameKey, taxCodeKey)) throw recruiterErrors.duplicateCompany();
    if (dto.logoAssetId) await this.assertLogo(dto.logoAssetId, user.id);

    const now = this.d.now();
    let company: Company;
    let member: CompanyMember;
    try {
      ({ company, member } = await this.d.tx.run(async (tx) => {
        const created = await this.d.companies.create(
          {
            id,
            name: dto.name,
            normalizedName: normalizeSearch(dto.name),
            nameKey,
            taxCode: dto.taxCode ?? null,
            taxCodeKey,
            website: dto.website,
            emailDomain: emailDomainOf(dto.website),
            description: dto.description ?? null,
            logoAssetId: dto.logoAssetId ?? null,
            industry: dto.industry ?? null,
            sizeRange: dto.sizeRange ?? null,
            createdBy: user.id,
          },
          tx
        );
        const owner = await this.d.members.create({ id: this.d.newId(), companyId: id, userId: user.id, role: "OWNER", invitedBy: null }, tx);
        if (dto.logoAssetId) await this.d.assets.replaceLogo(tx, { companyId: id, assetId: dto.logoAssetId, actorId: user.id });
        await this.d.outbox.add(tx, companyStatusRow(created, { ops: true }, now));
        return { company: created, member: owner };
      }));
    } catch (err) {
      return mapCompanyUnique(err);
    }
    await this.afterMembershipChange(id, [user.id]);
    await this.d.audit.record({ actorId: user.id, actorRole: user.role, action: "company.register", targetType: "Company", targetId: id, metadata: { taxCode: dto.taxCode ?? null } });
    return this.myView(company, member, user);
  }

  /** `GET /me/company` — công ty của tôi (kể cả PENDING/REJECTED/SUSPENDED) hoặc 404. */
  async getMine(user: AuthUser): Promise<MyCompanyView> {
    const member = await this.d.members.findActiveByUser(user.id);
    const company = member ? await this.d.companies.findById(member.companyId) : null;
    if (!member || !company) throw recruiterErrors.companyNotFound();
    return this.myView(company, member, user);
  }

  /** `GET /companies/:companyId` — hồ sơ + hạn mức tháng (`usage`). Quyền đã kiểm bởi `companyScope`. */
  async get(user: AuthUser, companyId: string): Promise<{ company: CompanyView; usage: UsageView }> {
    const company = await this.load(companyId);
    return { company: presentCompany(company, await this.logoUrl(company, user)), usage: await this.quota.usageOf(company, this.d.now()) };
  }

  usage(companyId: string): Promise<UsageView> {
    return this.load(companyId).then((c) => this.quota.usageOf(c, this.d.now()));
  }

  /** `PATCH /companies/:companyId` (OWNER) — CAS `expectedVersion`; `name`/`taxCode`/`website` khoá khi đã duyệt (RECR_009). */
  async update(user: AuthUser, companyId: string, dto: UpdateCompanyDto): Promise<CompanyView> {
    const company = await this.load(companyId);
    const patch = this.buildPatch(company, dto);
    if (dto.logoAssetId) await this.assertLogo(dto.logoAssetId, user.id);
    if (Object.keys(patch).length === 0 && dto.logoAssetId === undefined) return presentCompany(company, await this.logoUrl(company, user));

    const nameKey = patch.nameKey;
    const taxKey = patch.taxCodeKey;
    if ((nameKey || taxKey) && (await this.d.companies.findByKeys(nameKey ?? company.nameKey, taxKey ?? company.taxCodeKey, companyId))) throw recruiterErrors.duplicateCompany();

    let updated: Company | null;
    try {
      updated = await this.d.tx.run(async (tx) => {
        const next = await this.d.companies.update(companyId, dto.expectedVersion, patch, {}, tx);
        if (next && dto.logoAssetId !== undefined) await this.d.assets.replaceLogo(tx, { companyId, assetId: dto.logoAssetId, actorId: user.id });
        return next;
      });
    } catch (err) {
      return mapCompanyUnique(err);
    }
    if (!updated) throw new VersionConflictError((await this.load(companyId)).version);
    await this.d.audit.record({ actorId: user.id, actorRole: user.role, action: "company.update", targetType: "Company", targetId: companyId, metadata: { fields: Object.keys(patch) } });
    return presentCompany(updated, await this.logoUrl(updated, user));
  }

  /** `POST /companies/:companyId/resubmit` (OWNER) — REJECTED → PENDING; tranh lại khoá tên/MST (trùng → RECR_004). */
  async resubmit(user: AuthUser, companyId: string): Promise<CompanyView> {
    const company = await this.load(companyId);
    if (company.status !== "REJECTED") throw recruiterErrors.invalidState({ status: company.status });
    const nameKey = nameKeyOf(company.name);
    const taxCodeKey = taxCodeKeyOf(company.taxCode, company.id);
    if (await this.d.companies.findByKeys(nameKey, taxCodeKey, companyId)) throw recruiterErrors.duplicateCompany();
    const now = this.d.now();
    let updated: Company | null;
    try {
      updated = await this.d.tx.run(async (tx) => {
        const next = await this.d.companies.update(
          companyId,
          company.version,
          { status: "PENDING", statusReason: null, reviewedBy: null, reviewedAt: null, nameKey, taxCodeKey },
          { fromStatuses: ["REJECTED"] },
          tx
        );
        if (next) await this.d.outbox.add(tx, companyStatusRow(next, { ops: true }, now));
        return next;
      });
    } catch (err) {
      return mapCompanyUnique(err);
    }
    if (!updated) throw recruiterErrors.invalidState();
    await this.afterMembershipChange(companyId, await this.d.members.activeUserIds(companyId));
    await this.d.audit.record({ actorId: user.id, actorRole: user.role, action: "company.resubmit", targetType: "Company", targetId: companyId });
    return presentCompany(updated, await this.logoUrl(updated, user));
  }

  // ── nội bộ ──────────────────────────────────────────────────────────────────

  async load(companyId: string): Promise<Company> {
    const c = await this.d.companies.findById(companyId);
    if (!c) throw recruiterErrors.companyNotFound();
    return c;
  }

  /** Vô hiệu cache quyền của các thành viên + version scope COMPANY (không tăng `sessionVersion`). */
  async afterMembershipChange(companyId: string, userIds: readonly string[]): Promise<void> {
    await Promise.all([this.d.access.invalidateUsers(userIds), this.d.access.bumpCompany(companyId)]);
  }

  private buildPatch(company: Company, dto: UpdateCompanyDto): CompanyPatch {
    const patch: CompanyPatch = {};
    const locked = company.status === "APPROVED" || company.status === "SUSPENDED";
    const changedLocked: string[] = [];
    const rekey = company.status !== "REJECTED";

    if (dto.name !== undefined && dto.name !== company.name) {
      changedLocked.push("name");
      patch.name = dto.name;
      patch.normalizedName = normalizeSearch(dto.name);
      if (rekey) {
        patch.nameKey = nameKeyOf(dto.name);
        if (patch.nameKey.length === 0) throw new ValidationError("Tên doanh nghiệp không hợp lệ");
      }
    }
    if (dto.taxCode !== undefined && (dto.taxCode ?? null) !== company.taxCode) {
      changedLocked.push("taxCode");
      patch.taxCode = dto.taxCode ?? null;
      if (rekey) patch.taxCodeKey = taxCodeKeyOf(dto.taxCode, company.id);
    }
    if (dto.website !== undefined && dto.website !== company.website) {
      changedLocked.push("website");
      patch.website = dto.website;
      patch.emailDomain = emailDomainOf(dto.website);
    }
    if (locked && changedLocked.length > 0) throw recruiterErrors.invalidState({ locked: changedLocked.filter((f) => (LOCKED_WHEN_APPROVED as readonly string[]).includes(f)) });

    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.industry !== undefined) patch.industry = dto.industry;
    if (dto.sizeRange !== undefined) patch.sizeRange = dto.sizeRange;
    if (dto.logoAssetId !== undefined) patch.logoAssetId = dto.logoAssetId;
    return patch;
  }

  private async assertLogo(assetId: string, userId: string): Promise<void> {
    const asset = await this.d.assets.get(assetId);
    if (!asset || asset.ownerId !== userId || asset.status !== "READY" || asset.scope !== "COMPANY" || asset.kind !== "IMAGE") throw new ValidationError("Logo phải là ảnh đã tải lên của bạn (scope COMPANY)");
  }

  logoUrl(company: Pick<Company, "logoAssetId">, viewer: AuthUser): Promise<string | null> {
    return company.logoAssetId ? this.d.assets.signedUrl(company.logoAssetId, viewer) : Promise.resolve(null);
  }

  private async myView(company: Company, member: CompanyMember, user: AuthUser): Promise<MyCompanyView> {
    return {
      company: presentCompany(company, await this.logoUrl(company, user)),
      membership: presentMembership(member),
      permissions: companyActionsFor(company.status, member.role),
    };
  }
}
