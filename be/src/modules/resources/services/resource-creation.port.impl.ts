import { NotFoundError } from "../../../core/exceptions";
import { newObjectId } from "../../../core/utils/object-id";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { AuthUser } from "../../../core/types/express";
import type {
  IResourceCreationPort,
  ResourceCreationInput,
  ResourceCreationResult,
} from "../../../shared/ports/resource-creation.port";
import type { IFolderRepository } from "../repositories/folder.repository.interface";
import type { IResourceRepository } from "../repositories/resource.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { rscErrors } from "../errors";
import { resourceEvent } from "../events/resource.events";
import type { IAssetPort } from "./asset-port";
import type { IResourceListCache } from "./resource-list.cache";
import { extensionOf, resolveResourceType } from "./resource-type.resolver";
import { fitResourceName } from "./resource.helpers";
import type { StorageQuotaService } from "./storage-quota.service";
import type { IWorkspaceAccess } from "./workspace-access";

export interface ResourceCreationPortDeps {
  resources: IResourceRepository;
  folders: IFolderRepository;
  tx: ITxRunner;
  outbox: IOutboxPort;
  cache: IResourceListCache;
  access: IWorkspaceAccess;
  quota: StorageQuotaService;
  assets: IAssetPort;
}

/**
 * Cài đặt `IResourceCreationPort` (`shared/ports/resource-creation.port.ts`, p7-04 be.md §5.6) — dùng LẠI hạ tầng có sẵn của `resources` (repo/hạn mức/outbox/cache + `IAssetPort`), KHÔNG gọi
 * `ResourceService.create()` vì nguồn khác: tệp Ở ĐÂY đã đính kèm một tin nhắn (`asset.scope MESSAGE`, ĐÃ có `AssetLink MESSAGE`) trong khi `ResourceService.create()` chỉ nhận asset MỚI tải
 * lên riêng cho kho tài liệu (`scope RESOURCE`, CHƯA có link nào, chủ = actor).
 *
 * Nguồn "tin nhắn đã được người gọi (`chat-extensions`) kiểm quyền đọc" được NỚI hai luật đó (be.md §5.6.4):
 *  - asset ĐÃ có link vẫn nhận — link `RESOURCE` mới là link THỨ HAI của asset (khác `(assetId, targetType, targetId)` với link `MESSAGE` cũ, unique cho phép cả hai) → không nhân file (RES-01);
 *  - `assets.attach(..., allowForeignReadable: true)` cho phép actor KHÔNG PHẢI chủ asset gốc (người chuyển đổi khác người đã gửi tệp) — an toàn vì `chat-extensions` đã xác nhận actor đọc
 *    được tin trước khi gọi cổng (cùng nguyên tắc "không mở rộng quyền ngầm" dùng cho chuyển tiếp tin nhắn, `modules/messages/services/message.service.ts`).
 *
 * ⚠ Chưa xử lý: xoá/purge một `Resource` tạo theo đường này (`ResourcePurgeService.purgeOne`) hiện đánh dấu CẢ asset gốc `DELETED` và xoá object storage vô điều kiện — chưa kiểm asset còn
 * link `MESSAGE` khác hay không (be.md checklist "purge không xoá asset dùng chung"). Đây là hạn chế Ở PHÍA PURGE, nằm ngoài phạm vi cổng này — cần sửa riêng ở `resource-purge.service.ts`.
 */
export class ResourceCreationPortImpl implements IResourceCreationPort {
  constructor(private readonly d: ResourceCreationPortDeps) {}

  async assertCanUpload(actor: AuthUser, workspaceId: string): Promise<void> {
    await this.d.access.assert(actor, "workspace.resource.upload", workspaceId);
  }

  async createFromExistingAsset(input: ResourceCreationInput): Promise<ResourceCreationResult> {
    const found = await this.d.assets.getForAttach(input.assetId);
    if (!found || found.asset.status !== "READY" || found.asset.variant !== "ORIGINAL") throw rscErrors.assetNotAttachable();

    const asset = found.asset;
    const name = fitResourceName(input.name);
    const extension = extensionOf(name);
    const resolved = resolveResourceType(asset.mime, extension);
    const size = asset.size ?? asset.declaredSize;
    const id = newObjectId();

    const created = await this.d.tx.run(async (tx) => {
      if (input.folderId) {
        // Đọc LẠI thư mục trong transaction + `touch`: xoá thư mục đồng thời sẽ đụng độ ghi (giống `ResourceService.create`).
        const folder = await this.d.folders.findById(input.folderId, tx);
        if (!folder || folder.workspaceId !== input.workspaceId || folder.deletedAt !== null) {
          throw new NotFoundError("Không tìm thấy thư mục");
        }
        await this.d.folders.touch(tx, folder.id);
      }
      await this.d.quota.consumeInTx(tx, input.workspaceId, size);
      const resource = await this.d.resources.create(
        {
          id,
          workspaceId: input.workspaceId,
          folderId: input.folderId ?? null,
          assetId: asset.id,
          name,
          normalizedName: normalizeSearch(name),
          extension,
          type: resolved.type,
          language: resolved.language,
          mime: asset.mime,
          size,
          description: null,
          tags: [],
          previewStatus: resolved.previewStatus,
          uploadedBy: input.actor.id,
        },
        tx
      );
      await this.d.assets.attach(tx, {
        assetId: asset.id,
        resourceId: id,
        workspaceId: input.workspaceId,
        actorId: input.actor.id,
        allowForeignReadable: true,
      });
      await this.d.outbox.add(tx, resourceEvent("CREATED", resource));
      return resource;
    });

    await this.d.cache.bump(input.workspaceId);
    // Tệp nguồn không đi qua bước "xin URL upload" của kho tài liệu nên không hề giữ chỗ (`reserve`) — gọi `release` chỉ để
    // đồng nhất với `ResourceService.create()`; không có gì để dọn nên luôn là no-op an toàn.
    await this.d.quota.release(input.workspaceId, asset.id).catch(() => undefined);
    return { id: created.id, assetId: created.assetId, name: created.name };
  }
}
