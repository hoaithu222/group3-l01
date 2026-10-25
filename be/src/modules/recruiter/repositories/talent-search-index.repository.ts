import type { Prisma, TalentSearchIndex as PrismaIndex } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { ejsonId } from "../domain/talent-query";
import type { TalentIndexDoc, TalentSkillRef } from "../entities/recruiter.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

/** Một dòng kết quả tìm (đã `$project`, ObjectId/ngày đã giải Extended JSON). */
export interface TalentSearchRow {
  userId: string;
  displayName: string;
  avatarAssetId: string | null;
  headline: string | null;
  preferredRoles: string[];
  location: string | null;
  skills: TalentSkillRef[];
  badgeCount: number;
  contributionPctX10: number | null;
  contributionWorkspaces: number | null;
  portfolioUrl: string | null;
  matchScore: number;
}

export interface ITalentSearchIndexRepository {
  find(userId: string): Promise<TalentIndexDoc | null>;
  /** Ghi ĐÈ toàn bộ bản chiếu (idempotent). Đua tạo cùng `userId` mới (P2002) → thử cập nhật. */
  upsert(doc: TalentIndexDoc): Promise<void>;
  delete(userId: string, tx?: TxHandle): Promise<number>;
  addBlockedCompany(userId: string, companyId: string, tx?: TxHandle): Promise<void>;
  removeBlockedCompany(userId: string, companyId: string, tx?: TxHandle): Promise<void>;
  search(pipeline: Array<Record<string, unknown>>): Promise<TalentSearchRow[]>;
  count(): Promise<number>;
  /** `userId` theo thứ tự tăng dần sau `after` — quét đối soát hằng đêm. */
  listUserIds(after: string | null, limit: number): Promise<string[]>;
  /** `userId` có bản chiếu dựng cách đây quá `before`. */
  listStaleUserIds(before: Date, limit: number): Promise<string[]>;
}

const toDoc = (r: PrismaIndex): TalentIndexDoc => ({
  userId: r.userId,
  openToWork: r.openToWork,
  displayName: r.displayName,
  normalizedText: r.normalizedText,
  avatarAssetId: r.avatarAssetId ?? null,
  headline: r.headline ?? null,
  preferredRoles: r.preferredRoles,
  preferredRolesKey: r.preferredRolesKey,
  location: r.location ?? null,
  locationKey: r.locationKey ?? null,
  skillCodes: r.skillCodes,
  skills: r.skills.map((s) => ({ skillId: s.skillId, code: s.code, name: s.name, icon: s.icon })),
  badgeCount: r.badgeCount,
  contributionPctX10: r.contributionPctX10 ?? null,
  contributionWorkspaces: r.contributionWorkspaces ?? null,
  portfolioUrl: r.portfolioUrl ?? null,
  blockedCompanyIds: r.blockedCompanyIds,
  sourceUpdatedAt: r.sourceUpdatedAt,
  rebuiltAt: r.rebuiltAt,
});

/** Dữ liệu ghi (dùng chung cho create/update; `userId` là khoá). */
const dataOf = (d: TalentIndexDoc) => ({
  openToWork: d.openToWork,
  displayName: d.displayName,
  normalizedText: d.normalizedText,
  avatarAssetId: d.avatarAssetId,
  headline: d.headline,
  preferredRoles: d.preferredRoles,
  preferredRolesKey: d.preferredRolesKey,
  location: d.location,
  locationKey: d.locationKey,
  skillCodes: d.skillCodes,
  badgeCount: d.badgeCount,
  contributionPctX10: d.contributionPctX10,
  contributionWorkspaces: d.contributionWorkspaces,
  portfolioUrl: d.portfolioUrl,
  blockedCompanyIds: d.blockedCompanyIds,
  sourceUpdatedAt: d.sourceUpdatedAt,
  rebuiltAt: d.rebuiltAt,
});

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function toRow(r: Record<string, unknown>): TalentSearchRow {
  const skills = Array.isArray(r.skills) ? (r.skills as Array<Record<string, unknown>>) : [];
  return {
    userId: ejsonId(r.userId),
    displayName: str(r.displayName) ?? "",
    avatarAssetId: r.avatarAssetId ? ejsonId(r.avatarAssetId) : null,
    headline: str(r.headline),
    preferredRoles: Array.isArray(r.preferredRoles) ? (r.preferredRoles as string[]) : [],
    location: str(r.location),
    skills: skills.map((s) => ({ skillId: ejsonId(s.skillId), code: str(s.code) ?? "", name: str(s.name) ?? "", icon: str(s.icon) ?? "" })),
    badgeCount: num(r.badgeCount) ?? 0,
    contributionPctX10: num(r.contributionPctX10),
    contributionWorkspaces: num(r.contributionWorkspaces),
    portfolioUrl: str(r.portfolioUrl),
    matchScore: num(r.matchScore) ?? 0,
  };
}

export class PrismaTalentSearchIndexRepository implements ITalentSearchIndexRepository {
  async find(userId: string): Promise<TalentIndexDoc | null> {
    const r = await prisma.talentSearchIndex.findUnique({ where: { userId } });
    return r ? toDoc(r) : null;
  }

  async upsert(doc: TalentIndexDoc): Promise<void> {
    const data = dataOf(doc);
    const skills = doc.skills.map((s) => ({ skillId: s.skillId, code: s.code, name: s.name, icon: s.icon }));
    const update = () => prisma.talentSearchIndex.update({ where: { userId: doc.userId }, data: { ...data, skills: { set: skills } } });
    const existing = await prisma.talentSearchIndex.findUnique({ where: { userId: doc.userId }, select: { id: true } });
    if (existing) {
      await update();
      return;
    }
    try {
      await prisma.talentSearchIndex.create({ data: { userId: doc.userId, ...data, skills } });
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
      await update();
    }
  }

  async delete(userId: string, tx?: TxHandle): Promise<number> {
    return (await (tx ?? prisma).talentSearchIndex.deleteMany({ where: { userId } })).count;
  }

  /** Đọc-sửa-ghi (chỉ chính người này chặn — không đua đáng kể); Prisma không có `$addToSet`. */
  async addBlockedCompany(userId: string, companyId: string, tx?: TxHandle): Promise<void> {
    const db = tx ?? prisma;
    const r = await db.talentSearchIndex.findUnique({ where: { userId }, select: { blockedCompanyIds: true } });
    if (!r || r.blockedCompanyIds.includes(companyId)) return;
    await db.talentSearchIndex.update({ where: { userId }, data: { blockedCompanyIds: { set: [...r.blockedCompanyIds, companyId] } } });
  }

  async removeBlockedCompany(userId: string, companyId: string, tx?: TxHandle): Promise<void> {
    const db = tx ?? prisma;
    const r = await db.talentSearchIndex.findUnique({ where: { userId }, select: { blockedCompanyIds: true } });
    if (!r || !r.blockedCompanyIds.includes(companyId)) return;
    await db.talentSearchIndex.update({ where: { userId }, data: { blockedCompanyIds: { set: r.blockedCompanyIds.filter((id) => id !== companyId) } } });
  }

  async search(pipeline: Array<Record<string, unknown>>): Promise<TalentSearchRow[]> {
    const raw = (await prisma.talentSearchIndex.aggregateRaw({ pipeline: pipeline as Prisma.InputJsonObject[] })) as unknown as Array<Record<string, unknown>>;
    return raw.map(toRow);
  }

  count(): Promise<number> {
    return prisma.talentSearchIndex.count({ where: { openToWork: true } });
  }

  async listUserIds(after: string | null, limit: number): Promise<string[]> {
    const rows = await prisma.talentSearchIndex.findMany({ where: after ? { userId: { gt: after } } : {}, orderBy: { userId: "asc" }, take: limit, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async listStaleUserIds(before: Date, limit: number): Promise<string[]> {
    const rows = await prisma.talentSearchIndex.findMany({ where: { rebuiltAt: { lt: before } }, orderBy: { rebuiltAt: "asc" }, take: limit, select: { userId: true } });
    return rows.map((r) => r.userId);
  }
}
