import { Router, type Request } from "express";
import { LIMITS } from "../../core/constants/limits";
import { MODULES } from "../../core/constants/modules";
import { apiLimiter, authenticateToken, requireFeature, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { requireWorkspaceRole } from "../../core/permission";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createIntegrationsController, createUserIntegrationsController } from "./controllers/integrations.controller";
import {
  callbackQuerySchema,
  connectSchema,
  eventsQuerySchema,
  integrationEventParamsSchema,
  providerParamsSchema,
  resourcesQuerySchema,
  updateIntegrationSchema,
  workspaceParamsSchema,
  workspaceProviderParamsSchema,
} from "./dtos/integration.dto";
import { registerIntegrationsModule } from "./index";

// Import routes = đăng ký handler webhook + loại thông báo + listener thu hồi quyền (API). Worker đăng ký phần của mình ở `jobs/integrations.jobs.ts`.
registerIntegrationsModule();

const router = Router();
const ctl = createIntegrationsController();
const me = createUserIntegrationsController();

// `A` = đăng nhập → cờ `integration` (404 CFG_005 khi tắt, mặc định TẮT) → hạn mức chung theo người dùng.
const A = [authenticateToken, requireFeature(MODULES.INTEGRATION), apiLimiter] as const;
const HOUR = 3600;
const byUser = (req: Request): string | null => req.user?.id ?? null;
const byIntegration = (req: Request): string | null => (req.params.id ? String(req.params.id) : null);
const connectLimit = scopeLimiter("int-connect", byUser, [{ max: LIMITS.integration.connectPerHour, windowSeconds: HOUR }]);
const replayLimit = scopeLimiter("int-replay", byIntegration, [{ max: LIMITS.integration.replayPerHour, windowSeconds: HOUR }]);

/**
 * @openapi
 * /integrations/providers:
 *   get:
 *     summary: Nhà cung cấp tích hợp — `{ provider, key, label, kind, configured, enabled, available, events }` (nút Kết nối chỉ hiện khi `available`)
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/integrations/providers", ...A, ctl.providers);

/**
 * @openapi
 * /integrations/{provider}/callback:
 *   get:
 *     summary: Callback OAuth/cài đặt (CÔNG KHAI — trình duyệt hệ thống). `state` dùng một lần; mọi kết quả là 302 về `superapp://integrations/callback?status=ok|error|cancelled&provider&id&code&workspaceId` (hoặc trang admin)
 *     description: State lạ/đã dùng/hết hạn → 302 `status=error&code=INT_003`, không tạo kết nối (INT-05). Tài khoản đã nối nhóm khác → `INT_008`.
 *     tags: [Integrations]
 *     security: []
 */
router.get("/integrations/:provider/callback", validateParams(providerParamsSchema), validateQuery(callbackQuerySchema), ctl.callback);

/**
 * @openapi
 * /workspaces/{workspaceId}/integrations:
 *   get:
 *     summary: "Kết nối của nhóm — OWNER/ADMIN `{ canManage:true, items: IntegrationView[] }` (không token/secret, INT-08); MEMBER chỉ tên nhà cung cấp + kênh đích"
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/workspaces/:workspaceId/integrations", ...A, validateParams(workspaceParamsSchema), requireWorkspaceRole("MEMBER"), ctl.listForWorkspace);

/**
 * @openapi
 * /workspaces/{workspaceId}/integrations/{provider}/connect:
 *   post:
 *     summary: Bắt đầu kết nối GitHub/GitLab/Figma (OWNER/ADMIN) → `{ authorizeUrl }` (mở bằng trình duyệt hệ thống)
 *     description: INT_001 nhà cung cấp chưa bật/thiếu khoá; INT_002 đạt `perWorkspaceMax`; RATE_002 quá `connectPerHour`.
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/workspaces/:workspaceId/integrations/:provider/connect",
  ...A,
  validateParams(workspaceProviderParamsSchema),
  requireWorkspaceRole("ADMIN"),
  connectLimit,
  validateBody(connectSchema),
  ctl.connect
);

/**
 * @openapi
 * /me/integrations:
 *   get:
 *     summary: Kết nối cá nhân của tôi (Google Calendar) — không có token
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/integrations", ...A, me.list);

/**
 * @openapi
 * /me/integrations/google-calendar/connect:
 *   post:
 *     summary: Nối Google Calendar của tôi (OAuth2 + PKCE) → `{ authorizeUrl }`; cuộc họp tôi tham dự được đẩy MỘT CHIỀU lên lịch Google
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/me/integrations/google-calendar/connect", ...A, connectLimit, validateBody(connectSchema), me.connectCalendar);

/**
 * @openapi
 * /me/integrations/{id}:
 *   delete:
 *     summary: Ngắt Google Calendar (chủ tài khoản) — ngừng đồng bộ ngay; job dọn sự kiện tương lai + thu hồi token. 204
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.delete("/me/integrations/:id", ...A, validateParams(idParamSchema), me.disconnect);

/**
 * @openapi
 * /integrations/{id}:
 *   get:
 *     summary: Chi tiết kết nối (OWNER/ADMIN nhóm sở hữu)
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 *   patch:
 *     summary: Đổi repo theo dõi / loại sự kiện / nơi nhận (`expectedVersion`)
 *     description: INT_005 đích không hợp lệ hoặc người sửa không có quyền GHI kênh (kênh riêng tư cần grant); INT_009 loại sự kiện không hỗ trợ; RES_003 lệch version; INT_010 kết nối đã thu hồi.
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 *   delete:
 *     summary: Ngắt kết nối — gỡ hook/thu hồi token phía nhà cung cấp (best-effort) + audit. 204
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/integrations/:id", ...A, validateParams(idParamSchema), ctl.get);
router.patch("/integrations/:id", ...A, validateParams(idParamSchema), validateBody(updateIntegrationSchema), ctl.update);
router.delete("/integrations/:id", ...A, validateParams(idParamSchema), ctl.disconnect);

/**
 * @openapi
 * /integrations/{id}/resources:
 *   get:
 *     summary: "Repo (GitHub) / project (GitLab) để chọn theo dõi — `{ items: [{ id, fullName }], hasMore }`. Alias cũ `/integrations/{id}/github/repos`"
 *     description: INT_004 nhà cung cấp lỗi (502); INT_010 token bị thu hồi.
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/integrations/:id/resources", ...A, validateParams(idParamSchema), validateQuery(resourcesQuerySchema), ctl.resources);
router.get("/integrations/:id/github/repos", ...A, validateParams(idParamSchema), validateQuery(resourcesQuerySchema), ctl.resources);

/**
 * @openapi
 * /integrations/{id}/events:
 *   get:
 *     summary: Log sự kiện webhook của kết nối (cursor) — summary/status/error, KHÔNG có payload
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/integrations/:id/events", ...A, validateParams(idParamSchema), validateQuery(eventsQuerySchema), ctl.events);

/**
 * @openapi
 * /integrations/{id}/events/{eventId}/replay:
 *   post:
 *     summary: Phát lại một sự kiện (tạo WebhookEvent mới `replayOf`, đăng tin MỚI). 202
 *     description: INT_006 quá thời gian lưu payload (410); RATE_002 quá `replayPerHour` của kết nối.
 *     tags: [Integrations]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/integrations/:id/events/:eventId/replay", ...A, validateParams(integrationEventParamsSchema), replayLimit, ctl.replay);

export default router;
