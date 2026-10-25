import { newObjectId } from "../../../core/utils/object-id";
import type { CollaboratorEntity, CollaboratorRoleValue, DocumentEntity, DocumentWithState } from "../entities/document.interface";
import type { ICollaboratorRepository } from "./collaborator.repository.interface";
import type { DocumentListParams, IDocumentRepository, MetaPatch, NewDocument, PlainTextWrite, StateWrite } from "./document.repository.interface";
import type { TxHandle } from "./tx";

interface Row extends DocumentWithState {
  plainText: string;
  normalizedText: string;
}

const meta = (row: Row): DocumentEntity => ({
  id: row.id,
  workspaceId: row.workspaceId,
  title: row.title,
  normalizedTitle: row.normalizedTitle,
  visibility: row.visibility,
  status: row.status,
  yjsVersion: row.yjsVersion,
  stateBytes: row.stateBytes,
  wordCount: row.wordCount,
  lastEditedBy: row.lastEditedBy,
  lastEditedAt: row.lastEditedAt,
  createdBy: row.createdBy,
  version: row.version,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Cài đặt in-memory cho test service/job (CAS `version`/`yjsVersion` giống bản Prisma). Có thể đặt `now` để điều khiển thời gian. */
export class InMemoryDocumentRepository implements IDocumentRepository {
  readonly rows = new Map<string, Row>();
  /** Tài liệu mà `ICollaboratorRepository` của test cho là được mời — dùng dựng danh sách (đồng bộ với `InMemoryCollaboratorRepository`). */
  constructor(
    private readonly collaborators: () => ICollaboratorRepository | null = () => null,
    private readonly now: () => Date = () => new Date()
  ) {}

  async create(data: NewDocument, _tx: TxHandle): Promise<DocumentEntity> {
    const now = this.now();
    const row: Row = {
      id: newObjectId(),
      workspaceId: data.workspaceId,
      title: data.title,
      normalizedTitle: data.normalizedTitle,
      visibility: data.visibility,
      status: "ACTIVE",
      yjsState: null,
      yjsVersion: 0,
      stateBytes: 0,
      plainText: "",
      normalizedText: "",
      wordCount: 0,
      lastEditedBy: null,
      lastEditedAt: null,
      createdBy: data.createdBy,
      version: 1,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return meta(row);
  }

  async findById(id: string): Promise<DocumentEntity | null> {
    const row = this.rows.get(id);
    return row ? meta(row) : null;
  }

  async findWithState(id: string): Promise<DocumentWithState | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    return { ...meta(row), yjsState: row.yjsState ? new Uint8Array(row.yjsState) : null };
  }

  async countActive(workspaceId: string): Promise<number> {
    return [...this.rows.values()].filter((r) => r.workspaceId === workspaceId && r.status === "ACTIVE").length;
  }

  async list(p: DocumentListParams): Promise<DocumentEntity[]> {
    const invited = new Set(await (this.collaborators()?.documentIdsOfUser(p.userId) ?? Promise.resolve([])));
    const rows = [...this.rows.values()]
      .filter((r) => r.workspaceId === p.workspaceId && r.status === p.status)
      .filter((r) => (p.q ? r.normalizedTitle.includes(p.q) : true))
      .filter((r) => r.createdBy === p.userId || invited.has(r.id) || (p.seesWorkspaceDocs && r.visibility === "WORKSPACE"))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1))
      .filter((r) => {
        if (!p.cursor) return true;
        const t = r.updatedAt.getTime();
        const c = p.cursor.at.getTime();
        return t < c || (t === c && r.id < p.cursor.id);
      });
    return rows.slice(0, p.limit + 1).map(meta);
  }

  async updateMeta(id: string, expectedVersion: number, patch: MetaPatch, _tx: TxHandle): Promise<DocumentEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.version !== expectedVersion) return null;
    Object.assign(row, patch, { version: row.version + 1, updatedAt: this.now() });
    return meta(row);
  }

  async writeState(id: string, expectedYjsVersion: number, w: StateWrite, _tx: TxHandle): Promise<DocumentEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.yjsVersion !== expectedYjsVersion) return null;
    row.yjsState = new Uint8Array(w.yjsState);
    row.yjsVersion = w.yjsVersion;
    row.stateBytes = w.stateBytes;
    row.lastEditedAt = w.lastEditedAt;
    if (w.lastEditedBy) row.lastEditedBy = w.lastEditedBy;
    if (w.bumpVersion) row.version += 1;
    row.updatedAt = this.now();
    return meta(row);
  }

  async updatePlainText(id: string, yjsVersion: number, t: PlainTextWrite): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.yjsVersion !== yjsVersion) return false;
    Object.assign(row, t);
    return true;
  }

  async findSnapshotCandidates(since: Date, afterId: string | null, limit: number): Promise<DocumentEntity[]> {
    return [...this.rows.values()]
      .filter((r) => r.status === "ACTIVE" && r.yjsVersion > 0 && r.lastEditedAt !== null && r.lastEditedAt >= since && (!afterId || r.id > afterId))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map(meta);
  }

  async listLargest(limit: number): Promise<DocumentEntity[]> {
    return [...this.rows.values()].filter((r) => r.stateBytes > 0).sort((a, b) => b.stateBytes - a.stateBytes).slice(0, limit).map(meta);
  }

  /** Test: đọc văn bản phẳng đã trích. */
  plainTextOf(id: string): string | undefined {
    return this.rows.get(id)?.plainText;
  }
}

export class InMemoryCollaboratorRepository implements ICollaboratorRepository {
  readonly rows: CollaboratorEntity[] = [];

  async list(documentId: string): Promise<CollaboratorEntity[]> {
    return this.rows.filter((r) => r.documentId === documentId);
  }

  async find(documentId: string, userId: string): Promise<CollaboratorEntity | null> {
    return this.rows.find((r) => r.documentId === documentId && r.userId === userId) ?? null;
  }

  async count(documentId: string): Promise<number> {
    return this.rows.filter((r) => r.documentId === documentId).length;
  }

  async upsertMany(
    documentId: string,
    rows: Array<{ userId: string; role: CollaboratorRoleValue }>,
    addedBy: string,
    _tx: TxHandle
  ): Promise<{ addedUserIds: string[]; changedUserIds: string[] }> {
    const addedUserIds: string[] = [];
    const changedUserIds: string[] = [];
    for (const r of rows) {
      const existing = this.rows.find((x) => x.documentId === documentId && x.userId === r.userId);
      if (!existing) {
        this.rows.push({ id: newObjectId(), documentId, userId: r.userId, role: r.role, addedBy, createdAt: new Date() });
        addedUserIds.push(r.userId);
      } else if (existing.role !== r.role) {
        existing.role = r.role;
        changedUserIds.push(r.userId);
      }
    }
    return { addedUserIds, changedUserIds };
  }

  async remove(documentId: string, userId: string, _tx: TxHandle): Promise<boolean> {
    const i = this.rows.findIndex((r) => r.documentId === documentId && r.userId === userId);
    if (i < 0) return false;
    this.rows.splice(i, 1);
    return true;
  }

  async documentIdsOfUser(userId: string): Promise<string[]> {
    return this.rows.filter((r) => r.userId === userId).map((r) => r.documentId);
  }

  async userIdsOfDocument(documentId: string): Promise<string[]> {
    return this.rows.filter((r) => r.documentId === documentId).map((r) => r.userId);
  }

  async rolesOfUser(userId: string, documentIds: string[]): Promise<Map<string, CollaboratorRoleValue>> {
    return new Map(this.rows.filter((r) => r.userId === userId && documentIds.includes(r.documentId)).map((r) => [r.documentId, r.role]));
  }
}
