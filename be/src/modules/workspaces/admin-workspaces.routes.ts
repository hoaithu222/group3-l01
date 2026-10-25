import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requirePermission, requireFeature, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { objectIdSchema } from "../../shared/dto/common-schemas";
import { PrismaWorkspaceRepository } from "./repositories";
import { AdminWorkspaceQueryService } from "./services/admin-workspace-query.service";
import { AdminWorkspaceImageService } from "./services/admin-workspace-image.service";
import { WorkspaceLifecycleService } from "./services/workspace-lifecycle.service";
import { createAdminWorkspaceController } from "./controllers/admin-workspace.controller";
import { adminListWorkspacesQuerySchema, adminArchiveSchema, adminStatsQuerySchema, adminRemoveImageSchema } from "./dtos";
import { createMembershipLifecyclePort } from "../members/public";
import { createAssetLinkService } from "../assets/public";

const router = Router();

const workspaceIdParamsSchema = z.object({ workspaceId: objectIdSchema });

const repo = new PrismaWorkspaceRepository();
const queryService = new AdminWorkspaceQueryService(repo);
const lifecycleService = new WorkspaceLifecycleService(repo, createMembershipLifecyclePort());
const imageService = new AdminWorkspaceImageService(repo, createAssetLinkService());
const controller = createAdminWorkspaceController(queryService, lifecycleService, imageService);

router.use(authenticateToken);
router.use(requireFeature(MODULES.COMMUNICATION));

/**
 * @openapi
 * /admin/workspaces:
 *   get:
 *     summary: Danh bạ workspace (admin)
 *     tags: [Admin/Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/", requirePermission("workspace:view"), validateQuery(adminListWorkspacesQuerySchema), controller.list);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}:
 *   get:
 *     summary: Chi tiết workspace + số liệu 30 ngày (admin)
 *     tags: [Admin/Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/:workspaceId", requirePermission("workspace:view"), controller.getDetail);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/stats:
 *   get:
 *     summary: Chuỗi số liệu theo ngày (chart admin)
 *     tags: [Admin/Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:workspaceId/stats",
  requirePermission("workspace:view"),
  validateQuery(adminStatsQuerySchema),
  controller.getStats
);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/archive:
 *   post:
 *     summary: Lưu trữ cấp nền tảng (bắt buộc lý do, ghi audit)
 *     tags: [Admin/Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/:workspaceId/archive", requirePermission("workspace:update"), validateBody(adminArchiveSchema), controller.archive);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/restore:
 *   post:
 *     summary: Khôi phục workspace bị lưu trữ cấp nền tảng (bắt buộc lý do, ghi audit)
 *     tags: [Admin/Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/:workspaceId/restore", requirePermission("workspace:update"), validateBody(adminArchiveSchema), controller.restore);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/remove-image:
 *   post:
 *     summary: Gỡ ảnh đại diện hoặc ảnh bìa vi phạm của nhóm (bắt buộc lý do, ghi audit, báo chủ nhóm)
 *     description: 'Body `{ kind: "AVATAR" | "COVER", reason }`. Trả `{ workspace: AdminWorkspaceRow, removed }` — `removed: false` khi nhóm không có ảnh loại đó.'
 *     tags: [Admin/Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:workspaceId/remove-image",
  requirePermission("workspace:update"),
  // id sai định dạng → 400; thiếu thì Prisma ném "Malformed ObjectID" trong transaction ⇒ 500.
  validateParams(workspaceIdParamsSchema),
  validateBody(adminRemoveImageSchema),
  controller.removeImage
);

export default router;
