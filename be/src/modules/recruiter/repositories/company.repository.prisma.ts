import type { Company as PrismaCompany, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { escapeRegex } from "../../../core/utils/escape-regex";
import { normalizeSearch } from "../../../core/utils/normalize";
import { COMPANY_STATUSES, type Company, type CompanyStatus } from "../entities/recruiter.interface";
import type { CompanyCreateInput, CompanyListFilter, CompanyPatch, ICompanyRepository } from "./company.repository.interface";
import { mapUnique, type TxHandle } from "./tx";

export const toCompany = (r: PrismaCompany): Company => ({
  id: r.id,
  name: r.name,
  normalizedName: r.normalizedName,
  nameKey: r.nameKey,
  taxCode: r.taxCode ?? null,
  taxCodeKey: r.taxCodeKey,
  website: r.website,
  emailDomain: r.emailDomain ?? null,
  description: r.description ?? null,
  logoAssetId: r.logoAssetId ?? null,
  industry: r.industry ?? null,
  sizeRange: r.sizeRange ?? null,
  tier: r.tier,
  offerQuotaOverride: r.offerQuotaOverride ?? null,
  status: r.status,
  statusReason: r.statusReason ?? null,
  reviewedBy: r.reviewedBy ?? null,
  reviewedAt: r.reviewedAt ?? null,
  reportedCount: r.reportedCount,
  createdBy: r.createdBy,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const db = (tx?: TxHandle) => tx ?? prisma;

export class PrismaCompanyRepository implements ICompanyRepository {
  async findById(id: string, tx?: TxHandle): Promise<Company | null> {
    const r = await db(tx).company.findUnique({ where: { id } });
    return r ? toCompany(r) : null;
  }

  async findMany(ids: readonly string[]): Promise<Map<string, Company>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.company.findMany({ where: { id: { in: [...ids] } } });
    return new Map(rows.map((r) => [r.id, toCompany(r)]));
  }

  async findByKeys(nameKey: string, taxCodeKey: string, exceptId?: string, tx?: TxHandle): Promise<Company | null> {
    const r = await db(tx).company.findFirst({ where: { OR: [{ nameKey }, { taxCodeKey }], ...(exceptId ? { id: { not: exceptId } } : {}) } });
    return r ? toCompany(r) : null;
  }

  create(input: CompanyCreateInput, tx?: TxHandle): Promise<Company> {
    return mapUnique("nameKey", async () =>
      toCompany(
        await db(tx).company.create({
          data: {
            ...input,
            tier: "FREE",
            offerQuotaOverride: null,
            status: "PENDING",
            statusReason: null,
            reviewedBy: null,
            reviewedAt: null,
            reportedCount: 0,
            version: 1,
          },
        })
      )
    );
  }

  /** `updateMany` (CAS) rồi đọc lại — `update` không nhận điều kiện ngoài khoá; `mapUnique` bắt đua đổi khoá tên/MST. */
  update(id: string, expectedVersion: number, patch: CompanyPatch, opts: { fromStatuses?: readonly CompanyStatus[] } = {}, tx?: TxHandle): Promise<Company | null> {
    return mapUnique("nameKey", async () => {
      const where: Prisma.CompanyWhereInput = { id, version: expectedVersion, ...(opts.fromStatuses ? { status: { in: [...opts.fromStatuses] } } : {}) };
      const res = await db(tx).company.updateMany({ where, data: { ...patch, version: { increment: 1 } } });
      if (res.count === 0) return null;
      const r = await db(tx).company.findUnique({ where: { id } });
      return r ? toCompany(r) : null;
    });
  }

  async touch(id: string, tx?: TxHandle): Promise<void> {
    await db(tx).company.updateMany({ where: { id }, data: { updatedAt: new Date() } });
  }

  async list(f: CompanyListFilter): Promise<{ data: Company[]; total: number }> {
    const q = f.q ? normalizeSearch(f.q) : "";
    const where: Prisma.CompanyWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.tier ? { tier: f.tier } : {}),
      ...(q ? { normalizedName: { contains: escapeRegex(q), mode: "insensitive" } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.company.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.limit, take: f.limit }),
      prisma.company.count({ where }),
    ]);
    return { data: rows.map(toCompany), total };
  }

  async setReportedCount(id: string, count: number): Promise<void> {
    await prisma.company.updateMany({ where: { id }, data: { reportedCount: count } });
  }

  async countByStatus(): Promise<Record<CompanyStatus, number>> {
    const counts = await Promise.all(COMPANY_STATUSES.map((s) => prisma.company.count({ where: { status: s } })));
    return Object.fromEntries(COMPANY_STATUSES.map((s, i) => [s, counts[i]])) as Record<CompanyStatus, number>;
  }
}
