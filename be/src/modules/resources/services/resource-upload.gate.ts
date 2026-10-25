import { ValidationError } from "../../../core/exceptions";
import type { AssetScopeGate, AssetScopeGateCreateInput } from "../../../shared/ports/asset-scope-gate.port";
import type { StorageQuotaService } from "./storage-quota.service";
import type { IWorkspaceAccess } from "./workspace-access";

/**
 * Hook của `POST /assets` cho scope `RESOURCE` (p3-01 be.md §5.1) — đăng ký vào `shared/ports/asset-scope-gate.port` để
 * `modules/assets` KHÔNG import module này. Chặn TRƯỚC khi cấp URL upload:
 *  1. bắt buộc `workspaceId`; người xin phải có `workspace.resource.upload` (GUEST → 404, workspace ARCHIVED → 403);
 *  2. `đã dùng + đang giữ chỗ + size > hạn mức` → `413 RSC_007`.
 * Sau khi asset tạo xong thì GIỮ CHỖ dung lượng (Redis) để nhiều lượt upload song song không cùng vượt hạn mức.
 */
export class ResourceUploadGate implements AssetScopeGate {
  constructor(
    private readonly access: IWorkspaceAccess,
    private readonly quota: StorageQuotaService
  ) {}

  async beforeCreate(input: AssetScopeGateCreateInput): Promise<void> {
    if (!input.workspaceId) throw new ValidationError("Tệp của kho tài liệu cần workspaceId");
    await this.access.assert({ id: input.ownerId, email: "" }, "workspace.resource.upload", input.workspaceId);
    await this.quota.assertCanReserve(input.workspaceId, input.size);
  }

  async afterCreate(input: { assetId: string; workspaceId?: string; size: number }): Promise<void> {
    if (input.workspaceId) await this.quota.reserve(input.workspaceId, input.assetId, input.size);
  }

  async release(input: { assetId: string; workspaceId?: string | null }): Promise<void> {
    if (input.workspaceId) await this.quota.release(input.workspaceId, input.assetId);
  }
}
