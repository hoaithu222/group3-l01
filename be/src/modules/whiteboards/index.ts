/**
 * Barrel của module `whiteboards` (Whiteboard p6-02).
 *
 * `registerWhiteboardsModule()` — side-effect boot, gọi ở CẢ API (`router.ts`) lẫn worker (`worker-registries.ts`): resolver scope `WHITEBOARD` (PermissionService) và listener thu hồi
 * quyền → đóng kết nối collab. `registerWhiteboardsApiHooks()` — CHỈ API: cổng `POST /assets` scope `WHITEBOARD` (ảnh thu nhỏ) và quyền đọc asset `WHITEBOARD` (URL ký). Job/cron của worker
 * nạp ở `register-jobs.ts` (`jobs/whiteboard.jobs.ts`).
 */
import { permissionService } from "../../core/permission";
import { ScopeNotFoundError, ValidationError } from "../../core/exceptions";
import { registerAssetScopeGate } from "../../shared/ports/asset-scope-gate.port";
import { registerAssetTargetReadResolver } from "../../shared/ports/asset-target-access.port";
import { getWhiteboardsContainer } from "./whiteboards.container";
import { registerWhiteboardScopeResolver } from "./services/whiteboard-access.resolver";
import { registerWhiteboardRevokeListener } from "./services/whiteboard-revoke.service";

/** Ảnh thu nhỏ bảng trắng: PNG/WebP (client chụp canvas). SVG bị loại — chạy được script khi mở trực tiếp. (Trần dung lượng + MIME thật ở `LIMITS.upload.scopeRestrict.WHITEBOARD`.) */
export const WHITEBOARD_THUMBNAIL_MIMES: readonly string[] = ["image/png", "image/webp"];

export function registerWhiteboardsModule(): void {
  const c = getWhiteboardsContainer();
  registerWhiteboardScopeResolver({ whiteboards: c.whiteboards, collaborators: c.collaborators, directory: c.directory });
  registerWhiteboardRevokeListener();
}

export function registerWhiteboardsApiHooks(): void {
  const c = getWhiteboardsContainer();
  registerAssetScopeGate("WHITEBOARD", {
    beforeCreate: async ({ ownerId, workspaceId, mime }) => {
      if (!WHITEBOARD_THUMBNAIL_MIMES.includes(mime)) throw new ValidationError("Ảnh thu nhỏ bảng trắng chỉ nhận PNG hoặc WebP");
      if (!workspaceId) throw new ValidationError("Thiếu workspaceId cho ảnh thu nhỏ bảng trắng");
      // Phải là thành viên ACTIVE của nhóm (khách còn hạn cũng được — có thể là cộng tác viên EDITOR); quyền sửa CỤ THỂ bảng kiểm ở lúc gắn ảnh (PATCH thumbnailAssetId).
      const roles = await c.directory.activeRoles(workspaceId, [ownerId]);
      if (!roles.has(ownerId)) throw new ScopeNotFoundError();
    },
  });
  registerAssetTargetReadResolver("WHITEBOARD", {
    canRead: (user, link) => permissionService.can(user, "whiteboard.read", { type: "WHITEBOARD", id: link.targetId }),
  });
}
