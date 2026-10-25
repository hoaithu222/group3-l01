import { NotFoundError, ScopeNotFoundError, VersionConflictError } from "../../../core/exceptions";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { ResolvedAccess } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import type { Resource, ResourcePatchInput } from "../entities/resource.interface";
import type { UpdateResourceDto } from "../dtos";
import { resourceEvent } from "../events/resource.events";
import { DAY_MS, withClock, type ResolvedDeps, type ResourceDeps } from "./resource.deps";
import { fitResourceName } from "./resource.helpers";
import { toResourceDto, toResourceRow, type ResourceDto } from "./resource.presenter";
import { extensionOf, resolveResourceType } from "./resource-type.resolver";
import { canModify, isPrivileged, modifyActionFor } from "./workspace-access";

/** Sửa / xoá mềm / khôi phục tệp (p3-01 be.md §4–§5). Của mình: `folder.manage`; của người khác: `resource.delete`. */
export class ResourceMutationService {
  private readonly d: ResolvedDeps;

  constructor(deps: ResourceDeps) {
    this.d = withClock(deps);
  }

  async patch(user: AuthUser, resourceId: string, input: UpdateResourceDto): Promise<ResourceDto> {
    const existing = await this.mustFind(resourceId);
    if (existing.deletedAt !== null) throw new ScopeNotFoundError();
    const access = await this.d.access.assert(user, modifyActionFor(user, existing.uploadedBy), existing.workspaceId);

    const updated = await this.d.tx.run(async (tx) => {
      const current = await this.d.resources.findById(resourceId, tx);
      if (!current || current.deletedAt !== null) throw new ScopeNotFoundError();
      if (current.version !== input.expectedVersion) throw new VersionConflictError(current.version);

      const patch: ResourcePatchInput = {};
      if (input.name !== undefined) {
        const name = fitResourceName(input.name);
        const extension = extensionOf(name);
        const resolved = resolveResourceType(current.mime, extension);
        Object.assign(patch, { name, normalizedName: normalizeSearch(name), extension, type: resolved.type, language: resolved.language });
      }
      if (input.description !== undefined) patch.description = input.description ? input.description : null;
      if (input.tags !== undefined) patch.tags = input.tags;
      const moved = input.folderId !== undefined && (input.folderId ?? null) !== current.folderId;
      if (input.folderId !== undefined) {
        if (input.folderId !== null) {
          const folder = await this.d.folders.findById(input.folderId, tx);
          if (!folder || folder.workspaceId !== current.workspaceId || folder.deletedAt !== null) {
            throw new NotFoundError("Không tìm thấy thư mục đích");
          }
          await this.d.folders.touch(tx, folder.id);
        }
        patch.folderId = input.folderId;
      }

      const saved = await this.d.resources.updateWithVersion(resourceId, input.expectedVersion, patch, tx);
      if (!saved) throw new VersionConflictError(current.version);
      await this.d.outbox.add(tx, resourceEvent("UPDATED", saved, { change: moved ? "MOVED" : "META" }));
      return saved;
    });
    await this.d.cache.bump(existing.workspaceId);
    return this.present(updated, user, access);
  }

  async remove(user: AuthUser, resourceId: string): Promise<void> {
    const existing = await this.mustFind(resourceId);
    if (existing.deletedAt !== null) throw new ScopeNotFoundError();
    await this.d.access.assert(user, modifyActionFor(user, existing.uploadedBy), existing.workspaceId);

    await this.d.tx.run(async (tx) => {
      const deleted = await this.d.resources.softDelete(resourceId, this.d.now(), user.id, tx);
      if (!deleted) throw new ScopeNotFoundError();
      await this.d.outbox.add(tx, resourceEvent("DELETED", deleted));
    });
    await this.d.cache.bump(existing.workspaceId);
  }

  /** OWNER/ADMIN hoặc chính người xoá, trong thời hạn thùng rác; thư mục cũ không còn → về gốc (be.md §4). */
  async restore(user: AuthUser, resourceId: string): Promise<ResourceDto> {
    const existing = await this.mustFind(resourceId);
    const access = await this.d.access.assert(user, "workspace.folder.manage", existing.workspaceId);
    if (existing.deletedAt === null) throw new NotFoundError("Tệp không nằm trong thùng rác");
    if (!isPrivileged(access) && existing.deletedBy !== user.id) {
      await this.d.access.assert(user, "workspace.resource.delete", existing.workspaceId); // ném 403 PERM_001
    }
    const days = await this.d.quota.retentionDays();
    if (existing.deletedAt.getTime() <= this.d.now().getTime() - days * DAY_MS) {
      throw new NotFoundError("Mục này đã bị xoá vĩnh viễn");
    }

    const restored = await this.d.tx.run(async (tx) => {
      let folderId: string | null = null;
      if (existing.folderId) {
        const folder = await this.d.folders.findById(existing.folderId, tx);
        if (folder && folder.deletedAt === null) {
          folderId = folder.id;
          await this.d.folders.touch(tx, folder.id);
        }
      }
      const result = await this.d.resources.restore(resourceId, folderId, tx);
      if (!result) throw new NotFoundError("Tệp không nằm trong thùng rác");
      await this.d.outbox.add(tx, resourceEvent("UPDATED", result, { change: "RESTORED" }));
      return result;
    });
    await this.d.cache.bump(existing.workspaceId);
    return this.present(restored, user, access);
  }

  private async mustFind(resourceId: string): Promise<Resource> {
    const resource = await this.d.resources.findById(resourceId);
    if (!resource) throw new ScopeNotFoundError();
    return resource;
  }

  private async present(resource: Resource, user: AuthUser, access: ResolvedAccess): Promise<ResourceDto> {
    const users = await this.d.users.findMany([resource.uploadedBy]);
    const thumbs = resource.type === "IMAGE" ? await this.d.assets.signThumbnails([resource.assetId]) : new Map<string, { url: string }>();
    return toResourceDto(toResourceRow(resource, users.get(resource.uploadedBy)), {
      thumbnailUrl: thumbs.get(resource.assetId)?.url ?? null,
      canModify: canModify(access, user, resource.uploadedBy),
    });
  }
}
