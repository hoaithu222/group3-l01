import { rscErrors } from "../errors";
import { ROOT_KEY } from "../entities/folder.interface";
import type {
  Resource,
  ResourceCreateInput,
  ResourceListParams,
  ResourcePatchInput,
  ResourceTypeUsage,
  TrashListParams,
} from "../entities/resource.interface";
import type { AffectedResource, IResourceRepository } from "./resource.repository.interface";
import type { TxHandle } from "./tx";

type SortValue = string | number | Date;

function sortValueOf(r: Resource, sort: ResourceListParams["sort"]): SortValue {
  return sort === "name" ? r.normalizedName : sort === "size" ? r.size : r.createdAt;
}

function compare(a: SortValue, b: SortValue): number {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  return av < bv ? -1 : av > bv ? 1 : 0;
}

/** Repo in-memory cho unit test — cùng ngữ nghĩa CAS `version`, xoá mềm, cursor `(giá trị sắp, id)` như bản Prisma. */
export class InMemoryResourceRepository implements IResourceRepository {
  readonly store = new Map<string, Resource>();

  findById(id: string, _tx?: TxHandle): Promise<Resource | null> {
    const found = this.store.get(id);
    return Promise.resolve(found ? { ...found } : null);
  }

  findByIds(ids: string[]): Promise<Resource[]> {
    return Promise.resolve(ids.map((id) => this.store.get(id)).filter((r): r is Resource => r !== undefined).map((r) => ({ ...r })));
  }

  create(input: ResourceCreateInput, _tx: TxHandle): Promise<Resource> {
    if ([...this.store.values()].some((r) => r.assetId === input.assetId)) return Promise.reject(rscErrors.assetNotAttachable());
    const now = new Date();
    const resource: Resource = {
      ...input,
      tags: [...input.tags],
      folderKey: input.folderId ?? ROOT_KEY,
      previewAssetId: null,
      version: 1,
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(resource.id, resource);
    return Promise.resolve({ ...resource });
  }

  list(params: ResourceListParams): Promise<Resource[]> {
    const dir = params.order === "desc" ? -1 : 1;
    const rows = [...this.store.values()]
      .filter(
        (r) =>
          r.workspaceId === params.workspaceId &&
          r.deletedAt === null &&
          (params.folderKey === undefined || r.folderKey === params.folderKey) &&
          (!params.type || r.type === params.type) &&
          (params.terms ?? []).every((t) => r.normalizedName.includes(t))
      )
      .sort((a, b) => dir * (compare(sortValueOf(a, params.sort), sortValueOf(b, params.sort)) || compare(a.id, b.id)));
    const after = params.after;
    const page = after
      ? rows.filter((r) => {
          const c = compare(sortValueOf(r, params.sort), after.value) || compare(r.id, after.id);
          return dir * c > 0;
        })
      : rows;
    return Promise.resolve(page.slice(0, params.limit).map((r) => ({ ...r })));
  }

  countActiveInFolder(folderId: string, _tx?: TxHandle): Promise<number> {
    return Promise.resolve([...this.store.values()].filter((r) => r.folderId === folderId && r.deletedAt === null).length);
  }

  countInFolders(folderIds: string[]): Promise<number> {
    return Promise.resolve([...this.store.values()].filter((r) => r.folderId !== null && folderIds.includes(r.folderId)).length);
  }

  updateWithVersion(id: string, expectedVersion: number, patch: ResourcePatchInput, _tx: TxHandle): Promise<Resource | null> {
    const current = this.store.get(id);
    if (!current || current.deletedAt !== null || current.version !== expectedVersion) return Promise.resolve(null);
    const { folderId, ...rest } = patch;
    Object.assign(current, rest, { version: current.version + 1, updatedAt: new Date() });
    if (folderId !== undefined) {
      current.folderId = folderId;
      current.folderKey = folderId ?? ROOT_KEY;
    }
    return Promise.resolve({ ...current });
  }

  softDelete(id: string, at: Date, by: string, _tx: TxHandle): Promise<Resource | null> {
    const current = this.store.get(id);
    if (!current || current.deletedAt !== null) return Promise.resolve(null);
    Object.assign(current, { deletedAt: at, deletedBy: by, version: current.version + 1 });
    return Promise.resolve({ ...current });
  }

  restore(id: string, folderId: string | null, _tx: TxHandle): Promise<Resource | null> {
    const current = this.store.get(id);
    if (!current || current.deletedAt === null) return Promise.resolve(null);
    Object.assign(current, {
      deletedAt: null,
      deletedBy: null,
      folderId,
      folderKey: folderId ?? ROOT_KEY,
      version: current.version + 1,
    });
    return Promise.resolve({ ...current });
  }

  softDeleteInFolders(
    _tx: TxHandle,
    args: { workspaceId: string; folderIds: string[]; at: Date; by: string }
  ): Promise<AffectedResource[]> {
    const targets = [...this.store.values()].filter(
      (r) =>
        r.workspaceId === args.workspaceId && r.deletedAt === null && r.folderId !== null && args.folderIds.includes(r.folderId)
    );
    for (const r of targets) Object.assign(r, { deletedAt: args.at, deletedBy: args.by, version: r.version + 1 });
    return Promise.resolve(targets.map((r) => ({ id: r.id, folderId: r.folderId, version: r.version })));
  }

  restoreInFolders(
    _tx: TxHandle,
    args: { workspaceId: string; folderIds: string[]; deletedAt: Date }
  ): Promise<AffectedResource[]> {
    const targets = [...this.store.values()].filter(
      (r) =>
        r.workspaceId === args.workspaceId &&
        r.deletedAt !== null &&
        r.deletedAt.getTime() === args.deletedAt.getTime() &&
        r.folderId !== null &&
        args.folderIds.includes(r.folderId)
    );
    for (const r of targets) Object.assign(r, { deletedAt: null, deletedBy: null, version: r.version + 1 });
    return Promise.resolve(targets.map((r) => ({ id: r.id, folderId: r.folderId, version: r.version })));
  }

  listTrash(params: TrashListParams): Promise<Resource[]> {
    return Promise.resolve(
      [...this.store.values()]
        .filter(
          (r) =>
            r.workspaceId === params.workspaceId &&
            r.deletedAt !== null &&
            r.deletedAt > params.deletedAfter &&
            (!params.deletedBy || r.deletedBy === params.deletedBy) &&
            (!params.before ||
              r.deletedAt < params.before.at ||
              (r.deletedAt.getTime() === params.before.at.getTime() && r.id < params.before.id))
        )
        .sort((a, b) => (b.deletedAt as Date).getTime() - (a.deletedAt as Date).getTime() || b.id.localeCompare(a.id))
        .slice(0, params.limit)
        .map((r) => ({ ...r }))
    );
  }

  findPurgeCandidates(before: Date, limit: number): Promise<Resource[]> {
    return Promise.resolve(
      [...this.store.values()]
        .filter((r) => r.deletedAt !== null && r.deletedAt < before)
        .sort((a, b) => (a.deletedAt as Date).getTime() - (b.deletedAt as Date).getTime())
        .slice(0, limit)
        .map((r) => ({ ...r }))
    );
  }

  deleteById(id: string, _tx: TxHandle): Promise<boolean> {
    const current = this.store.get(id);
    if (!current || current.deletedAt === null) return Promise.resolve(false);
    return Promise.resolve(this.store.delete(id));
  }

  usageByType(workspaceId: string): Promise<ResourceTypeUsage[]> {
    const byType = new Map<Resource["type"], ResourceTypeUsage>();
    for (const r of this.store.values()) {
      if (r.workspaceId !== workspaceId || r.deletedAt !== null) continue;
      const row = byType.get(r.type) ?? { type: r.type, count: 0, bytes: 0 };
      row.count += 1;
      row.bytes += r.size;
      byType.set(r.type, row);
    }
    return Promise.resolve([...byType.values()]);
  }

  trashBytes(workspaceId: string): Promise<number> {
    return Promise.resolve(
      [...this.store.values()].filter((r) => r.workspaceId === workspaceId && r.deletedAt !== null).reduce((sum, r) => sum + r.size, 0)
    );
  }
}
