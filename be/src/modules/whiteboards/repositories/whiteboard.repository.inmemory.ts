import { newObjectId } from "../../../core/utils/object-id";
import type { CollaboratorEntity, CollaboratorRoleValue, WhiteboardEntity, WhiteboardWithState } from "../entities/whiteboard.interface";
import type { ICollaboratorRepository } from "./collaborator.repository.interface";
import type { IWhiteboardRepository, MetaPatch, NewWhiteboard, StateWrite, WhiteboardListParams } from "./whiteboard.repository.interface";
import type { TxHandle } from "./tx";

const meta = (row: WhiteboardWithState): WhiteboardEntity => ({
  id: row.id,
  workspaceId: row.workspaceId,
  name: row.name,
  normalizedName: row.normalizedName,
  visibility: row.visibility,
  status: row.status,
  yjsVersion: row.yjsVersion,
  elementCount: row.elementCount,
  thumbnailAssetId: row.thumbnailAssetId,
  lastEditedBy: row.lastEditedBy,
  lastEditedAt: row.lastEditedAt,
  createdBy: row.createdBy,
  version: row.version,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Cài đặt in-memory cho test service/job (CAS `version`/`yjsVersion` giống bản Prisma). Có thể đặt `now` để điều khiển thời gian. */
export class InMemoryWhiteboardRepository implements IWhiteboardRepository {
  readonly rows = new Map<string, WhiteboardWithState>();

  /** `collaborators` cho biết bảng mà một người được mời — đồng bộ với `InMemoryCollaboratorRepository` của test. */
  constructor(
    private readonly collaborators: () => ICollaboratorRepository | null = () => null,
    private readonly now: () => Date = () => new Date()
  ) {}

  async create(data: NewWhiteboard, _tx: TxHandle): Promise<WhiteboardEntity> {
    const now = this.now();
    const row: WhiteboardWithState = {
      id: newObjectId(),
      workspaceId: data.workspaceId,
      name: data.name,
      normalizedName: data.normalizedName,
      visibility: data.visibility,
      status: "ACTIVE",
      yjsState: null,
      yjsVersion: 0,
      elementCount: 0,
      thumbnailAssetId: null,
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

  async findById(id: string): Promise<WhiteboardEntity | null> {
    const row = this.rows.get(id);
    return row ? meta(row) : null;
  }

  async findWithState(id: string): Promise<WhiteboardWithState | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    return { ...meta(row), yjsState: row.yjsState ? new Uint8Array(row.yjsState) : null };
  }

  async countActive(workspaceId: string): Promise<number> {
    return [...this.rows.values()].filter((r) => r.workspaceId === workspaceId && r.status === "ACTIVE").length;
  }

  async list(p: WhiteboardListParams): Promise<WhiteboardEntity[]> {
    const invited = new Set(await (this.collaborators()?.whiteboardIdsOfUser(p.userId) ?? Promise.resolve([])));
    const rows = [...this.rows.values()]
      .filter((r) => r.workspaceId === p.workspaceId && r.status === p.status)
      .filter((r) => (p.q ? r.normalizedName.includes(p.q) : true))
      .filter((r) => r.createdBy === p.userId || invited.has(r.id) || (p.seesWorkspaceBoards && r.visibility === "WORKSPACE"))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1))
      .filter((r) => {
        if (!p.cursor) return true;
        const t = r.updatedAt.getTime();
        const c = p.cursor.at.getTime();
        return t < c || (t === c && r.id < p.cursor.id);
      });
    return rows.slice(0, p.limit + 1).map(meta);
  }

  async updateMeta(id: string, expectedVersion: number, patch: MetaPatch, _tx: TxHandle): Promise<WhiteboardEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.version !== expectedVersion) return null;
    Object.assign(row, patch, { version: row.version + 1, updatedAt: this.now() });
    return meta(row);
  }

  async writeState(id: string, expectedYjsVersion: number, w: StateWrite, _tx: TxHandle): Promise<WhiteboardEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.yjsVersion !== expectedYjsVersion) return null;
    row.yjsState = new Uint8Array(w.yjsState);
    row.yjsVersion = w.yjsVersion;
    row.elementCount = w.elementCount;
    row.lastEditedAt = w.lastEditedAt;
    if (w.lastEditedBy) row.lastEditedBy = w.lastEditedBy;
    if (w.bumpVersion) row.version += 1;
    row.updatedAt = this.now();
    return meta(row);
  }

  async findSnapshotCandidates(since: Date, afterId: string | null, limit: number): Promise<WhiteboardEntity[]> {
    return [...this.rows.values()]
      .filter((r) => r.status === "ACTIVE" && r.yjsVersion > 0 && r.lastEditedAt !== null && r.lastEditedAt >= since && (!afterId || r.id > afterId))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map(meta);
  }
}

export class InMemoryCollaboratorRepository implements ICollaboratorRepository {
  readonly rows: CollaboratorEntity[] = [];

  async list(whiteboardId: string): Promise<CollaboratorEntity[]> {
    return this.rows.filter((r) => r.whiteboardId === whiteboardId);
  }

  async find(whiteboardId: string, userId: string): Promise<CollaboratorEntity | null> {
    return this.rows.find((r) => r.whiteboardId === whiteboardId && r.userId === userId) ?? null;
  }

  async count(whiteboardId: string): Promise<number> {
    return this.rows.filter((r) => r.whiteboardId === whiteboardId).length;
  }

  async upsertMany(
    whiteboardId: string,
    rows: Array<{ userId: string; role: CollaboratorRoleValue }>,
    addedBy: string,
    _tx: TxHandle
  ): Promise<{ addedUserIds: string[]; changedUserIds: string[] }> {
    const addedUserIds: string[] = [];
    const changedUserIds: string[] = [];
    for (const r of rows) {
      const existing = this.rows.find((x) => x.whiteboardId === whiteboardId && x.userId === r.userId);
      if (!existing) {
        this.rows.push({ id: newObjectId(), whiteboardId, userId: r.userId, role: r.role, addedBy, createdAt: new Date() });
        addedUserIds.push(r.userId);
      } else if (existing.role !== r.role) {
        existing.role = r.role;
        changedUserIds.push(r.userId);
      }
    }
    return { addedUserIds, changedUserIds };
  }

  async remove(whiteboardId: string, userId: string, _tx: TxHandle): Promise<boolean> {
    const i = this.rows.findIndex((r) => r.whiteboardId === whiteboardId && r.userId === userId);
    if (i < 0) return false;
    this.rows.splice(i, 1);
    return true;
  }

  async whiteboardIdsOfUser(userId: string): Promise<string[]> {
    return this.rows.filter((r) => r.userId === userId).map((r) => r.whiteboardId);
  }

  async userIdsOfWhiteboard(whiteboardId: string): Promise<string[]> {
    return this.rows.filter((r) => r.whiteboardId === whiteboardId).map((r) => r.userId);
  }

  async rolesOfUser(userId: string, whiteboardIds: string[]): Promise<Map<string, CollaboratorRoleValue>> {
    return new Map(this.rows.filter((r) => r.userId === userId && whiteboardIds.includes(r.whiteboardId)).map((r) => [r.whiteboardId, r.role]));
  }
}
