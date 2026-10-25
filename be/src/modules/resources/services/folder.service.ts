import { LIMITS } from "../../../core/constants";
import { NotFoundError, ScopeNotFoundError, ValidationError, VersionConflictError } from "../../../core/exceptions";
import { newObjectId } from "../../../core/utils/object-id";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { AuthUser } from "../../../core/types/express";
import { ROOT_KEY, type Folder } from "../entities/folder.interface";
import type { IFolderRepository } from "../repositories/folder.repository.interface";
import type { IResourceRepository } from "../repositories/resource.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import type { CreateFolderDto, UpdateFolderDto } from "../dtos";
import { rscErrors } from "../errors";
import { bulkResourceEvent, folderEvent } from "../events/resource.events";
import type { IResourceListCache } from "./resource-list.cache";
import { toFolderDto, type FolderDto } from "./resource.presenter";
import type { StorageQuotaService } from "./storage-quota.service";
import { canModify, isPrivileged, modifyActionFor, type IWorkspaceAccess } from "./workspace-access";

const CHILDREN_MAX = 500;
const DAY_MS = 24 * 3600 * 1000;

export interface FolderServiceDeps {
  folders: IFolderRepository;
  resources: IResourceRepository;
  tx: ITxRunner;
  outbox: IOutboxPort;
  cache: IResourceListCache;
  access: IWorkspaceAccess;
  quota: StorageQuotaService;
  now?: () => Date;
}

export interface FolderListing {
  /** Vắng mặt khi liệt kê gốc. */
  folder?: FolderDto;
  /** Tổ tiên từ gốc → cha (KHÔNG gồm `folder`). */
  breadcrumb: FolderDto[];
  children: FolderDto[];
}

/** Thư mục kho tài liệu (p3-01 README §2): cây ≤ 8 cấp, tên duy nhất theo cấp (không dấu/hoa-thường), xoá mềm 30 ngày. */
export class FolderService {
  private readonly d: FolderServiceDeps & { now: () => Date };

  constructor(deps: FolderServiceDeps) {
    this.d = { ...deps, now: deps.now ?? (() => new Date()) };
  }

  async list(user: AuthUser, workspaceId: string, parentId?: string): Promise<FolderListing> {
    const access = await this.d.access.assert(user, "workspace.resource.read", workspaceId);
    const dto = (f: Folder) => toFolderDto(f, canModify(access, user, f.createdBy));

    if (!parentId) {
      const children = await this.d.folders.listChildren(workspaceId, ROOT_KEY, CHILDREN_MAX);
      return { breadcrumb: [], children: children.map(dto) };
    }
    const folder = await this.mustFindActiveIn(parentId, workspaceId);
    const [ancestors, children] = await Promise.all([
      this.d.folders.findByIds(folder.path),
      this.d.folders.listChildren(workspaceId, folder.id, CHILDREN_MAX),
    ]);
    const byId = new Map(ancestors.map((a) => [a.id, a]));
    const breadcrumb = folder.path.map((id) => byId.get(id)).filter((a): a is Folder => a !== undefined);
    return { folder: dto(folder), breadcrumb: breadcrumb.map(dto), children: children.map(dto) };
  }

  async create(user: AuthUser, workspaceId: string, input: CreateFolderDto): Promise<FolderDto> {
    const access = await this.d.access.assert(user, "workspace.folder.manage", workspaceId);
    const { name, normalizedName } = this.normalizeName(input.name);
    const id = newObjectId();

    const folder = await this.d.tx.run(async (tx) => {
      // Cha đọc LẠI trong transaction + `touch` để đụng độ ghi với xoá/di chuyển cha đồng thời (không sinh con mồ côi).
      let parent: Folder | null = null;
      if (input.parentId) {
        parent = await this.d.folders.findById(input.parentId, tx);
        if (!parent || parent.workspaceId !== workspaceId || parent.deletedAt !== null) {
          throw new NotFoundError("Không tìm thấy thư mục cha");
        }
        await this.d.folders.touch(tx, parent.id);
      }
      const depth = (parent?.depth ?? 0) + 1;
      if (depth > LIMITS.resource.folderDepthMax) throw rscErrors.depthExceeded(LIMITS.resource.folderDepthMax);

      const created = await this.d.folders.create(
        {
          id,
          workspaceId,
          parentId: parent?.id ?? null,
          path: parent ? [...parent.path, parent.id] : [],
          depth,
          name,
          normalizedName,
          createdBy: user.id,
        },
        tx
      );
      await this.d.outbox.add(tx, folderEvent("CREATED", created));
      return created;
    });
    return toFolderDto(folder, canModify(access, user, folder.createdBy));
  }

  async update(user: AuthUser, folderId: string, input: UpdateFolderDto): Promise<FolderDto> {
    const existing = await this.mustFindAny(folderId);
    if (existing.deletedAt !== null) throw new ScopeNotFoundError();
    const access = await this.d.access.assert(user, modifyActionFor(user, existing.createdBy), existing.workspaceId);

    const updated = await this.d.tx.run(async (tx) => {
      const current = await this.d.folders.findById(folderId, tx);
      if (!current || current.deletedAt !== null) throw new ScopeNotFoundError();
      if (current.version !== input.expectedVersion) throw new VersionConflictError(current.version);

      const named = input.name !== undefined ? this.normalizeName(input.name) : { name: current.name, normalizedName: current.normalizedName };
      const parentChanged = input.parentId !== undefined && (input.parentId ?? null) !== current.parentId;
      let parent: Folder | null = null; // cha MỚI (chỉ khi đổi cha); `null` = về gốc

      if (parentChanged) {
        if (input.parentId) {
          if (input.parentId === current.id) throw rscErrors.moveIntoSelf();
          parent = await this.d.folders.findById(input.parentId, tx);
          if (!parent || parent.workspaceId !== current.workspaceId || parent.deletedAt !== null) {
            throw new NotFoundError("Không tìm thấy thư mục đích");
          }
          // Vòng: đích là chính nó hoặc hậu duệ của nó (`path` của đích chứa id thư mục đang chuyển).
          if (parent.path.includes(current.id)) throw rscErrors.moveIntoSelf();
          await this.d.folders.touch(tx, parent.id); // 2 lần di chuyển đối xứng đồng thời → 1 bên thử lại và thấy vòng
        }
      }

      const newDepth = (parent?.depth ?? 0) + 1;
      const newPath = parent ? [...parent.path, parent.id] : [];
      if (parentChanged) {
        const delta = newDepth - current.depth;
        const deepest = Math.max(current.depth, await this.d.folders.maxDescendantDepth(current.workspaceId, current.id, tx));
        if (deepest + delta > LIMITS.resource.folderDepthMax) throw rscErrors.depthExceeded(LIMITS.resource.folderDepthMax);
      }

      const saved = await this.d.folders.updateWithVersion(
        current.id,
        input.expectedVersion,
        {
          name: named.name,
          normalizedName: named.normalizedName,
          parentId: parentChanged ? (parent?.id ?? null) : current.parentId,
          path: parentChanged ? newPath : current.path,
          depth: parentChanged ? newDepth : current.depth,
        },
        tx
      );
      if (!saved) throw new VersionConflictError(current.version);
      if (parentChanged) {
        await this.d.folders.rebaseDescendants(tx, {
          workspaceId: current.workspaceId,
          folderId: current.id,
          oldAncestorsLength: current.path.length,
          newAncestors: newPath,
          depthDelta: newDepth - current.depth,
        });
      }
      await this.d.outbox.add(tx, folderEvent("UPDATED", saved, { change: parentChanged ? "MOVED" : "META" }));
      return saved;
    });
    return toFolderDto(updated, canModify(access, user, updated.createdBy));
  }

  /** Không rỗng → chỉ OWNER/ADMIN + `recursive` mới xoá được (kèm mọi tệp/thư mục con, cùng lô để khôi phục). */
  async remove(user: AuthUser, folderId: string, recursive: boolean): Promise<void> {
    const existing = await this.mustFindAny(folderId);
    if (existing.deletedAt !== null) throw new ScopeNotFoundError();
    const access = await this.d.access.assert(user, modifyActionFor(user, existing.createdBy), existing.workspaceId);

    await this.d.tx.run(async (tx) => {
      const current = await this.d.folders.findById(folderId, tx);
      if (!current || current.deletedAt !== null) throw new ScopeNotFoundError();
      const [childFolders, childFiles] = await Promise.all([
        this.d.folders.countActiveChildren(current.id, tx),
        this.d.resources.countActiveInFolder(current.id, tx),
      ]);
      if (childFolders + childFiles > 0 && (!recursive || !isPrivileged(access))) throw rscErrors.folderNotEmpty();

      const at = this.d.now();
      const { folderIds } = await this.d.folders.softDeleteSubtree(tx, {
        workspaceId: current.workspaceId,
        folderId: current.id,
        at,
        by: user.id,
      });
      const affected = await this.d.resources.softDeleteInFolders(tx, {
        workspaceId: current.workspaceId,
        folderIds,
        at,
        by: user.id,
      });
      const deleted = await this.d.folders.findById(current.id, tx);
      const events = [
        ...(deleted ? [folderEvent("DELETED", deleted)] : []),
        ...affected.map((r) => bulkResourceEvent("DELETED", current.workspaceId, r)),
      ];
      await this.d.outbox.addMany(tx, events);
    });
    await this.d.cache.bump(existing.workspaceId);
  }

  /** OWNER/ADMIN hoặc chính người đã xoá; chỉ trong thời hạn giữ thùng rác; cha còn sống, tên chưa bị chiếm. */
  async restore(user: AuthUser, folderId: string): Promise<FolderDto> {
    const existing = await this.mustFindAny(folderId);
    const access = await this.d.access.assert(user, "workspace.folder.manage", existing.workspaceId);
    if (existing.deletedAt === null) throw new NotFoundError("Thư mục không nằm trong thùng rác");
    if (!isPrivileged(access) && existing.deletedBy !== user.id) {
      await this.d.access.assert(user, "workspace.resource.delete", existing.workspaceId); // ném 403 PERM_001
    }
    await this.assertWithinRetention(existing.deletedAt);

    const restored = await this.d.tx.run(async (tx) => {
      const current = await this.d.folders.findById(folderId, tx);
      if (!current || current.deletedAt === null) throw new NotFoundError("Thư mục không nằm trong thùng rác");
      if (current.parentId) {
        const parent = await this.d.folders.findById(current.parentId, tx);
        if (!parent || parent.deletedAt !== null) throw rscErrors.restoreTargetGone();
        await this.d.folders.touch(tx, parent.id);
      }
      const { folderIds } = await this.d.folders.restoreSubtree(tx, {
        workspaceId: current.workspaceId,
        folderId: current.id,
        deletedAt: current.deletedAt,
      });
      const affected = await this.d.resources.restoreInFolders(tx, {
        workspaceId: current.workspaceId,
        folderIds,
        deletedAt: current.deletedAt,
      });
      const after = await this.d.folders.findById(current.id, tx);
      if (!after) throw new ScopeNotFoundError();
      await this.d.outbox.addMany(tx, [
        folderEvent("UPDATED", after, { change: "RESTORED" }),
        ...affected.map((r) => bulkResourceEvent("UPDATED", current.workspaceId, r, { change: "RESTORED" })),
      ]);
      return after;
    });
    await this.d.cache.bump(existing.workspaceId);
    return toFolderDto(restored, canModify(access, user, restored.createdBy));
  }

  // ── nội bộ ────────────────────────────────────────────────────────────────

  /** Tên: NFC + trim, khoá so trùng = `normalizeSearch` (không dấu, không phân biệt hoa/thường, gộp khoảng trắng). */
  private normalizeName(raw: string): { name: string; normalizedName: string } {
    const name = raw.normalize("NFC").trim();
    const normalizedName = normalizeSearch(name);
    if (normalizedName.length === 0) throw new ValidationError("Tên thư mục không hợp lệ");
    return { name, normalizedName };
  }

  /** 404 trung tính (`PERM_404`) cho id không tồn tại — không phân biệt "không có" với "không được thấy". */
  private async mustFindAny(folderId: string): Promise<Folder> {
    const folder = await this.d.folders.findById(folderId);
    if (!folder) throw new ScopeNotFoundError();
    return folder;
  }

  private async mustFindActiveIn(folderId: string, workspaceId: string): Promise<Folder> {
    const folder = await this.d.folders.findById(folderId);
    if (!folder || folder.workspaceId !== workspaceId || folder.deletedAt !== null) {
      throw new NotFoundError("Không tìm thấy thư mục");
    }
    return folder;
  }

  private async assertWithinRetention(deletedAt: Date): Promise<void> {
    const days = await this.d.quota.retentionDays();
    if (deletedAt.getTime() <= this.d.now().getTime() - days * DAY_MS) {
      throw new NotFoundError("Mục này đã bị xoá vĩnh viễn");
    }
  }
}
