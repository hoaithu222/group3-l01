import type { AuthUser } from "../../../core/types/express";
import { permissionService, type ScopeType, type Action } from "../../../core/permission";
import { ScopeNotFoundError } from "../../../core/exceptions";
import { getAssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";
import type { Asset, AssetLinkScopeType, AssetLinkTargetType } from "../entities/asset.interface";
import type { IAssetLinkRepository } from "../repositories/asset-link.repository.interface";

/** Field asset tối thiểu cần để suy quyền đọc — tránh ép gọi nơi khác nạp cả `Asset` đầy đủ. */
export type AssetAccessSubject = Pick<Asset, "id" | "ownerId" | "status" | "parentAssetId">;

/** Hành động "đọc" tương ứng từng loại scope — chỉ 4 loại có `ScopeResolver` (be.md §5.4); CALL không áp dụng cho asset. */
const READ_ACTION: Partial<Record<AssetLinkScopeType, Action>> = {
  WORKSPACE: "workspace.read",
  CHANNEL: "channel.read",
  CONVERSATION: "conversation.read",
  MEETING: "meeting.read",
};

/**
 * Phase 3 (foundation) — target có quyền đọc RIÊNG (ưu tiên hơn `READ_ACTION[scopeType]`): tệp kho tài liệu và
 * đính kèm thẻ/bình luận gắn `scopeType WORKSPACE` (`scopeId` = workspaceId) nhưng KHÔNG dùng `workspace.read` —
 * GUEST có `workspace.read` mà phải bị 404 với tài liệu/board (p3-04 README §2/§6, ST-17, PM2-24). Người mất tư cách
 * thành viên → resolver WORKSPACE `visible:false` → cũng 404.
 */
const READ_ACTION_BY_TARGET: Partial<Record<AssetLinkTargetType, Action>> = {
  RESOURCE: "workspace.resource.read",
  TASK: "workspace.board.read",
  TASK_COMMENT: "workspace.board.read",
};

/**
 * `AssetAccessService` — quyền đọc asset = quyền đọc đối tượng mà asset đang
 * gắn (be.md §5.4). Export qua `@modules/assets/public` cho module khác dùng
 * (ngoại lệ có chủ đích của luật "không import chéo module" — xem `architecture.md`).
 */
export class AssetAccessService {
  constructor(private readonly linkRepo: IAssetLinkRepository) {}

  /**
   * - Asset `DELETED` → không ai đọc được.
   * - Chưa gắn (0 link) → chỉ chủ đọc được.
   * - Đã gắn → duyệt TỪNG link: `NONE` chỉ chủ; `USER` (avatar) mọi user đăng
   *   nhập; còn lại hỏi `PermissionService` theo scope. Có link OK ở BẤT KỲ
   *   đâu → đọc được (chuyển tiếp giữa nhiều hội thoại — AST-05).
   * - Hết vòng lặp mà không link nào cho qua → KHÔNG đọc được, kể cả là chủ
   *   (thu hồi xuyên suốt: chủ mất quyền scope thì cũng mất quyền tệp).
   */
  async canRead(user: AuthUser, asset: AssetAccessSubject): Promise<boolean> {
    if (asset.status === "DELETED") return false;

    const rootId = asset.parentAssetId ?? asset.id;
    const links = await this.linkRepo.listByAsset(rootId, 20);
    if (links.length === 0) return asset.ownerId === user.id;

    for (const link of links) {
      // Target có resolver riêng (p4-01 `STUDY_ITEM`/`STUDY_SET_COVER`): CHỈ resolver quyết định link này.
      const custom = getAssetTargetReadResolver(link.targetType);
      if (custom) {
        if (await custom.canRead(user, link)) return true;
        continue;
      }
      if (link.scopeType === "NONE") {
        if (asset.ownerId === user.id) return true;
        continue;
      }
      if (link.scopeType === "USER") return true;
      const action = READ_ACTION_BY_TARGET[link.targetType] ?? READ_ACTION[link.scopeType];
      if (!action || !link.scopeId) continue;
      const ok = await permissionService.can(user, action, { type: link.scopeType as ScopeType, id: link.scopeId });
      if (ok) return true;
    }
    return false;
  }

  /** `PERM_404` khi không đọc được — giống mọi scope khác (be.md §5.2), không lộ sự tồn tại của tệp. */
  async assertRead(user: AuthUser, asset: AssetAccessSubject): Promise<void> {
    const ok = await this.canRead(user, asset);
    if (!ok) throw new ScopeNotFoundError();
  }
}
