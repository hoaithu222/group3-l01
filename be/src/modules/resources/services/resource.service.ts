import { NotFoundError, ScopeNotFoundError } from "../../../core/exceptions";
import { buildMyPermissions, type Action, type ResolvedAccess } from "../../../core/permission";
import { newObjectId } from "../../../core/utils/object-id";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { AuthUser } from "../../../core/types/express";
import type { Resource } from "../entities/resource.interface";
import type { CreateResourceDto, ResourceUrlQueryDto } from "../dtos";
import { rscErrors } from "../errors";
import { resourceEvent } from "../events/resource.events";
import type { AttachableAsset } from "./asset-port";
import { withClock, type ResolvedDeps, type ResourceDeps } from "./resource.deps";
import { fitResourceName } from "./resource.helpers";
import { toResourceDto, toResourceRow, type ResourceDto } from "./resource.presenter";
import { extensionOf, isConvertible, resolveResourceType } from "./resource-type.resolver";
import { canModify } from "./workspace-access";

const MY_PERMISSION_SUBSET: readonly Action[] = [
  "workspace.resource.read",
  "workspace.resource.upload",
  "workspace.folder.manage",
  "workspace.resource.delete",
];

export type ResourceDetailDto = ResourceDto & { myPermissions: Action[] };

export interface ResourceUrlResult {
  url: string;
  expiresAt: string;
  mime: string;
  disposition: "inline" | "attachment";
}

function isAttachable(asset: AttachableAsset, userId: string, workspaceId: string): boolean {
  return (
    asset.scope === "RESOURCE" &&
    asset.variant === "ORIGINAL" &&
    asset.status === "READY" &&
    asset.ownerId === userId &&
    asset.workspaceId === workspaceId
  );
}

/** Tạo tệp từ asset READY, xem chi tiết và cấp URL ký — p3-01 be.md §5. */
export class ResourceService {
  private readonly d: ResolvedDeps;

  constructor(deps: ResourceDeps) {
    this.d = withClock(deps);
  }

  /**
   * Transaction: kiểm hạn mức CỨNG (`RSC_007`) + `$inc storageUsedBytes` + Resource + `AssetLink` + outbox
   * `resource.created`. Hai yêu cầu cùng `assetId` chỉ 1 thắng (unique `Resource.assetId` → `RSC_003`).
   */
  async create(user: AuthUser, workspaceId: string, input: CreateResourceDto): Promise<ResourceDto> {
    const access = await this.d.access.assert(user, "workspace.resource.upload", workspaceId);
    const found = await this.d.assets.getForAttach(input.assetId);
    if (!found || found.linked || !isAttachable(found.asset, user.id, workspaceId)) throw rscErrors.assetNotAttachable();

    const asset = found.asset;
    const name = fitResourceName(input.name ?? asset.originalName);
    const extension = extensionOf(name);
    const resolved = resolveResourceType(asset.mime, extension);
    const size = asset.size ?? asset.declaredSize;
    const id = newObjectId();

    const created = await this.d.tx.run(async (tx) => {
      if (input.folderId) {
        // Đọc LẠI thư mục trong transaction + `touch`: xoá thư mục đồng thời sẽ đụng độ ghi (không sinh tệp trong thư mục đã xoá).
        const folder = await this.d.folders.findById(input.folderId, tx);
        if (!folder || folder.workspaceId !== workspaceId || folder.deletedAt !== null) {
          throw new NotFoundError("Không tìm thấy thư mục");
        }
        await this.d.folders.touch(tx, folder.id);
      }
      await this.d.quota.consumeInTx(tx, workspaceId, size);
      const resource = await this.d.resources.create(
        {
          id,
          workspaceId,
          folderId: input.folderId ?? null,
          assetId: asset.id,
          name,
          normalizedName: normalizeSearch(name),
          extension,
          type: resolved.type,
          language: resolved.language,
          mime: asset.mime,
          size,
          description: input.description ? input.description : null,
          tags: input.tags,
          previewStatus: resolved.previewStatus,
          uploadedBy: user.id,
        },
        tx
      );
      await this.d.assets.attach(tx, { assetId: asset.id, resourceId: id, workspaceId, actorId: user.id });
      await this.d.outbox.add(tx, resourceEvent("CREATED", resource));
      return resource;
    });

    await this.d.cache.bump(workspaceId);
    await this.d.quota.release(workspaceId, asset.id).catch(() => undefined); // chỗ đã giữ → đã tính vào `storageUsedBytes`
    return this.present(created, user, access);
  }

  async get(user: AuthUser, resourceId: string): Promise<ResourceDetailDto> {
    const resource = await this.mustFindActive(resourceId);
    const access = await this.d.access.assert(user, "workspace.resource.read", resource.workspaceId);
    const dto = await this.present(resource, user, access);
    return { ...dto, myPermissions: buildMyPermissions(access, MY_PERMISSION_SUBSET) };
  }

  /**
   * URL ký ≤ 60 s. Quyền HIỆN TẠI được kiểm hai lần: `workspace.resource.read` ở đây và lại theo `AssetLink` trong
   * `assets` (p0-05) — người vừa rời nhóm/bị hạ thành khách không lấy được URL mới (URL đã cấp còn sống ≤ 60 s).
   */
  async url(user: AuthUser, resourceId: string, query: ResourceUrlQueryDto): Promise<ResourceUrlResult> {
    const resource = await this.mustFindActive(resourceId);
    await this.d.access.assert(user, "workspace.resource.read", resource.workspaceId);
    if (query.variant === "preview" && resource.previewStatus !== "NATIVE") {
      throw rscErrors.noPreview(isConvertible(resource.type));
    }
    const disposition = query.variant === "download" ? "attachment" : "inline";
    const signed = await this.d.assets.getUrl(resource.assetId, user, disposition);
    return { ...signed, mime: resource.mime, disposition };
  }

  private async present(resource: Resource, user: AuthUser, access: ResolvedAccess): Promise<ResourceDto> {
    const [users, thumbs] = await Promise.all([
      this.d.users.findMany([resource.uploadedBy]),
      resource.type === "IMAGE" ? this.d.assets.signThumbnails([resource.assetId]) : Promise.resolve(new Map()),
    ]);
    return toResourceDto(toResourceRow(resource, users.get(resource.uploadedBy)), {
      thumbnailUrl: (thumbs.get(resource.assetId) as { url: string } | undefined)?.url ?? null,
      canModify: canModify(access, user, resource.uploadedBy),
    });
  }

  /** 404 trung tính (`PERM_404`) — không phân biệt "không có" với "đã xoá" với "không được thấy". */
  private async mustFindActive(resourceId: string): Promise<Resource> {
    const resource = await this.d.resources.findById(resourceId);
    if (!resource || resource.deletedAt !== null) throw new ScopeNotFoundError();
    return resource;
  }
}
