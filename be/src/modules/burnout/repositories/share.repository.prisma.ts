import { prisma } from "../../../infrastructure/database";
import type { WellbeingShareEntity } from "../entities/burnout.interface";
import type { IWellbeingShareRepository } from "./share.repository.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

type ShareRecord = Awaited<ReturnType<typeof prisma.wellbeingShare.findFirstOrThrow>>;

const toEntity = (r: ShareRecord): WellbeingShareEntity => ({ id: r.id, userId: r.userId, workspaceId: r.workspaceId, createdAt: r.createdAt });

export class PrismaWellbeingShareRepository implements IWellbeingShareRepository {
  async listByUser(userId: string): Promise<WellbeingShareEntity[]> {
    const rows = await prisma.wellbeingShare.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    return rows.map(toEntity);
  }

  async find(userId: string, workspaceId: string): Promise<WellbeingShareEntity | null> {
    const r = await prisma.wellbeingShare.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
    return r ? toEntity(r) : null;
  }

  async upsert(userId: string, workspaceId: string, now: Date): Promise<WellbeingShareEntity> {
    try {
      return toEntity(await prisma.wellbeingShare.upsert({ where: { userId_workspaceId: { userId, workspaceId } }, create: { userId, workspaceId, createdAt: now }, update: {} }));
    } catch (err) {
      // Hai lệnh bật chia sẻ đồng thời: bên thua thấy dòng đã tồn tại → đọc lại (idempotent, không cần ghi gì thêm).
      if (!isPrismaUniqueViolation(err)) throw err;
      return toEntity(await prisma.wellbeingShare.findUniqueOrThrow({ where: { userId_workspaceId: { userId, workspaceId } } }));
    }
  }

  async remove(userId: string, workspaceId: string): Promise<boolean> {
    const res = await prisma.wellbeingShare.deleteMany({ where: { userId, workspaceId } });
    return res.count > 0;
  }

  async listUserIdsByWorkspace(workspaceId: string): Promise<string[]> {
    const rows = await prisma.wellbeingShare.findMany({ where: { workspaceId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async deleteByUser(userId: string, tx?: TxHandle): Promise<number> {
    return (await (tx ?? prisma).wellbeingShare.deleteMany({ where: { userId } })).count;
  }
}
