import { Router } from "express";
import {
  authenticateToken,
  requireFeature,
  requirePermission,
  validateBody,
  validateParams,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { getResourcesContainer } from "./resources.container";
import { createResourceAdminController } from "./controllers/resource-admin.controller";
import { resetResourceQuotaSchema, setResourceQuotaSchema, workspaceParamSchema } from "./dtos";

/**
 * Admin kho tài liệu (admin.md p3-01 §3) — mount `/admin/workspaces`. Chỉ số liệu dung lượng (KHÔNG tên tệp/thư
 * mục của nhóm) + hạn mức riêng; mọi thao tác ghi bắt buộc `reason` và ghi audit `resource.quota-override`.
 */
const router = Router();
const controller = createResourceAdminController(getResourcesContainer().admin);
const ws = validateParams(workspaceParamSchema);

// Middleware gắn TỪNG route (không `router.use`): router này mount chung prefix `/admin/workspaces` với router admin khác — một
// `router.use(requireFeature(...))` sẽ chặn nhầm request của module khác đi qua nó (cờ khác) trước khi tới route của họ.
const guard = [authenticateToken, requireFeature(MODULES.PROJECT)];

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/resource-stats:
 *   get:
 *     summary: Số liệu dung lượng kho tài liệu của nhóm (không tên tệp)
 *     tags: [Admin/Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ usedBytes, quotaBytes, quotaSource, fileCount, folderCount, trashBytes, byType[] }" }
 */
router.get("/:workspaceId/resource-stats", ...guard, requirePermission("workspace:view"), ws, controller.stats);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/resource-quota:
 *   put:
 *     summary: Đặt hạn mức kho tài liệu riêng cho nhóm (0,5–100 GiB, bắt buộc lý do, ghi audit)
 *     tags: [Admin/Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ quotaBytes, quotaSource }" }
 */
router.put(
  "/:workspaceId/resource-quota",
  ...guard,
  requirePermission("system-config:update"),
  ws,
  validateBody(setResourceQuotaSchema),
  controller.setQuota
);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/resource-quota/reset:
 *   post:
 *     summary: Đưa hạn mức về mặc định (bắt buộc lý do, ghi audit)
 *     tags: [Admin/Resources]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ quotaBytes, quotaSource }" }
 */
router.post(
  "/:workspaceId/resource-quota/reset",
  ...guard,
  requirePermission("system-config:update"),
  ws,
  validateBody(resetResourceQuotaSchema),
  controller.resetQuota
);

export default router;
