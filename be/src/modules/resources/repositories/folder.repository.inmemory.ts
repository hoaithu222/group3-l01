import { rscErrors } from "../errors";
import { ROOT_KEY, deletedNameKey, type Folder, type FolderCreateInput, type FolderMoveInput } from "../entities/folder.interface";
import type { FolderSubtreeChange, IFolderRepository } from "./folder.repository.interface";
import type { TxHandle } from "./tx";

/** Repo in-memory cho unit test — mô phỏng unique `(workspaceId, parentKey, nameKey)`, CAS `version`, thao tác cây con. */
export class InMemoryFolderRepository implements IFolderRepository {
  readonly store = new Map<string, Folder>();

  private isTaken(candidate: { id: string; workspaceId: string; parentKey: string; nameKey: string }): boolean {
    return [...this.store.values()].some(
      (f) =>
        f.id !== candidate.id &&
        f.workspaceId === candidate.workspaceId &&
        f.parentKey === candidate.parentKey &&
        f.nameKey === candidate.nameKey
    );
  }

  private inSubtree(f: Folder, folderId: string): boolean {
    return f.id === folderId || f.path.includes(folderId);
  }

  findById(id: string, _tx?: TxHandle): Promise<Folder | null> {
    const found = this.store.get(id);
    return Promise.resolve(found ? { ...found } : null);
  }

  listChildren(workspaceId: string, parentKey: string, limit: number): Promise<Folder[]> {
    return Promise.resolve(
      [...this.store.values()]
        .filter((f) => f.workspaceId === workspaceId && f.parentKey === parentKey && f.deletedAt === null)
        .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName))
        .slice(0, limit)
        .map((f) => ({ ...f }))
    );
  }

  findByIds(ids: string[]): Promise<Folder[]> {
    return Promise.resolve(ids.map((id) => this.store.get(id)).filter((f): f is Folder => f !== undefined).map((f) => ({ ...f })));
  }

  countActiveChildren(folderId: string, _tx?: TxHandle): Promise<number> {
    return Promise.resolve([...this.store.values()].filter((f) => f.parentId === folderId && f.deletedAt === null).length);
  }

  countChildren(folderId: string): Promise<number> {
    return Promise.resolve([...this.store.values()].filter((f) => f.parentId === folderId).length);
  }

  maxDescendantDepth(workspaceId: string, folderId: string, _tx?: TxHandle): Promise<number> {
    const depths = [...this.store.values()]
      .filter((f) => f.workspaceId === workspaceId && f.path.includes(folderId))
      .map((f) => f.depth);
    return Promise.resolve(depths.length === 0 ? 0 : Math.max(...depths));
  }

  create(input: FolderCreateInput, _tx: TxHandle): Promise<Folder> {
    const parentKey = input.parentId ?? ROOT_KEY;
    if (this.isTaken({ id: input.id, workspaceId: input.workspaceId, parentKey, nameKey: input.normalizedName })) {
      return Promise.reject(rscErrors.folderNameTaken());
    }
    const now = new Date();
    const folder: Folder = {
      id: input.id,
      workspaceId: input.workspaceId,
      parentId: input.parentId,
      parentKey,
      path: [...input.path],
      depth: input.depth,
      name: input.name,
      normalizedName: input.normalizedName,
      nameKey: input.normalizedName,
      createdBy: input.createdBy,
      deletedAt: null,
      deletedBy: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(folder.id, folder);
    return Promise.resolve({ ...folder });
  }

  updateWithVersion(id: string, expectedVersion: number, patch: FolderMoveInput, _tx: TxHandle): Promise<Folder | null> {
    const current = this.store.get(id);
    if (!current || current.deletedAt !== null || current.version !== expectedVersion) return Promise.resolve(null);
    const parentKey = patch.parentId ?? ROOT_KEY;
    if (this.isTaken({ id, workspaceId: current.workspaceId, parentKey, nameKey: patch.normalizedName })) {
      return Promise.reject(rscErrors.folderNameTaken());
    }
    const updated: Folder = {
      ...current,
      name: patch.name,
      normalizedName: patch.normalizedName,
      nameKey: patch.normalizedName,
      parentId: patch.parentId,
      parentKey,
      path: [...patch.path],
      depth: patch.depth,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    this.store.set(id, updated);
    return Promise.resolve({ ...updated });
  }

  rebaseDescendants(
    _tx: TxHandle,
    args: { workspaceId: string; folderId: string; oldAncestorsLength: number; newAncestors: string[]; depthDelta: number }
  ): Promise<void> {
    for (const f of this.store.values()) {
      if (f.workspaceId !== args.workspaceId || !f.path.includes(args.folderId)) continue;
      f.path = [...args.newAncestors, ...f.path.slice(args.oldAncestorsLength)];
      f.depth += args.depthDelta;
    }
    return Promise.resolve();
  }

  touch(_tx: TxHandle, id: string): Promise<void> {
    const f = this.store.get(id);
    if (f) f.updatedAt = new Date();
    return Promise.resolve();
  }

  softDeleteSubtree(
    _tx: TxHandle,
    args: { workspaceId: string; folderId: string; at: Date; by: string }
  ): Promise<FolderSubtreeChange> {
    const targets = [...this.store.values()].filter(
      (f) => f.workspaceId === args.workspaceId && f.deletedAt === null && this.inSubtree(f, args.folderId)
    );
    for (const f of targets) {
      f.deletedAt = args.at;
      f.deletedBy = args.by;
      f.nameKey = deletedNameKey(f.normalizedName, f.id);
      f.version += 1;
    }
    return Promise.resolve({ folderIds: targets.map((f) => f.id) });
  }

  restoreSubtree(
    _tx: TxHandle,
    args: { workspaceId: string; folderId: string; deletedAt: Date }
  ): Promise<FolderSubtreeChange> {
    const targets = [...this.store.values()].filter(
      (f) =>
        f.workspaceId === args.workspaceId &&
        f.deletedAt !== null &&
        f.deletedAt.getTime() === args.deletedAt.getTime() &&
        this.inSubtree(f, args.folderId)
    );
    for (const f of targets) {
      if (this.isTaken({ id: f.id, workspaceId: f.workspaceId, parentKey: f.parentKey, nameKey: f.normalizedName })) {
        return Promise.reject(rscErrors.folderNameTaken());
      }
    }
    for (const f of targets) {
      f.deletedAt = null;
      f.deletedBy = null;
      f.nameKey = f.normalizedName;
      f.version += 1;
    }
    return Promise.resolve({ folderIds: targets.map((f) => f.id) });
  }

  listTrash(args: {
    workspaceId: string;
    deletedBy?: string;
    deletedAfter: Date;
    before?: { at: Date; id: string };
    limit: number;
  }): Promise<Folder[]> {
    return Promise.resolve(
      [...this.store.values()]
        .filter(
          (f) =>
            f.workspaceId === args.workspaceId &&
            f.deletedAt !== null &&
            f.deletedAt > args.deletedAfter &&
            (!args.deletedBy || f.deletedBy === args.deletedBy) &&
            (!args.before ||
              f.deletedAt < args.before.at ||
              (f.deletedAt.getTime() === args.before.at.getTime() && f.id < args.before.id))
        )
        .sort((a, b) => (b.deletedAt as Date).getTime() - (a.deletedAt as Date).getTime() || b.id.localeCompare(a.id))
        .slice(0, args.limit)
        .map((f) => ({ ...f }))
    );
  }

  findPurgeCandidates(before: Date, limit: number): Promise<Folder[]> {
    return Promise.resolve(
      [...this.store.values()]
        .filter((f) => f.deletedAt !== null && f.deletedAt < before)
        .sort((a, b) => (a.deletedAt as Date).getTime() - (b.deletedAt as Date).getTime())
        .slice(0, limit)
        .map((f) => ({ ...f }))
    );
  }

  hardDelete(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (this.store.get(id)?.deletedAt && this.store.delete(id)) count += 1;
    }
    return Promise.resolve(count);
  }

  countActive(workspaceId: string): Promise<number> {
    return Promise.resolve([...this.store.values()].filter((f) => f.workspaceId === workspaceId && f.deletedAt === null).length);
  }
}
