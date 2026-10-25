import { Router } from "express";
import {
  authenticateToken,
  apiLimiter,
  idempotencyKey,
  requireFeature,
  validateBody,
  validateParams,
  validateQuery,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { registerAssetScopeGate } from "../../shared/ports/asset-scope-gate.port";
import { getResourcesContainer } from "./resources.container";
import { createFolderController } from "./controllers/folder.controller";
import { createResourceController } from "./controllers/resource.controller";
import {
  createFolderSchema,
  createResourceSchema,
  deleteFolderQuerySchema,
  listFoldersQuerySchema,
  listResourcesQuerySchema,
  resourceUrlQuerySchema,
  trashItemParamSchema,
  trashQuerySchema,
  updateFolderSchema,
  updateResourceSchema,
  workspaceParamSchema,
} from "./dtos";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const c = getResourcesContainer();
const folderController = createFolderController(c.folders);
const controller = createResourceController(c.resources, c.lists, c.mutations, c.trash);

// Hook `POST /assets` scope RESOURCE (quyền tải lên + hạn mức `RSC_007`) — side-effect lúc import, giống
// `registerScopeResolver`: `router.ts` import file này trước request đầu tiên; `modules/assets` chỉ tra registry.
registerAssetScopeGate("RESOURCE", c.uploadGate);

const guard = [authenticateToken, requireFeature(MODULES.PROJECT), apiLimiter];
const ws = validateParams(workspaceParamSchema);
const id = validateParams(idParamSchema);

// ── Thư mục ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /workspaces/{workspaceId}/folders:
 *   get:
 *     summary: Thư mục con của 1 thư mục (hoặc gốc) + breadcrumb
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: workspaceId, in: path, required: true, schema: { type: string } }
 *       - { name: parentId, in: query, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "{ folder?, breadcrumb: FolderDto[], children: FolderDto[] } (≤ 500, sắp theo tên)"
 */
router.get("/workspaces/:workspaceId/folders", ...guard, ws, validateQuery(listFoldersQuerySchema), folderController.list);

/**
 * @openapi
 * /workspaces/{workspaceId}/folders:
 *   post:
 *     summary: Tạo thư mục (RSC_001 quá 8 cấp, RSC_002 trùng tên cùng cấp)
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: FolderDto }
 */
router.post("/workspaces/:workspaceId/folders", ...guard, ws, validateBody(createFolderSchema), folderController.create);

/**
 * @openapi
 * /folders/{id}:
 *   patch:
 *     summary: Đổi tên / di chuyển thư mục (RSC_002, RSC_006 vào chính con của nó, RSC_001, RES_003)
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: FolderDto }
 */
router.patch("/folders/:id", ...guard, id, validateBody(updateFolderSchema), folderController.update);

/**
 * @openapi
 * /folders/{id}:
 *   delete:
 *     summary: Xoá mềm thư mục (RSC_004 nếu còn nội dung và không phải OWNER/ADMIN + recursive=true)
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: recursive, in: query, schema: { type: string, enum: ["true", "false"], default: "false" } }
 *     responses:
 *       204: { description: Đã chuyển vào thùng rác }
 */
router.delete("/folders/:id", ...guard, id, validateQuery(deleteFolderQuerySchema), folderController.remove);

/**
 * @openapi
 * /folders/{id}/restore:
 *   post:
 *     summary: Khôi phục thư mục (RSC_002 tên đã bị chiếm, RSC_008 thư mục cha không còn)
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: FolderDto }
 */
router.post("/folders/:id/restore", ...guard, id, folderController.restore);

// ── Tệp ──────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /workspaces/{workspaceId}/resources:
 *   get:
 *     summary: Danh sách tệp theo thư mục hoặc tìm không dấu toàn nhóm (cursor)
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: folderId, in: query, schema: { type: string, description: "id thư mục hoặc 'root'" } }
 *       - { name: q, in: query, schema: { type: string, minLength: 2, maxLength: 100 } }
 *       - { name: type, in: query, schema: { type: string, enum: [PDF, IMAGE, VIDEO, AUDIO, CODE, DOC, SHEET, SLIDE, TEXT, OTHER] } }
 *       - { name: sort, in: query, schema: { type: string, enum: [createdAt, name, size], default: createdAt } }
 *       - { name: order, in: query, schema: { type: string, enum: [asc, desc], default: desc } }
 *       - { name: cursor, in: query, schema: { type: string } }
 *       - { name: limit, in: query, schema: { type: integer } }
 *     responses:
 *       200: { description: "data: ResourceDto[], meta: { nextCursor, hasMore, limit }" }
 */
router.get("/workspaces/:workspaceId/resources", ...guard, ws, validateQuery(listResourcesQuerySchema), controller.list);

/**
 * @openapi
 * /workspaces/{workspaceId}/resources:
 *   post:
 *     summary: Thêm tệp (asset READY, RESOURCE) vào kho tài liệu — RSC_003, RSC_007
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: ResourceDto }
 */
router.post(
  "/workspaces/:workspaceId/resources",
  ...guard,
  ws,
  idempotencyKey("resource-create"),
  validateBody(createResourceSchema),
  controller.create
);

/**
 * @openapi
 * /resources/{id}:
 *   get:
 *     summary: Chi tiết tệp + myPermissions
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "ResourceDto & { myPermissions }" }
 */
router.get("/resources/:id", ...guard, id, controller.get);

/**
 * @openapi
 * /resources/{id}:
 *   patch:
 *     summary: Đổi tên / mô tả / thẻ / thư mục của tệp (RES_003 lệch phiên bản)
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: ResourceDto }
 */
router.patch("/resources/:id", ...guard, id, validateBody(updateResourceSchema), controller.patch);

/**
 * @openapi
 * /resources/{id}:
 *   delete:
 *     summary: Xoá mềm tệp vào thùng rác 30 ngày (của mình, hoặc OWNER/ADMIN)
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã chuyển vào thùng rác }
 */
router.delete("/resources/:id", ...guard, id, controller.remove);

/**
 * @openapi
 * /resources/{id}/restore:
 *   post:
 *     summary: Khôi phục tệp từ thùng rác (thư mục cũ không còn → về gốc)
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: ResourceDto }
 */
router.post("/resources/:id/restore", ...guard, id, controller.restore);

/**
 * @openapi
 * /resources/{id}/url:
 *   get:
 *     summary: URL ký ≤ 60 s (variant original|preview|download); RSC_005 khi chưa có bản xem trước
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: variant, in: query, schema: { type: string, enum: [original, preview, download], default: original } }
 *     responses:
 *       200: { description: "{ url, expiresAt, mime, disposition }" }
 */
router.get("/resources/:id/url", ...guard, id, validateQuery(resourceUrlQuerySchema), controller.url);

// ── Thùng rác, dung lượng ────────────────────────────────────────────────────

/**
 * @openapi
 * /workspaces/{workspaceId}/trash:
 *   get:
 *     summary: "Thùng rác (MEMBER: mục do mình xoá; OWNER/ADMIN: tất cả) — chỉ gốc của mỗi lô xoá"
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: { folders: FolderDto[], resources: ResourceDto[] } + purgeAt/canRestore/canPurge, meta: cursor" }
 */
router.get("/workspaces/:workspaceId/trash", ...guard, ws, validateQuery(trashQuerySchema), controller.trashList);

/**
 * @openapi
 * /workspaces/{workspaceId}/trash/{resourceId}:
 *   delete:
 *     summary: Xoá vĩnh viễn ngay 1 tệp trong thùng rác (OWNER/ADMIN, có audit)
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã xoá vĩnh viễn }
 */
router.delete("/workspaces/:workspaceId/trash/:resourceId", ...guard, validateParams(trashItemParamSchema), controller.trashPurge);

/**
 * @openapi
 * /workspaces/{workspaceId}/storage:
 *   get:
 *     summary: Dung lượng kho tài liệu (OWNER/ADMIN)
 *     tags: [Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: StorageUsageDto }
 */
router.get("/workspaces/:workspaceId/storage", ...guard, ws, controller.storage);

export default router;
