import { Router } from "express";
import { MODULES } from "../../core/constants/modules";
import { apiLimiter, authenticateToken, requireFeature, requirePermission, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createAdminIntegrationsController } from "./controllers/admin-integrations.controller";
import {
  adminConnectionsQuerySchema,
  adminEventsQuerySchema,
  adminProviderParamsSchema,
  providerToggleSchema,
  replayReasonSchema,
  workspaceParamsSchema,
} from "./dtos/integration.dto";

const router = Router();
const ctl = createAdminIntegrationsController();
const A = [authenticateToken, requireFeature(MODULES.INTEGRATION), apiLimiter] as const;
const view = requirePermission("integration:view");
const update = requirePermission("integration:update");

/**
 * @openapi
 * /admin/integrations/events:
 *   get:
 *     summary: Sự kiện webhook tích hợp (phân trang) — lọc provider/status/workspaceId/from/to; KHÔNG payload
 *     tags: [Admin Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/integrations/events", ...A, view, validateQuery(adminEventsQuerySchema), ctl.listEvents);

/**
 * @openapi
 * /admin/integrations/events/{id}:
 *   get:
 *     summary: Chi tiết sự kiện — payload ĐÃ CHE (`***` cho token/secret/email), tin hệ thống đã tạo (tên kênh chỉ khi công khai), chuỗi phát lại
 *     tags: [Admin Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/integrations/events/:id", ...A, view, validateParams(idParamSchema), ctl.getEvent);

/**
 * @openapi
 * /admin/integrations/events/{id}/replay:
 *   post:
 *     summary: Phát lại sự kiện FAILED/IGNORED (`{ reason }` ≥ 10 ký tự, audit `integration.replay`). 202
 *     description: INT_006 quá thời gian lưu payload; VAL_001 sự kiện chưa lỗi/bị bỏ qua.
 *     tags: [Admin Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/admin/integrations/events/:id/replay", ...A, update, validateParams(idParamSchema), validateBody(replayReasonSchema), ctl.replayEvent);

/**
 * @openapi
 * /admin/integrations/providers:
 *   get:
 *     summary: Bốn nhà cung cấp — configured (có đủ khoá env, không hiện giá trị) / enabled / số kết nối ACTIVE-ERROR-REVOKED / sự kiện 24 giờ / lỗi gần nhất
 *     tags: [Admin Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/integrations/providers", ...A, view, ctl.listProviders);

/**
 * @openapi
 * /admin/integrations/providers/{provider}:
 *   put:
 *     summary: Bật/tắt nhà cung cấp toàn hệ thống (`{ enabled, reason }`) — ghi `SystemConfig integrations.providers.<key>.enabled` + audit `integration.provider-toggle`
 *     description: Tắt → webhook mới bị ghi IGNORED, nút kết nối ẩn, kết nối hiện có giữ nguyên (INT-09). Bật khi chưa cấu hình khoá → INT_001.
 *     tags: [Admin Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.put("/admin/integrations/providers/:provider", ...A, update, validateParams(adminProviderParamsSchema), validateBody(providerToggleSchema), ctl.toggleProvider);

/**
 * @openapi
 * /admin/integrations:
 *   get:
 *     summary: Kết nối theo trạng thái (mặc định `status=ERROR,REVOKED`) — chỉ metadata, không cấu hình/không token
 *     tags: [Admin Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/integrations", ...A, view, validateQuery(adminConnectionsQuerySchema), ctl.listConnections);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/integrations:
 *   get:
 *     summary: Kết nối của một workspace (tab "Tích hợp" trong drawer workspace) — chỉ đọc; kênh đích riêng tư không lộ tên
 *     tags: [Admin Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/workspaces/:workspaceId/integrations", ...A, view, validateParams(workspaceParamsSchema), ctl.listForWorkspace);

export default router;
