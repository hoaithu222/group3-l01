/**
 * Barrel của module `documents` (Real-time Docs p6-01).
 *
 * `registerDocumentsModule()` — side-effect boot, gọi ở CẢ API (`router.ts`) lẫn worker (`worker-registries.ts`): resolver scope `DOCUMENT` (PermissionService), loại thông báo
 * `document.collaborator-added`, listener thu hồi quyền → đóng kết nối collab. `registerDocumentsApiHooks()` — CHỈ API: cổng `POST /assets` scope `DOC` (ảnh chèn) và quyền đọc
 * asset `DOCUMENT` (URL ký). Job/cron của worker nạp ở `register-jobs.ts` (`jobs/document.jobs.ts`).
 */
import { permissionService } from "../../core/permission";
import { ScopeNotFoundError, ValidationError } from "../../core/exceptions";
import { registerAssetScopeGate } from "../../shared/ports/asset-scope-gate.port";
import { registerAssetTargetReadResolver } from "../../shared/ports/asset-target-access.port";
import { getDocumentsContainer } from "./documents.container";
import { registerDocumentScopeResolver } from "./services/document-access.resolver";
import { registerDocumentNotificationTypes } from "./services/document-integrations";
import { registerDocumentRevokeListener } from "./services/document-revoke.service";

/** Ảnh chèn tài liệu: chỉ định dạng ảnh web phổ biến (SVG bị loại — chạy được script khi mở trực tiếp). */
export const DOC_IMAGE_MIMES: readonly string[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function registerDocumentsModule(): void {
  const c = getDocumentsContainer();
  registerDocumentScopeResolver({ documents: c.documents, collaborators: c.collaborators, directory: c.directory });
  registerDocumentNotificationTypes();
  registerDocumentRevokeListener();
}

export function registerDocumentsApiHooks(): void {
  const c = getDocumentsContainer();
  registerAssetScopeGate("DOC", {
    beforeCreate: async ({ ownerId, workspaceId, mime }) => {
      if (!DOC_IMAGE_MIMES.includes(mime)) throw new ValidationError("Ảnh tài liệu chỉ nhận JPEG, PNG, WebP hoặc GIF");
      if (!workspaceId) throw new ValidationError("Thiếu workspaceId cho ảnh tài liệu");
      // Phải là thành viên ACTIVE của nhóm (khách còn hạn cũng được — có thể là cộng tác viên EDITOR); quyền sửa CỤ THỂ tài liệu kiểm ở lúc gắn ảnh.
      const roles = await c.directory.activeRoles(workspaceId, [ownerId]);
      if (!roles.has(ownerId)) throw new ScopeNotFoundError();
    },
  });
  registerAssetTargetReadResolver("DOCUMENT", {
    canRead: (user, link) => permissionService.can(user, "document.read", { type: "DOCUMENT", id: link.targetId }),
  });
}
