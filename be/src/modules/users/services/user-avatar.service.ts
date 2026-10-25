import { AppError, ForbiddenError, NotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { withTransaction } from "../../../infrastructure/database";
import type { AssetLinkService, AssetUrlPort } from "../../assets/public";
import type { AuditService } from "../../audit-log/audit-log.service";
import type { IUserRepository } from "../repositories";

/**
 * Ảnh đại diện người dùng (p0-01 be.md §5.6): `User.avatarAssetId` + `AssetLink(USER_AVATAR, scope USER)`.
 *  - ĐẶT ảnh (`assetId` ≠ null): CHỈ chính chủ (asset phải là của chính họ — `AssetLinkService.attach` kiểm `READY` + `ownerId` + `kind IMAGE`,
 *    thêm kiểm `scope AVATAR` ở đây); quản trị KHÔNG đặt hộ (asset của họ không thể là của người khác).
 *  - GỠ ảnh (`null`): chính chủ hoặc quản trị có `user:update` (route đã kiểm quyền) — gỡ ảnh vi phạm.
 * Ghi `User` + `AssetLink` trong CÙNG transaction (`replace`: gỡ link cũ → asset cũ vào hạn dọn `assets.cleanup`, gắn link mới).
 */
export class UserAvatarService {
  constructor(
    private readonly users: IUserRepository,
    private readonly assetLinks: Pick<AssetLinkService, "replace" | "detach">,
    private readonly assetUrls: Pick<AssetUrlPort, "getUrl">,
    /** Chỉ `removeByAdmin` cần; test cũ không truyền. */
    private readonly audit?: Pick<AuditService, "record">
  ) {}

  /**
   * `POST /admin/users/:id/avatar/remove` — quản trị (`user:update`) gỡ ảnh đại diện VI PHẠM kèm lý do, ghi audit
   * `user.avatar-remove`. Chưa có ảnh → `false`, không ghi gì (bấm lặp vô hại).
   */
  async removeByAdmin(actor: Pick<AuthUser, "id">, userId: string, reason: string): Promise<boolean> {
    const user = await this.users.findById(userId);
    if (!user || user.status === "ANONYMIZED") throw new NotFoundError("Không tìm thấy người dùng");
    if (!user.avatarAssetId) return false;
    await this.set(actor, userId, null);
    await this.audit?.record({ actorId: actor.id, action: "user.avatar-remove", targetType: "User", targetId: userId, reason });
    return true;
  }

  async set(actor: Pick<AuthUser, "id">, userId: string, assetId: string | null): Promise<void> {
    if (assetId !== null && actor.id !== userId) {
      throw new ForbiddenError("Chỉ chủ tài khoản mới đặt được ảnh đại diện");
    }
    await withTransaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
      if (!user || user.status === "ANONYMIZED") throw new NotFoundError("Không tìm thấy người dùng");

      if (assetId === null) {
        await this.assetLinks.detach(tx, { targetType: "USER_AVATAR", targetId: userId });
      } else {
        // be.md §5.6: chỉ asset tải lên với scope AVATAR (allowlist ảnh + trần dung lượng riêng của `mimePolicy`).
        const asset = await tx.asset.findUnique({ where: { id: assetId }, select: { scope: true } });
        if (asset && asset.scope !== "AVATAR") {
          throw new AppError("Loại tệp không hợp lệ cho mục đích này", 415, ErrorCode.ASSET_001);
        }
        await this.assetLinks.replace(tx, {
          targetType: "USER_AVATAR",
          targetId: userId,
          assetId,
          scopeType: "USER",
          scopeId: userId,
          actorId: actor.id,
        });
      }
      await tx.user.update({ where: { id: userId }, data: { avatarAssetId: assetId } });
    });
  }

  /**
   * `GET /users/:id/avatar` — URL ký (TTL `LIMITS.upload.avatarUrlTtlSeconds`, 3600 s; ảnh đại diện không phải nội dung riêng tư) để 302.
   * Chưa đặt ảnh/tài khoản không còn → 404 trung tính. Quyền đọc do `AssetService.getUrl` kiểm lại (link scope USER ⇒ mọi người đăng nhập).
   */
  async signedUrl(viewer: AuthUser, userId: string): Promise<{ url: string; expiresAt: string }> {
    const user = await this.users.findById(userId);
    if (!user?.avatarAssetId) throw new NotFoundError("Không tìm thấy ảnh đại diện");
    return this.assetUrls.getUrl(user.avatarAssetId, viewer, { variant: "ORIGINAL", disposition: "inline" });
  }
}
