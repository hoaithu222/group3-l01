import { prisma } from "../../../infrastructure/database";
import type { CompanyBlock } from "../entities/recruiter.interface";
import { mapUnique, type TxHandle } from "./tx";

/** Sinh viên chặn doanh nghiệp (`CompanyBlock`, `[userId, companyId]` unique). */
export interface ICompanyBlockRepository {
  /** Trùng (`[userId, companyId]`) → `UniqueViolationError` — ⚠ trong transaction P2002 làm tx HỎNG nên service kiểm `exists` TRƯỚC và bắt lỗi Ở NGOÀI tx. */
  add(userId: string, companyId: string, tx?: TxHandle): Promise<void>;
  remove(userId: string, companyId: string, tx?: TxHandle): Promise<boolean>;
  exists(userId: string, companyId: string): Promise<boolean>;
  listByUser(userId: string): Promise<CompanyBlock[]>;
  companyIdsOf(userId: string): Promise<string[]>;
  deleteByUser(userId: string): Promise<number>;
}

export class PrismaCompanyBlockRepository implements ICompanyBlockRepository {
  async add(userId: string, companyId: string, tx?: TxHandle): Promise<void> {
    await mapUnique("userId_companyId", () => (tx ?? prisma).companyBlock.create({ data: { userId, companyId } }));
  }

  async remove(userId: string, companyId: string, tx?: TxHandle): Promise<boolean> {
    return ((await (tx ?? prisma).companyBlock.deleteMany({ where: { userId, companyId } })).count) > 0;
  }

  async exists(userId: string, companyId: string): Promise<boolean> {
    return (await prisma.companyBlock.count({ where: { userId, companyId } })) > 0;
  }

  async listByUser(userId: string): Promise<CompanyBlock[]> {
    const rows = await prisma.companyBlock.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return rows.map((r) => ({ userId: r.userId, companyId: r.companyId, createdAt: r.createdAt }));
  }

  async companyIdsOf(userId: string): Promise<string[]> {
    const rows = await prisma.companyBlock.findMany({ where: { userId }, select: { companyId: true } });
    return rows.map((r) => r.companyId);
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.companyBlock.deleteMany({ where: { userId } })).count;
  }
}
