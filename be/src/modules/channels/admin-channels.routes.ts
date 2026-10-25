import { Router } from "express";
import { authenticateToken, requirePermission, requireFeature, validateBody, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { PrismaChannelRepository, PrismaChannelMembershipRepository, PrismaChannelGrantRepository } from "./repositories";
import { ChannelLifecycleService } from "./services/channel-lifecycle.service";
import { createAdminChannelController } from "./controllers/admin-channel.controller";
import { adminChannelArchiveSchema, adminListChannelsQuerySchema } from "./dtos";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const channelRepo = new PrismaChannelRepository();
const membershipRepo = new PrismaChannelMembershipRepository();
const grantRepo = new PrismaChannelGrantRepository();
const lifecycleService = new ChannelLifecycleService(channelRepo, membershipRepo, grantRepo);
const controller = createAdminChannelController(channelRepo, lifecycleService);

router.use(requireFeature(MODULES.COMMUNICATION));

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/channels:
 *   get:
 *     summary: Danh bạ kênh công khai trong nhóm (admin)
 *     description: |
 *       Query `page`/`limit` + lọc phía server tuỳ chọn `status` (ACTIVE|ARCHIVED) và `type` (TEXT|VOICE|POMODORO); `meta.total`
 *       đếm theo bộ lọc. `privateCount`/`privateArchivedCount` KHÔNG bị lọc (chỉ số tổng của nhóm).
 *     tags: [Admin/Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/admin/workspaces/:workspaceId/channels",
  authenticateToken,
  requirePermission("workspace:view"),
  validateQuery(adminListChannelsQuerySchema),
  controller.list
);

/**
 * @openapi
 * /admin/channels/{channelId}/archive:
 *   post:
 *     summary: Lưu trữ kênh cấp nền tảng (chỉ kênh công khai, bắt buộc lý do)
 *     tags: [Admin/Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/admin/channels/:channelId/archive",
  authenticateToken,
  requirePermission("moderation:update"),
  validateBody(adminChannelArchiveSchema),
  controller.archive
);

/**
 * @openapi
 * /admin/channels/{channelId}/restore:
 *   post:
 *     summary: Khôi phục kênh cấp nền tảng (chỉ kênh công khai, bắt buộc lý do)
 *     tags: [Admin/Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/admin/channels/:channelId/restore",
  authenticateToken,
  requirePermission("moderation:update"),
  validateBody(adminChannelArchiveSchema),
  controller.restore
);

export default router;
