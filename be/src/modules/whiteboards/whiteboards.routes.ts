import { Router } from "express";
import { apiLimiter, authenticateToken, idempotencyKey, requireFeature, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { getWhiteboardsContainer } from "./whiteboards.container";
import { createWhiteboardsController } from "./controllers/whiteboards.controller";
import {
  addCollaboratorsSchema,
  archiveWhiteboardSchema,
  collaboratorParamsSchema,
  createSnapshotSchema,
  createWhiteboardSchema,
  listSnapshotsQuerySchema,
  listWhiteboardsQuerySchema,
  restoreSnapshotSchema,
  snapshotParamsSchema,
  updateWhiteboardSchema,
  whiteboardParamsSchema,
  workspaceParamsSchema,
} from "./dtos";

const controller = createWhiteboardsController(getWhiteboardsContainer());

// Mọi route: đăng nhập → cờ `collab` (dùng chung với tài liệu; tắt → 404 CFG_005) → rate limit theo user. Quyền từng bảng do service kiểm (`permissionService`, scope WHITEBOARD): 404 trung tính khi
// không thấy (PRIVATE với OWNER/ADMIN nhóm không phải cộng tác viên cũng 404), 403 khi thấy nhưng không được làm.
const M = [authenticateToken, requireFeature(MODULES.COLLAB), apiLimiter] as const;

const router = Router();
const byUser = (req: { user?: { id: string } }) => req.user?.id ?? null;

/**
 * @openapi
 * /workspaces/{workspaceId}/whiteboards:
 *   get: { summary: "Danh sách bảng trắng của nhóm (cursor; q, status) — kèm thumbnailUrl (URL ký); PRIVATE chỉ khi là người tạo/cộng tác viên; khách chỉ thấy bảng được mời", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Tạo bảng trắng (Idempotency-Key; MEMBER+; WB_001 quá số bảng)", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 */
router.get("/workspaces/:workspaceId/whiteboards", ...M, validateParams(workspaceParamsSchema), validateQuery(listWhiteboardsQuerySchema), controller.list);
router.post("/workspaces/:workspaceId/whiteboards", ...M, validateParams(workspaceParamsSchema), idempotencyKey("wb-create"), validateBody(createWhiteboardSchema), controller.create);

/**
 * @openapi
 * /whiteboards/{id}:
 *   get: { summary: "Metadata bảng + myRole + myPermissions (edit, manage, snapshot, restore) — KHÔNG trả nội dung Yjs", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 *   patch: { summary: "Đổi tên/visibility (manage) hoặc CHỈ ảnh thu nhỏ thumbnailAssetId (edit) — expectedVersion → RES_003; WB_002 ảnh không hợp lệ; đổi PRIVATE sang WORKSPACE cần confirmPublic", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 */
router.get("/whiteboards/:id", ...M, validateParams(whiteboardParamsSchema), controller.get);
router.patch("/whiteboards/:id", ...M, validateParams(whiteboardParamsSchema), validateBody(updateWhiteboardSchema), controller.update);

/**
 * @openapi
 * /whiteboards/{id}/archive:
 *   post: { summary: "Lưu trữ bảng (chỉ xem; đóng mọi kết nối vẽ để nối lại ở chế độ xem)", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 * /whiteboards/{id}/restore:
 *   post: { summary: "Khôi phục bảng đã lưu trữ (WB_001 nếu nhóm đã đủ số bảng)", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 */
router.post("/whiteboards/:id/archive", ...M, validateParams(whiteboardParamsSchema), validateBody(archiveWhiteboardSchema), controller.archive);
router.post("/whiteboards/:id/restore", ...M, validateParams(whiteboardParamsSchema), validateBody(archiveWhiteboardSchema), controller.unarchive);

/**
 * @openapi
 * /whiteboards/{id}/collaborators:
 *   get: { summary: "Danh sách người cộng tác (userId, name, role)", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Thêm/đổi vai người cộng tác (manage; WB_003 không thuộc nhóm, WB_004 quá số người)", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 * /whiteboards/{id}/collaborators/{userId}:
 *   delete: { summary: "Gỡ người cộng tác (204; không gỡ được người tạo) — đóng kết nối collab của họ", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 */
router.get("/whiteboards/:id/collaborators", ...M, validateParams(whiteboardParamsSchema), controller.listCollaborators);
router.post("/whiteboards/:id/collaborators", ...M, validateParams(whiteboardParamsSchema), validateBody(addCollaboratorsSchema), controller.addCollaborators);
router.delete("/whiteboards/:id/collaborators/:userId", ...M, validateParams(collaboratorParamsSchema), controller.removeCollaborator);

/**
 * @openapi
 * /whiteboards/{id}/collab-token:
 *   post: { summary: "Cấp mã kết nối collab (JWT 5 phút) + url WebSocket + documentName wb:<id> + mode edit|view; 30 lần/phút/người; xin lại khi còn 60 giây", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 */
router.post(
  "/whiteboards/:id/collab-token",
  ...M,
  validateParams(whiteboardParamsSchema),
  scopeLimiter("wb-collab-token", byUser, [{ max: LIMITS.whiteboard.collabTokenPerMinute, windowSeconds: 60 }]),
  controller.collabToken
);

/**
 * @openapi
 * /whiteboards/{id}/snapshots:
 *   get: { summary: "Lịch sử phiên bản (AUTO/MANUAL/PRE_RESTORE, cursor) — không kèm nội dung", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Lưu phiên bản thủ công (label; WB_006 quá số bản; ép collab lưu state đang sống trước)", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 * /whiteboards/{id}/snapshots/{sid}:
 *   get: { summary: "Chi tiết phiên bản kèm yjsState base64 (app dựng bản xem chỉ đọc)", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 * /whiteboards/{id}/snapshots/{sid}/restore:
 *   post: { summary: "Khôi phục phiên bản (expectedVersion; tạo PRE_RESTORE; mọi người đang vẽ thấy nội dung được thay) → { restoredVersion, version, preRestoreSnapshotId }", tags: [Whiteboards], security: [{ BearerAuth: [] }] }
 */
router.get("/whiteboards/:id/snapshots", ...M, validateParams(whiteboardParamsSchema), validateQuery(listSnapshotsQuerySchema), controller.listSnapshots);
router.post(
  "/whiteboards/:id/snapshots",
  ...M,
  validateParams(whiteboardParamsSchema),
  scopeLimiter("wb-snapshot", byUser, [{ max: 60, windowSeconds: 3600 }]),
  validateBody(createSnapshotSchema),
  controller.createSnapshot
);
router.get("/whiteboards/:id/snapshots/:sid", ...M, validateParams(snapshotParamsSchema), controller.getSnapshot);
router.post(
  "/whiteboards/:id/snapshots/:sid/restore",
  ...M,
  validateParams(snapshotParamsSchema),
  scopeLimiter("wb-restore", byUser, [{ max: 30, windowSeconds: 3600 }]),
  validateBody(restoreSnapshotSchema),
  controller.restoreSnapshot
);

export default router;
