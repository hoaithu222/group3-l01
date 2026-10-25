import type { DocumentCollaborator } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { CollaboratorEntity, CollaboratorRoleValue } from "../entities/document.interface";
import type { ICollaboratorRepository } from "./collaborator.repository.interface";
import type { TxHandle } from "./tx";

const toEntity = (row: DocumentCollaborator): CollaboratorEntity => ({
  id: row.id,
  documentId: row.documentId,
  userId: row.userId,
  role: row.role,
  addedBy: row.addedBy,
  createdAt: row.createdAt,
});

export class PrismaCollaboratorRepository implements ICollaboratorRepository {
  async list(documentId: string): Promise<CollaboratorEntity[]> {
    const rows = await prisma.documentCollaborator.findMany({ where: { documentId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map(toEntity);
  }

  async find(documentId: string, userId: string): Promise<CollaboratorEntity | null> {
    const row = await prisma.documentCollaborator.findUnique({ where: { documentId_userId: { documentId, userId } } });
    return row ? toEntity(row) : null;
  }

  count(documentId: string): Promise<number> {
    return prisma.documentCollaborator.count({ where: { documentId } });
  }

  async upsertMany(
    documentId: string,
    rows: Array<{ userId: string; role: CollaboratorRoleValue }>,
    addedBy: string,
    tx: TxHandle
  ): Promise<{ addedUserIds: string[]; changedUserIds: string[] }> {
    const existing = await tx.documentCollaborator.findMany({ where: { documentId, userId: { in: rows.map((r) => r.userId) } } });
    const byUser = new Map(existing.map((e) => [e.userId, e]));
    const addedUserIds: string[] = [];
    const changedUserIds: string[] = [];
    const fresh = rows.filter((r) => !byUser.has(r.userId));
    if (fresh.length > 0) {
      await tx.documentCollaborator.createMany({ data: fresh.map((r) => ({ documentId, userId: r.userId, role: r.role, addedBy })) });
      addedUserIds.push(...fresh.map((r) => r.userId));
    }
    for (const r of rows) {
      const current = byUser.get(r.userId);
      if (current && current.role !== r.role) {
        await tx.documentCollaborator.update({ where: { id: current.id }, data: { role: r.role } });
        changedUserIds.push(r.userId);
      }
    }
    return { addedUserIds, changedUserIds };
  }

  async remove(documentId: string, userId: string, tx: TxHandle): Promise<boolean> {
    const res = await tx.documentCollaborator.deleteMany({ where: { documentId, userId } });
    return res.count > 0;
  }

  async documentIdsOfUser(userId: string): Promise<string[]> {
    const rows = await prisma.documentCollaborator.findMany({ where: { userId }, select: { documentId: true } });
    return rows.map((r) => r.documentId);
  }

  async userIdsOfDocument(documentId: string): Promise<string[]> {
    const rows = await prisma.documentCollaborator.findMany({ where: { documentId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async rolesOfUser(userId: string, documentIds: string[]): Promise<Map<string, CollaboratorRoleValue>> {
    if (documentIds.length === 0) return new Map();
    const rows = await prisma.documentCollaborator.findMany({ where: { userId, documentId: { in: documentIds } }, select: { documentId: true, role: true } });
    return new Map(rows.map((r) => [r.documentId, r.role]));
  }
}
