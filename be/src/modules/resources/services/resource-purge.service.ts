import { createContextLogger } from "../../../infrastructure/logger";
import type { Resource } from "../entities/resource.interface";
import type { IFolderRepository } from "../repositories/folder.repository.interface";
import type { IResourceRepository } from "../repositories/resource.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { SYSTEM_ACTOR_ID } from "../errors";
import { resourceEvent } from "../events/resource.events";
import type { IAssetPort } from "./asset-port";
import { DAY_MS } from "./resource.deps";
import type { IResourceListCache } from "./resource-list.cache";
import type { StorageQuotaService } from "./storage-quota.service";

const log = createContextLogger({ service: "ResourcePurgeService" });

/** Cổng ghi audit — thoả mãn bởi `AuditService` (module audit-log, `record()` không bao giờ ném). */
export interface PurgeAuditRecorder {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    workspaceId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface PurgeActor {
  id: string;
  role: string;
}

export interface PurgeReport {
  resourcesPurged: number;
  resourcesFailed: number;
  foldersPurged: number;
  bytesFreed: number;
}

export interface ResourcePurgeDeps {
  resources: IResourceRepository;
  folders: IFolderRepository;
  tx: ITxRunner;
  outbox: IOutboxPort;
  cache: IResourceListCache;
  assets: IAssetPort;
  quota: StorageQuotaService;
  audit: PurgeAuditRecorder;
  now?: () => Date;
}

const BATCH = 200;
const MAX_ROUNDS = 10;
export const SYSTEM_PURGE_ACTOR: PurgeActor = { id: SYSTEM_ACTOR_ID, role: "system" };

/**
 * Xoá VĨNH VIỄN tệp trong thùng rác (p3-01 be.md §7): xoá object storage + `AssetLink` + đánh dấu `Asset` `DELETED` +
 * trả `storageUsedBytes` + xoá dòng `Resource` + outbox `resource.purged` + audit `resource.purge`.
 * Dùng bởi cron `resources.purge` (quá hạn giữ) và `DELETE /workspaces/:id/trash/:resourceId` (xoá ngay).
 */
export class ResourcePurgeService {
  private readonly now: () => Date;

  constructor(private readonly d: ResourcePurgeDeps) {
    this.now = d.now ?? (() => new Date());
  }

  /**
   * `SWEEP` (cron): xoá object TRƯỚC rồi mới ghi DB — lỗi storage/DB giữa chừng thì tệp vẫn nằm thùng rác quá hạn và
   * lượt sau thử lại (xoá object idempotent), không rò object. An toàn với khôi phục vì `restore` từ chối mục quá hạn
   * (cùng ngưỡng). `NOW` (admin xoá ngay, mục còn hạn có thể bị khôi phục đồng thời): ghi DB TRƯỚC (`deleteById` chỉ
   * xoá khi còn `deletedAt`), object xoá SAU — lỗi storage chỉ log (đã mất tham chiếu).
   */
  async purgeOne(resource: Resource, actor: PurgeActor, mode: "SWEEP" | "NOW"): Promise<boolean> {
    const keys = await this.d.assets.storageKeysOf(resource.assetId);
    if (mode === "SWEEP") await this.d.assets.deleteObjects(keys);

    const removed = await this.d.tx.run(async (tx) => {
      if (!(await this.d.resources.deleteById(resource.id, tx))) return false;
      await this.d.assets.detach(tx, resource.id);
      await this.d.assets.markDeleted(tx, resource.assetId);
      await this.d.quota.refundInTx(tx, resource.workspaceId, resource.size);
      await this.d.outbox.add(tx, resourceEvent("PURGED", { ...resource, version: resource.version + 1 }));
      return true;
    });
    if (!removed) return false;

    if (mode === "NOW") {
      await this.d.assets.deleteObjects(keys).catch((err: unknown) => {
        log.error("Xoá object storage sau khi xoá vĩnh viễn thất bại — cần dọn tay", {
          assetId: resource.assetId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
    await this.d.cache.bump(resource.workspaceId);
    await this.d.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "resource.purge",
      targetType: "WORKSPACE",
      targetId: resource.workspaceId,
      workspaceId: resource.workspaceId,
      // Không ghi tên tệp: admin không xem nội dung/tên tệp của nhóm (admin.md p3-01 nguyên tắc).
      metadata: { resourceId: resource.id, assetId: resource.assetId, size: resource.size, type: resource.type, mode },
    });
    return true;
  }

  /** Job `resources.purge`: tệp quá `trashRetentionDays`, lô 200, tối đa 10 lô/lượt; rồi dọn thư mục trống quá hạn. */
  async runSweep(): Promise<PurgeReport> {
    const days = await this.d.quota.retentionDays();
    const cutoff = new Date(this.now().getTime() - days * DAY_MS);
    const report: PurgeReport = { resourcesPurged: 0, resourcesFailed: 0, foldersPurged: 0, bytesFreed: 0 };

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const candidates = await this.d.resources.findPurgeCandidates(cutoff, BATCH);
      let progressed = 0;
      for (const resource of candidates) {
        try {
          if (await this.purgeOne(resource, SYSTEM_PURGE_ACTOR, "SWEEP")) {
            progressed += 1;
            report.resourcesPurged += 1;
            report.bytesFreed += resource.size;
          }
        } catch (err) {
          report.resourcesFailed += 1;
          log.warn("Xoá vĩnh viễn tệp thất bại — thử lại ở lượt sau", {
            resourceId: resource.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (candidates.length < BATCH || progressed === 0) break;
    }
    report.foldersPurged = await this.purgeFolders(cutoff);
    return report;
  }

  /** Thư mục xoá quá hạn, sâu nhất trước; chỉ xoá cứng khi không còn tệp/thư mục con nào tham chiếu. */
  private async purgeFolders(cutoff: Date): Promise<number> {
    const candidates = (await this.d.folders.findPurgeCandidates(cutoff, BATCH)).sort((a, b) => b.depth - a.depth);
    let purged = 0;
    for (const folder of candidates) {
      const [files, children] = await Promise.all([
        this.d.resources.countInFolders([folder.id]),
        this.d.folders.countChildren(folder.id),
      ]);
      if (files > 0 || children > 0) continue;
      purged += await this.d.folders.hardDelete([folder.id]);
    }
    return purged;
  }
}
