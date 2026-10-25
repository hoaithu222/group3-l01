import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { NotFoundError } from "../../../core/exceptions";
import { AuditService } from "../../audit-log/audit-log.service";
import type { AssetLinkService } from "../../assets/public";
import { notify } from "../../notifications/public";
import type { AdminWorkspaceRow } from "../entities/workspace.interface";
import type { IWorkspaceRepository } from "../repositories/workspace.repository.interface";
import type { AdminRemoveImageDto } from "../dtos";
import { toAdminWorkspaceRowOf } from "./workspace.presenter";

const auditService = new AuditService();

const IMAGE_TARGET = {
  AVATAR: { targetType: "WORKSPACE_AVATAR", column: "avatarAssetId", action: "avatar-removed" },
  COVER: { targetType: "WORKSPACE_COVER", column: "coverAssetId", action: "cover-removed" },
} as const;

export interface AdminRemoveImageResult {
  workspace: AdminWorkspaceRow;
  /** `false` = nhóm không có ảnh loại đó (không ghi gì). */
  removed: boolean;
}

/**
 * `POST /admin/workspaces/:id/remove-image` — quản trị nền tảng gỡ ảnh đại diện/ảnh bìa VI PHẠM của một nhóm (kể cả nhóm
 * đã lưu trữ). Bắt buộc lý do; ghi audit `workspace.image-remove`; báo chủ nhóm (`workspace.admin-change`,
 * `refs.action = avatar-removed | cover-removed`); phát `workspace:updated` để thành viên đang mở thấy ảnh biến mất.
 * Bìa bị gỡ quay về `coverPreset` (không xoá mẫu nền). Nhóm không có ảnh loại đó → trả nguyên trạng, không ghi gì (bấm lặp vô hại).
 */
export class AdminWorkspaceImageService {
  constructor(
    private readonly repo: Pick<IWorkspaceRepository, "adminGetDetail">,
    private readonly assetLinks: Pick<AssetLinkService, "detach">
  ) {}

  async remove(adminId: string, workspaceId: string, dto: AdminRemoveImageDto): Promise<AdminRemoveImageResult> {
    const target = IMAGE_TARGET[dto.kind];
    const removed = await withTransaction(async (tx) => {
      const current = await tx.workspace.findUnique({ where: { id: workspaceId } });
      if (!current) throw new NotFoundError();
      if (!current[target.column]) return false;

      // Không CAS `expectedVersion`: gỡ ảnh vi phạm phải thắng mọi sửa đổi đang dở của nhóm; vẫn tăng `version` để client vá cache.
      const workspace = await tx.workspace.update({
        where: { id: workspaceId },
        data: { [target.column]: null, version: { increment: 1 } },
      });
      await this.assetLinks.detach(tx, { targetType: target.targetType, targetId: workspaceId });
      await outbox.add(tx, {
        type: "workspace.updated",
        aggregateType: "Workspace",
        aggregateId: workspaceId,
        queue: "notifications",
        jobName: "workspace.events",
        dedupeKey: `workspace.updated:${workspaceId}:v${workspace.version}`,
        payload: { event: "updated", workspaceId },
      });
      const dedupeKey = `workspace.admin-change:${workspaceId}:${target.action}:v${workspace.version}`;
      await notify(tx, {
        type: "workspace.admin-change",
        actorId: adminId,
        scope: { type: "WORKSPACE", id: workspaceId },
        workspaceId,
        // `source.id` là khoá gộp mục hộp thư THEO NGƯỜI NHẬN (`NotificationRecipient.dedupeKey`) nên phải riêng từng lần gỡ:
        // dùng `workspaceId` thì chủ nhóm đã có một mục `workspace.admin-change` của nhóm (gỡ bìa trước đó, lưu trữ nền tảng…)
        // sẽ KHÔNG nhận thông báo mới (notify bỏ qua người nhận đã có mục).
        source: { type: "Workspace", id: dedupeKey },
        refs: { workspaceId, action: target.action },
        recipients: [{ userId: workspace.ownerId }],
        dedupeKey,
      });
      return true;
    });

    if (removed) {
      await auditService.record({
        actorId: adminId,
        action: "workspace.image-remove",
        targetType: "Workspace",
        targetId: workspaceId,
        workspaceId,
        reason: dto.reason,
        metadata: { kind: dto.kind },
      });
    }

    const found = await this.repo.adminGetDetail(workspaceId);
    if (!found) throw new NotFoundError();
    return { removed, workspace: toAdminWorkspaceRowOf(found.workspace, found.owner) };
  }
}
