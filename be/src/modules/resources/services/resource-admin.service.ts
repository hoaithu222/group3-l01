import { NotFoundError, ValidationError } from "../../../core/exceptions";
import { runtimeConfig } from "../../../core/config/runtime-config";
import type { IQuotaOverrideRepository, QuotaOverrideEntry } from "../repositories/quota-override.repository";
import type { IWorkspaceStorageRepository } from "../repositories/workspace-storage.repository";
import { QUOTA_OVERRIDES_MAX } from "../dtos";
import type { PurgeAuditRecorder } from "./resource-purge.service";
import type { StorageQuotaService } from "./storage-quota.service";
import type { StorageUsageDto, StorageUsageService } from "./storage-usage.service";

export interface AdminActor {
  id: string;
  role?: string;
}

export interface QuotaChangeResult {
  quotaBytes: number;
  quotaSource: "DEFAULT" | "OVERRIDE";
}

/** Làm mới cache `runtimeConfig` sau khi ghi `SystemConfig` — tách ra để test không cần Redis. */
export type ConfigPublisher = (key: string, snapshot: { value: Record<string, unknown>; version: number }) => Promise<void>;

/**
 * Cổng admin của kho tài liệu (admin.md p3-01 §3): số liệu dung lượng theo workspace (KHÔNG tên tệp) + đặt/xoá hạn mức
 * riêng — lưu ở `SystemConfig resource.quotaOverrides`, mọi thay đổi có `reason` + audit `resource.quota-override`.
 */
export class ResourceAdminService {
  constructor(
    private readonly usage: StorageUsageService,
    private readonly quota: StorageQuotaService,
    private readonly workspaces: IWorkspaceStorageRepository,
    private readonly overrides: IQuotaOverrideRepository,
    private readonly audit: PurgeAuditRecorder,
    private readonly publish: ConfigPublisher = (key, snapshot) => runtimeConfig.publishInvalidate(key, snapshot)
  ) {}

  async stats(workspaceId: string): Promise<StorageUsageDto> {
    await this.mustExist(workspaceId);
    return this.usage.compute(workspaceId);
  }

  async setQuota(actor: AdminActor, workspaceId: string, bytes: number, reason: string): Promise<QuotaChangeResult> {
    await this.mustExist(workspaceId);
    const before = await this.quota.quotaFor(workspaceId);
    const written = await this.overrides.update(
      (current) => {
        const others = current.filter((e) => e.workspaceId !== workspaceId);
        if (others.length >= QUOTA_OVERRIDES_MAX) {
          throw new ValidationError(`Chỉ được đặt hạn mức riêng cho tối đa ${QUOTA_OVERRIDES_MAX} nhóm`);
        }
        return [...others, { workspaceId, bytes } satisfies QuotaOverrideEntry];
      },
      { actorId: actor.id, reason }
    );
    await this.publish("resource", { value: written.value, version: written.version });
    await this.record(actor, workspaceId, reason, { mode: "SET", bytes, previousBytes: before.quotaBytes, previousSource: before.source });
    return { quotaBytes: bytes, quotaSource: "OVERRIDE" };
  }

  async resetQuota(actor: AdminActor, workspaceId: string, reason: string): Promise<QuotaChangeResult> {
    await this.mustExist(workspaceId);
    const before = await this.quota.quotaFor(workspaceId);
    const written = await this.overrides.update((current) => current.filter((e) => e.workspaceId !== workspaceId), {
      actorId: actor.id,
      reason,
    });
    await this.publish("resource", { value: written.value, version: written.version });
    const after = await this.quota.quotaFor(workspaceId);
    await this.record(actor, workspaceId, reason, { mode: "RESET", previousBytes: before.quotaBytes, previousSource: before.source });
    return { quotaBytes: after.quotaBytes, quotaSource: after.source };
  }

  private async mustExist(workspaceId: string): Promise<void> {
    if ((await this.workspaces.getUsedBytes(workspaceId)) === null) throw new NotFoundError("Không tìm thấy nhóm");
  }

  private record(actor: AdminActor, workspaceId: string, reason: string, metadata: Record<string, unknown>): Promise<void> {
    return this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "resource.quota-override",
      targetType: "WORKSPACE",
      targetId: workspaceId,
      workspaceId,
      reason,
      metadata,
    });
  }
}
