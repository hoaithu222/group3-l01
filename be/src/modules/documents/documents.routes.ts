import { Router } from "express";
import { apiLimiter, authenticateToken, idempotencyKey, requireFeature, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { getDocumentsContainer } from "./documents.container";
import { createDocumentsController } from "./controllers/documents.controller";
import {
  addCollaboratorsSchema,
  archiveDocumentSchema,
  attachAssetSchema,
  collaboratorParamsSchema,
  createDocumentSchema,
  createSnapshotSchema,
  documentParamsSchema,
  listDocumentsQuerySchema,
  listSnapshotsQuerySchema,
  restoreSnapshotSchema,
  snapshotParamsSchema,
  updateDocumentSchema,
  workspaceParamsSchema,
} from "./dtos";

const controller = createDocumentsController(getDocumentsContainer());

// Mọi route: đăng nhập → cờ `collab` (tắt → 404 CFG_005) → rate limit theo user. Quyền từng tài liệu do service kiểm (`permissionService`, scope DOCUMENT): 404 trung tính khi
// không thấy (PRIVATE với OWNER/ADMIN nhóm không phải cộng tác viên cũng 404 — CW-D2), 403 khi thấy nhưng không được làm.
const M = [authenticateToken, requireFeature(MODULES.COLLAB), apiLimiter] as const;

const router = Router();
const byUser = (req: { user?: { id: string } }) => req.user?.id ?? null;

/**
 * @openapi
 * /workspaces/{workspaceId}/documents:
 *   get: { summary: "Danh sách tài liệu của nhóm (cursor; q, status) — PRIVATE chỉ khi là người tạo/cộng tác viên; khách chỉ thấy tài liệu được mời", tags: [Documents], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Tạo tài liệu (Idempotency-Key; MEMBER+; DOC_001 quá số tài liệu)", tags: [Documents], security: [{ BearerAuth: [] }] }
 */
router.get("/workspaces/:workspaceId/documents", ...M, validateParams(workspaceParamsSchema), validateQuery(listDocumentsQuerySchema), controller.list);
router.post("/workspaces/:workspaceId/documents", ...M, validateParams(workspaceParamsSchema), idempotencyKey("doc-create"), validateBody(createDocumentSchema), controller.create);

/**
 * @openapi
 * /documents/{id}:
 *   get: { summary: "Metadata tài liệu + myRole + myPermissions (edit, manage, snapshot, restore) — KHÔNG trả nội dung Yjs", tags: [Documents], security: [{ BearerAuth: [] }] }
 *   patch: { summary: "Đổi tên/visibility (expectedVersion → RES_003; DOC_002 đổi PRIVATE sang WORKSPACE cần confirmPublic)", tags: [Documents], security: [{ BearerAuth: [] }] }
 */
router.get("/documents/:id", ...M, validateParams(documentParamsSchema), controller.get);
router.patch("/documents/:id", ...M, validateParams(documentParamsSchema), validateBody(updateDocumentSchema), controller.update);

/**
 * @openapi
 * /documents/{id}/archive:
 *   post: { summary: "Lưu trữ tài liệu (chỉ xem; đóng mọi kết nối soạn để nối lại ở chế độ xem)", tags: [Documents], security: [{ BearerAuth: [] }] }
 * /documents/{id}/restore:
 *   post: { summary: "Khôi phục tài liệu đã lưu trữ (DOC_001 nếu nhóm đã đủ số tài liệu)", tags: [Documents], security: [{ BearerAuth: [] }] }
 */
router.post("/documents/:id/archive", ...M, validateParams(documentParamsSchema), validateBody(archiveDocumentSchema), controller.archive);
router.post("/documents/:id/restore", ...M, validateParams(documentParamsSchema), validateBody(archiveDocumentSchema), controller.unarchive);

/**
 * @openapi
 * /documents/{id}/collaborators:
 *   get: { summary: "Danh sách người cộng tác (userId, name, role)", tags: [Documents], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Thêm/đổi vai người cộng tác (manage; DOC_003 không thuộc nhóm, DOC_004 quá số người)", tags: [Documents], security: [{ BearerAuth: [] }] }
 * /documents/{id}/collaborators/{userId}:
 *   delete: { summary: "Gỡ người cộng tác (204; không gỡ được người tạo) — đóng kết nối collab của họ", tags: [Documents], security: [{ BearerAuth: [] }] }
 */
router.get("/documents/:id/collaborators", ...M, validateParams(documentParamsSchema), controller.listCollaborators);
router.post("/documents/:id/collaborators", ...M, validateParams(documentParamsSchema), validateBody(addCollaboratorsSchema), controller.addCollaborators);
router.delete("/documents/:id/collaborators/:userId", ...M, validateParams(collaboratorParamsSchema), controller.removeCollaborator);

/**
 * @openapi
 * /documents/{id}/collab-token:
 *   post: { summary: "Cấp mã kết nối collab (JWT 5 phút) + url WebSocket + documentName + mode edit|view; 30 lần/phút/người; xin lại khi còn 60 giây", tags: [Documents], security: [{ BearerAuth: [] }] }
 */
router.post(
  "/documents/:id/collab-token",
  ...M,
  validateParams(documentParamsSchema),
  scopeLimiter("collab-token", byUser, [{ max: LIMITS.document.collabTokenPerMinute, windowSeconds: 60 }]),
  controller.collabToken
);

/**
 * @openapi
 * /documents/{id}/assets:
 *   post: { summary: "Gắn ảnh đã tải lên (scope DOC, READY, của chính người chèn) vào tài liệu để mọi người đọc lấy URL ký — cần quyền sửa", tags: [Documents], security: [{ BearerAuth: [] }] }
 */
router.post("/documents/:id/assets", ...M, validateParams(documentParamsSchema), validateBody(attachAssetSchema), controller.attachAsset);

/**
 * @openapi
 * /documents/{id}/snapshots:
 *   get: { summary: "Lịch sử phiên bản (AUTO/MANUAL/PRE_RESTORE, cursor) — không kèm nội dung", tags: [Documents], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Lưu phiên bản thủ công (label; DOC_007 quá 100 bản; ép collab lưu state đang sống trước)", tags: [Documents], security: [{ BearerAuth: [] }] }
 * /documents/{id}/snapshots/{sid}:
 *   get: { summary: "Chi tiết phiên bản kèm yjsState base64 (editor dựng bản xem chỉ đọc)", tags: [Documents], security: [{ BearerAuth: [] }] }
 * /documents/{id}/snapshots/{sid}/restore:
 *   post: { summary: "Khôi phục phiên bản (expectedVersion; tạo PRE_RESTORE; mọi người đang sửa thấy nội dung được thay) → { restoredVersion, version, preRestoreSnapshotId }", tags: [Documents], security: [{ BearerAuth: [] }] }
 */
router.get("/documents/:id/snapshots", ...M, validateParams(documentParamsSchema), validateQuery(listSnapshotsQuerySchema), controller.listSnapshots);
router.post(
  "/documents/:id/snapshots",
  ...M,
  validateParams(documentParamsSchema),
  scopeLimiter("doc-snapshot", byUser, [{ max: 60, windowSeconds: 3600 }]),
  validateBody(createSnapshotSchema),
  controller.createSnapshot
);
router.get("/documents/:id/snapshots/:sid", ...M, validateParams(snapshotParamsSchema), controller.getSnapshot);
router.post(
  "/documents/:id/snapshots/:sid/restore",
  ...M,
  validateParams(snapshotParamsSchema),
  scopeLimiter("doc-restore", byUser, [{ max: 30, windowSeconds: 3600 }]),
  validateBody(restoreSnapshotSchema),
  controller.restoreSnapshot
);

export default router;
