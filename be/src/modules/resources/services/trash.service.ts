import { NotFoundError } from "../../../core/exceptions";
import type { ResolvedAccess } from "../../../core/permission";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { AuthUser } from "../../../core/types/express";
import type { Folder } from "../entities/folder.interface";
import type { Resource } from "../entities/resource.interface";
import type { IFolderRepository } from "../repositories/folder.repository.interface";
import type { IResourceRepository } from "../repositories/resource.repository.interface";
import type { IUserDirectory } from "../repositories/user-directory";
import type { IAssetPort } from "./asset-port";
import { DAY_MS } from "./resource.deps";
import { toFolderDto, toResourceDto, toResourceRow, type FolderDto, type ResourceDto } from "./resource.presenter";
import type { ResourcePurgeService } from "./resource-purge.service";
import type { StorageQuotaService } from "./storage-quota.service";
import type { StorageUsageDto, StorageUsageService } from "./storage-usage.service";
import { canModify, isPrivileged, type IWorkspaceAccess } from "./workspace-access";

/** Mục thùng rác: `purgeAt` = thời điểm bị xoá vĩnh viễn; `canRestore` = OWNER/ADMIN hoặc chính người đã xoá; `canPurge` = OWNER/ADMIN. */
export interface TrashMeta {
  purgeAt: Date;
  canRestore: boolean;
  canPurge: boolean;
}
export type TrashFolderDto = FolderDto & TrashMeta;
export type TrashResourceDto = ResourceDto & TrashMeta;

export interface TrashPage {
  folders: TrashFolderDto[];
  resources: TrashResourceDto[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

type TrashEntry =
  | { kind: "FOLDER"; at: Date; id: string; folder: Folder }
  | { kind: "RESOURCE"; at: Date; id: string; resource: Resource };

/** Cuộn tối đa 5 lượt khi lọc bỏ mục lồng (tệp/thư mục con bị xoá CÙNG lô với thư mục cha) trước khi trả trang. */
const MAX_SCAN_ROUNDS = 5;

export interface TrashServiceDeps {
  folders: IFolderRepository;
  resources: IResourceRepository;
  users: IUserDirectory;
  assets: IAssetPort;
  access: IWorkspaceAccess;
  quota: StorageQuotaService;
  usage: StorageUsageService;
  purge: ResourcePurgeService;
  now?: () => Date;
}

/** Thùng rác (giữ 30 ngày) + xoá vĩnh viễn ngay + số liệu dung lượng của nhóm (OWNER/ADMIN). */
export class TrashService {
  private readonly now: () => Date;

  constructor(private readonly d: TrashServiceDeps) {
    this.now = d.now ?? (() => new Date());
  }

  /**
   * MEMBER thấy mục do MÌNH xoá; OWNER/ADMIN thấy tất cả. Chỉ liệt kê GỐC của mỗi lô xoá: thư mục xoá đệ quy đem theo
   * mọi tệp/thư mục con (cùng `deletedAt`) — khôi phục thư mục là khôi phục cả lô, không liệt kê lẻ từng con.
   */
  async list(user: AuthUser, workspaceId: string, query: { cursor?: string; limit: number }): Promise<TrashPage> {
    const access = await this.d.access.assert(user, "workspace.resource.read", workspaceId);
    const retentionDays = await this.d.quota.retentionDays();
    const deletedAfter = new Date(this.now().getTime() - retentionDays * DAY_MS);
    const deletedBy = isPrivileged(access) ? undefined : user.id;

    let before = query.cursor ? decodeCursor(query.cursor) : null;
    const visible: TrashEntry[] = [];
    let exhausted = false;

    for (let round = 0; round < MAX_SCAN_ROUNDS && visible.length <= query.limit && !exhausted; round += 1) {
      const args = { workspaceId, deletedBy, deletedAfter, before: before ?? undefined, limit: query.limit + 1 };
      const [folders, resources] = await Promise.all([this.d.folders.listTrash(args), this.d.resources.listTrash(args)]);
      const scanned = this.merge(folders, resources).slice(0, query.limit + 1);
      exhausted = scanned.length <= query.limit;
      visible.push(...(await this.dropNested(scanned)));
      const last = scanned[scanned.length - 1];
      if (!last) break;
      before = { at: last.at, id: last.id };
    }

    const pageEntries = visible.slice(0, query.limit);
    const lastKept = pageEntries[pageEntries.length - 1];
    // Đủ trang + còn dư → tiếp sau mục cuối được giữ; chưa đủ mà còn dữ liệu (hết lượt cuộn) → tiếp sau mục cuối đã QUÉT
    // (trang ngắn nhưng luôn tiến lên, không kẹt ở dãy mục lồng).
    let nextCursor: string | null = null;
    if (visible.length > query.limit && lastKept) nextCursor = encodeCursor(lastKept.at, lastKept.id);
    else if (!exhausted && before) nextCursor = encodeCursor(before.at, before.id);
    const page = await this.present(user, access, pageEntries, retentionDays);
    return { ...page, meta: { nextCursor, hasMore: nextCursor !== null, limit: query.limit } };
  }

  /** `DELETE /workspaces/:id/trash/:resourceId` — chỉ OWNER/ADMIN, tệp phải đang nằm trong thùng rác. */
  async purgeNow(user: AuthUser, workspaceId: string, resourceId: string): Promise<void> {
    await this.d.access.assert(user, "workspace.resource.delete", workspaceId);
    const resource = await this.d.resources.findById(resourceId);
    if (!resource || resource.workspaceId !== workspaceId || resource.deletedAt === null) {
      throw new NotFoundError("Tệp không nằm trong thùng rác");
    }
    const purged = await this.d.purge.purgeOne(resource, { id: user.id, role: user.role ?? "user" }, "NOW");
    if (!purged) throw new NotFoundError("Tệp không nằm trong thùng rác");
  }

  async usage(user: AuthUser, workspaceId: string): Promise<StorageUsageDto> {
    await this.d.access.assert(user, "workspace.resource.delete", workspaceId);
    return this.d.usage.compute(workspaceId);
  }

  // ── nội bộ ────────────────────────────────────────────────────────────────

  private merge(folders: Folder[], resources: Resource[]): TrashEntry[] {
    const entries: TrashEntry[] = [
      ...folders.map((folder): TrashEntry => ({ kind: "FOLDER", at: folder.deletedAt as Date, id: folder.id, folder })),
      ...resources.map((resource): TrashEntry => ({ kind: "RESOURCE", at: resource.deletedAt as Date, id: resource.id, resource })),
    ];
    return entries.sort((a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id));
  }

  /** Bỏ mục có "cha" (thư mục chứa) đã bị xoá cùng thời điểm — đó là mục lồng trong lô xoá của thư mục cha. */
  private async dropNested(entries: TrashEntry[]): Promise<TrashEntry[]> {
    const parentIds = entries
      .map((e) => (e.kind === "FOLDER" ? e.folder.parentId : e.resource.folderId))
      .filter((id): id is string => id !== null);
    if (parentIds.length === 0) return entries;
    const parents = new Map((await this.d.folders.findByIds(Array.from(new Set(parentIds)))).map((f) => [f.id, f]));
    return entries.filter((e) => {
      const parent = parents.get(e.kind === "FOLDER" ? (e.folder.parentId ?? "") : (e.resource.folderId ?? ""));
      return !(parent?.deletedAt && parent.deletedAt.getTime() === e.at.getTime());
    });
  }

  private async present(
    user: AuthUser,
    access: ResolvedAccess,
    entries: TrashEntry[],
    retentionDays: number
  ): Promise<Pick<TrashPage, "folders" | "resources">> {
    const privileged = isPrivileged(access);
    const meta = (at: Date, deletedBy: string | null): TrashMeta => ({
      purgeAt: new Date(at.getTime() + retentionDays * DAY_MS),
      canRestore: privileged || deletedBy === user.id,
      canPurge: privileged,
    });
    const resources = entries.filter((e): e is Extract<TrashEntry, { kind: "RESOURCE" }> => e.kind === "RESOURCE");
    const users = await this.d.users.findMany(resources.map((e) => e.resource.uploadedBy));
    return {
      folders: entries
        .filter((e): e is Extract<TrashEntry, { kind: "FOLDER" }> => e.kind === "FOLDER")
        .map((e) => ({ ...toFolderDto(e.folder, canModify(access, user, e.folder.createdBy)), ...meta(e.at, e.folder.deletedBy) })),
      resources: resources.map((e) => ({
        ...toResourceDto(toResourceRow(e.resource, users.get(e.resource.uploadedBy)), {
          thumbnailUrl: null, // tệp trong thùng rác không cấp URL (xem trước sau khi khôi phục)
          canModify: canModify(access, user, e.resource.uploadedBy),
        }),
        ...meta(e.at, e.resource.deletedBy),
      })),
    };
  }
}
