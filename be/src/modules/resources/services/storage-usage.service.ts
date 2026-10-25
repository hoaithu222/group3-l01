import type { ResourceTypeUsage } from "../entities/resource.interface";
import type { IFolderRepository } from "../repositories/folder.repository.interface";
import type { IResourceRepository } from "../repositories/resource.repository.interface";
import type { QuotaInfo, StorageQuotaService } from "./storage-quota.service";

export interface StorageUsageDto {
  usedBytes: number;
  quotaBytes: number;
  quotaSource: QuotaInfo["source"];
  fileCount: number;
  folderCount: number;
  /** Byte trong thùng rác — VẪN tính vào `usedBytes` tới khi xoá vĩnh viễn. */
  trashBytes: number;
  /** Chỉ số liệu (loại · số tệp · byte) — KHÔNG tên tệp (admin không xem nội dung kho của nhóm). */
  byType: ResourceTypeUsage[];
}

/** Số liệu dung lượng kho tài liệu 1 workspace — dùng chung cho `GET /workspaces/:id/storage` và admin `resource-stats`. */
export class StorageUsageService {
  constructor(
    private readonly resources: IResourceRepository,
    private readonly folders: IFolderRepository,
    private readonly quota: StorageQuotaService
  ) {}

  async compute(workspaceId: string): Promise<StorageUsageDto> {
    const [usedBytes, quota, byType, trashBytes, folderCount] = await Promise.all([
      this.quota.usedBytes(workspaceId),
      this.quota.quotaFor(workspaceId),
      this.resources.usageByType(workspaceId),
      this.resources.trashBytes(workspaceId),
      this.folders.countActive(workspaceId),
    ]);
    return {
      usedBytes,
      quotaBytes: quota.quotaBytes,
      quotaSource: quota.source,
      fileCount: byType.reduce((sum, row) => sum + row.count, 0),
      folderCount,
      trashBytes,
      byType,
    };
  }
}
