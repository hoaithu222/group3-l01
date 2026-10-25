import type { WhiteboardCollaborator } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { CollaboratorEntity, CollaboratorRoleValue } from "../entities/whiteboard.interface";
import type { ICollaboratorRepository } from "./collaborator.repository.interface";
import type { TxHandle } from "./tx";

const toEntity = (row: WhiteboardCollaborator): CollaboratorEntity => ({
  id: row.id,
  whiteboardId: row.whiteboardId,
  userId: row.userId,
  role: row.role,
  addedBy: row.addedBy,
  createdAt: row.createdAt,
});

export class PrismaCollaboratorRepository implements ICollaboratorRepository {
  async list(whiteboardId: string): Promise<CollaboratorEntity[]> {
    const rows = await prisma.whiteboardCollaborator.findMany({ where: { whiteboardId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map(toEntity);
  }

  async find(whiteboardId: string, userId: string): Promise<CollaboratorEntity | null> {
    const row = await prisma.whiteboardCollaborator.findUnique({ where: { whiteboardId_userId: { whiteboardId, userId } } });
    return row ? toEntity(row) : null;
  }

  count(whiteboardId: string): Promise<number> {
    return prisma.whiteboardCollaborator.count({ where: { whiteboardId } });
  }

  async upsertMany(
    whiteboardId: string,
    rows: Array<{ userId: string; role: CollaboratorRoleValue }>,
    addedBy: string,
    tx: TxHandle
  ): Promise<{ addedUserIds: string[]; changedUserIds: string[] }> {
    const existing = await tx.whiteboardCollaborator.findMany({ where: { whiteboardId, userId: { in: rows.map((r) => r.userId) } } });
    const byUser = new Map(existing.map((e) => [e.userId, e]));
    const addedUserIds: string[] = [];
    const changedUserIds: string[] = [];
    const fresh = rows.filter((r) => !byUser.has(r.userId));
    if (fresh.length > 0) {
      await tx.whiteboardCollaborator.createMany({ data: fresh.map((r) => ({ whiteboardId, userId: r.userId, role: r.role, addedBy })) });
      addedUserIds.push(...fresh.map((r) => r.userId));
    }
    for (const r of rows) {
      const current = byUser.get(r.userId);
      if (current && current.role !== r.role) {
        await tx.whiteboardCollaborator.update({ where: { id: current.id }, data: { role: r.role } });
        changedUserIds.push(r.userId);
      }
    }
    return { addedUserIds, changedUserIds };
  }

  async remove(whiteboardId: string, userId: string, tx: TxHandle): Promise<boolean> {
    const res = await tx.whiteboardCollaborator.deleteMany({ where: { whiteboardId, userId } });
    return res.count > 0;
  }

  async whiteboardIdsOfUser(userId: string): Promise<string[]> {
    const rows = await prisma.whiteboardCollaborator.findMany({ where: { userId }, select: { whiteboardId: true } });
    return rows.map((r) => r.whiteboardId);
  }

  async userIdsOfWhiteboard(whiteboardId: string): Promise<string[]> {
    const rows = await prisma.whiteboardCollaborator.findMany({ where: { whiteboardId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async rolesOfUser(userId: string, whiteboardIds: string[]): Promise<Map<string, CollaboratorRoleValue>> {
    if (whiteboardIds.length === 0) return new Map();
    const rows = await prisma.whiteboardCollaborator.findMany({ where: { userId, whiteboardId: { in: whiteboardIds } }, select: { whiteboardId: true, role: true } });
    return new Map(rows.map((r) => [r.whiteboardId, r.role]));
  }
}
