import type { CompanyMember as PrismaMember } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { memberActiveKey, memberRemovedKey } from "../domain/company-keys";
import type { CompanyMember, CompanyMemberRole } from "../entities/recruiter.interface";
import type { ICompanyMemberRepository } from "./company-member.repository.interface";
import { mapUnique, type TxHandle } from "./tx";

const toMember = (r: PrismaMember): CompanyMember => ({
  id: r.id,
  companyId: r.companyId,
  userId: r.userId,
  role: r.role,
  status: r.status,
  activeKey: r.activeKey,
  invitedBy: r.invitedBy ?? null,
  joinedAt: r.joinedAt,
  removedAt: r.removedAt ?? null,
});

const db = (tx?: TxHandle) => tx ?? prisma;

export class PrismaCompanyMemberRepository implements ICompanyMemberRepository {
  async findActiveByUser(userId: string, tx?: TxHandle): Promise<CompanyMember | null> {
    const r = await db(tx).companyMember.findFirst({ where: { userId, status: "ACTIVE" } });
    return r ? toMember(r) : null;
  }

  async findByCompanyUser(companyId: string, userId: string, tx?: TxHandle): Promise<CompanyMember | null> {
    const r = await db(tx).companyMember.findUnique({ where: { companyId_userId: { companyId, userId } } });
    return r ? toMember(r) : null;
  }

  async listByCompany(companyId: string, opts: { activeOnly?: boolean } = {}): Promise<CompanyMember[]> {
    const rows = await prisma.companyMember.findMany({ where: { companyId, ...(opts.activeOnly ? { status: "ACTIVE" as const } : {}) }, orderBy: [{ joinedAt: "asc" }, { id: "asc" }] });
    return rows.map(toMember);
  }

  async activeUserIds(companyId: string, tx?: TxHandle): Promise<string[]> {
    const rows = await db(tx).companyMember.findMany({ where: { companyId, status: "ACTIVE" }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  countActive(companyId: string, tx?: TxHandle): Promise<number> {
    return db(tx).companyMember.count({ where: { companyId, status: "ACTIVE" } });
  }

  countActiveOwners(companyId: string, tx?: TxHandle): Promise<number> {
    return db(tx).companyMember.count({ where: { companyId, status: "ACTIVE", role: "OWNER" } });
  }

  create(input: { id: string; companyId: string; userId: string; role: CompanyMemberRole; invitedBy: string | null }, tx?: TxHandle): Promise<CompanyMember> {
    return mapUnique("activeKey", async () =>
      toMember(
        await db(tx).companyMember.create({
          data: { id: input.id, companyId: input.companyId, userId: input.userId, role: input.role, status: "ACTIVE", activeKey: memberActiveKey(input.userId), invitedBy: input.invitedBy, removedAt: null },
        })
      )
    );
  }

  reactivate(id: string, userId: string, role: CompanyMemberRole, invitedBy: string | null, tx?: TxHandle): Promise<CompanyMember | null> {
    return mapUnique("activeKey", async () => {
      const res = await db(tx).companyMember.updateMany({
        where: { id, status: "REMOVED" },
        data: { status: "ACTIVE", role, activeKey: memberActiveKey(userId), invitedBy, removedAt: null, joinedAt: new Date() },
      });
      if (res.count === 0) return null;
      const r = await db(tx).companyMember.findUnique({ where: { id } });
      return r ? toMember(r) : null;
    });
  }

  async remove(id: string, tx?: TxHandle): Promise<boolean> {
    const res = await db(tx).companyMember.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "REMOVED", activeKey: memberRemovedKey(id), removedAt: new Date() } });
    return res.count > 0;
  }

  async activeByUser(userId: string, tx?: TxHandle): Promise<CompanyMember[]> {
    const rows = await db(tx).companyMember.findMany({ where: { userId, status: "ACTIVE" } });
    return rows.map(toMember);
  }

  async countActiveByCompanies(companyIds: readonly string[]): Promise<Map<string, number>> {
    if (companyIds.length === 0) return new Map();
    const rows = await prisma.companyMember.findMany({ where: { companyId: { in: [...companyIds] }, status: "ACTIVE" }, select: { companyId: true } });
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.companyId, (out.get(r.companyId) ?? 0) + 1);
    return out;
  }
}
