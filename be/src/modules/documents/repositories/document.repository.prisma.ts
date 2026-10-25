import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { DocumentEntity, DocumentWithState } from "../entities/document.interface";
import type { DocumentListParams, IDocumentRepository, MetaPatch, NewDocument, PlainTextWrite, StateWrite } from "./document.repository.interface";
import type { TxHandle } from "./tx";

/** KHÔNG chọn `yjsState`/`plainText`/`normalizedText` (nặng) — metadata luôn nhẹ; state chỉ tải qua `findWithState`. */
const META_SELECT = {
  id: true,
  workspaceId: true,
  title: true,
  normalizedTitle: true,
  visibility: true,
  status: true,
  yjsVersion: true,
  stateBytes: true,
  wordCount: true,
  lastEditedBy: true,
  lastEditedAt: true,
  createdBy: true,
  version: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect;

type MetaRow = Prisma.DocumentGetPayload<{ select: typeof META_SELECT }>;

const toEntity = (row: MetaRow): DocumentEntity => ({ ...row });

export class PrismaDocumentRepository implements IDocumentRepository {
  async create(data: NewDocument, tx: TxHandle): Promise<DocumentEntity> {
    // Ghi `null` TƯỜNG MINH cho trường optional (Prisma-Mongo không khớp `{field: null}` với trường vắng — xem be_prisma_mongo_null_vs_absent).
    const row = await tx.document.create({
      data: {
        workspaceId: data.workspaceId,
        title: data.title,
        normalizedTitle: data.normalizedTitle,
        visibility: data.visibility,
        status: "ACTIVE",
        yjsState: null,
        lastEditedBy: null,
        lastEditedAt: null,
        archivedAt: null,
        createdBy: data.createdBy,
      },
      select: META_SELECT,
    });
    return toEntity(row);
  }

  async findById(id: string): Promise<DocumentEntity | null> {
    const row = await prisma.document.findUnique({ where: { id }, select: META_SELECT });
    return row ? toEntity(row) : null;
  }

  async findWithState(id: string, tx?: TxHandle): Promise<DocumentWithState | null> {
    const client = tx ?? prisma;
    const row = await client.document.findUnique({ where: { id }, select: { ...META_SELECT, yjsState: true } });
    if (!row) return null;
    const { yjsState, ...meta } = row;
    return { ...toEntity(meta), yjsState };
  }

  countActive(workspaceId: string): Promise<number> {
    return prisma.document.count({ where: { workspaceId, status: "ACTIVE" } });
  }

  async list(p: DocumentListParams): Promise<DocumentEntity[]> {
    // Tài liệu người này ĐƯỢC MỜI (mọi workspace; lọc theo workspace ở điều kiện chính) — bị chặn bởi số lời mời của một người.
    const invited = (await prisma.documentCollaborator.findMany({ where: { userId: p.userId }, select: { documentId: true } })).map((c) => c.documentId);
    const visible: Prisma.DocumentWhereInput[] = [{ createdBy: p.userId }];
    if (p.seesWorkspaceDocs) visible.push({ visibility: "WORKSPACE" });
    if (invited.length > 0) visible.push({ id: { in: invited } });

    const and: Prisma.DocumentWhereInput[] = [{ OR: visible }];
    if (p.cursor) and.push({ OR: [{ updatedAt: { lt: p.cursor.at } }, { updatedAt: p.cursor.at, id: { lt: p.cursor.id } }] });
    const rows = await prisma.document.findMany({
      where: { workspaceId: p.workspaceId, status: p.status, ...(p.q ? { normalizedTitle: { contains: p.q } } : {}), AND: and },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: p.limit + 1,
      select: META_SELECT,
    });
    return rows.map(toEntity);
  }

  async updateMeta(id: string, expectedVersion: number, patch: MetaPatch, tx: TxHandle): Promise<DocumentEntity | null> {
    const res = await tx.document.updateMany({
      where: { id, version: expectedVersion },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.normalizedTitle !== undefined ? { normalizedTitle: patch.normalizedTitle } : {}),
        ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.archivedAt !== undefined ? { archivedAt: patch.archivedAt } : {}),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) return null;
    const row = await tx.document.findUnique({ where: { id }, select: META_SELECT });
    return row ? toEntity(row) : null;
  }

  async writeState(id: string, expectedYjsVersion: number, w: StateWrite, tx: TxHandle): Promise<DocumentEntity | null> {
    const res = await tx.document.updateMany({
      where: { id, yjsVersion: expectedYjsVersion },
      data: {
        yjsState: Buffer.from(w.yjsState),
        yjsVersion: w.yjsVersion,
        stateBytes: w.stateBytes,
        lastEditedAt: w.lastEditedAt,
        ...(w.lastEditedBy ? { lastEditedBy: w.lastEditedBy } : {}),
        ...(w.bumpVersion ? { version: { increment: 1 } } : {}),
      },
    });
    if (res.count === 0) return null;
    const row = await tx.document.findUnique({ where: { id }, select: META_SELECT });
    return row ? toEntity(row) : null;
  }

  async updatePlainText(id: string, yjsVersion: number, t: PlainTextWrite): Promise<boolean> {
    const res = await prisma.document.updateMany({
      where: { id, yjsVersion },
      data: { plainText: t.plainText, normalizedText: t.normalizedText, wordCount: t.wordCount },
    });
    return res.count > 0;
  }

  async findSnapshotCandidates(since: Date, afterId: string | null, limit: number): Promise<DocumentEntity[]> {
    const rows = await prisma.document.findMany({
      where: { status: "ACTIVE", yjsVersion: { gt: 0 }, lastEditedAt: { gte: since }, ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: "asc" },
      take: limit,
      select: META_SELECT,
    });
    return rows.map(toEntity);
  }

  async listLargest(limit: number): Promise<DocumentEntity[]> {
    const rows = await prisma.document.findMany({ where: { stateBytes: { gt: 0 } }, orderBy: { stateBytes: "desc" }, take: limit, select: META_SELECT });
    return rows.map(toEntity);
  }
}
