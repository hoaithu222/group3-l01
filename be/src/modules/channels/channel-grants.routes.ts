import { Router } from "express";
import { authenticateToken, apiLimiter, validateBody, validateParams, requireFeature } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { requireChannelAccess } from "../../core/permission";
import { PrismaChannelRepository, PrismaChannelMembershipRepository, PrismaChannelGrantRepository } from "./repositories";
import { ChannelGrantService } from "./services/channel-grant.service";
import { ChannelRoleGrantService } from "./services/channel-role-grant.service";
import { PrismaChannelRoleAudience } from "./services/channel-role-audience";
import { createChannelGrantController } from "./controllers/channel-grant.controller";
import { addGrantsSchema, patchGrantSchema, roleGrantSchema, roleRefParamSchema, memberAccessParamSchema } from "./dtos";

const router = Router();

// ── DI wiring — dùng lại repo (không tạo resolver lần 2, đã đăng ký ở
// `channels.routes.ts` lúc import router đó cùng phiên khởi động). ──────────
const channelRepo = new PrismaChannelRepository();
const membershipRepo = new PrismaChannelMembershipRepository();
const grantRepo = new PrismaChannelGrantRepository();
const roleAudience = new PrismaChannelRoleAudience();
const grantService = new ChannelGrantService(channelRepo, membershipRepo, grantRepo, roleAudience);
const roleGrantService = new ChannelRoleGrantService(channelRepo, grantRepo, roleAudience);
const controller = createChannelGrantController(grantService, roleGrantService);

router.use(authenticateToken);
router.use(requireFeature(MODULES.COMMUNICATION));
router.use(apiLimiter);

/**
 * @openapi
 * /channels/{channelId}/grants:
 *   get:
 *     summary: Danh sách quyền truy cập kênh riêng tư (quản lý kênh)
 *     tags: [Channel Grants]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/:channelId/grants", requireChannelAccess("manage"), controller.list);

/**
 * @openapi
 * /channels/{channelId}/grants:
 *   post:
 *     summary: Thêm người vào kênh riêng tư (idempotent)
 *     tags: [Channel Grants]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/:channelId/grants", requireChannelAccess("manage"), validateBody(addGrantsSchema), controller.add);

/**
 * @openapi
 * /channels/{channelId}/grants/roles:
 *   post:
 *     summary: Cấp quyền kênh riêng tư cho cả một vai trò (ADMIN = OWNER+ADMIN, MEMBER = OWNER+ADMIN+MEMBER; idempotent; quản lý kênh)
 *     tags: [Channel Grants]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/:channelId/grants/roles", requireChannelAccess("manage"), validateBody(roleGrantSchema), controller.addRole);

/**
 * @openapi
 * /channels/{channelId}/grants/roles/{roleRef}:
 *   delete:
 *     summary: Gỡ quyền kênh theo vai trò (người mất quyền bị thu hồi phạm vi; quản lý kênh)
 *     tags: [Channel Grants]
 *     security: [{ BearerAuth: [] }]
 */
router.delete(
  "/:channelId/grants/roles/:roleRef",
  requireChannelAccess("manage"),
  validateParams(roleRefParamSchema),
  controller.removeRole
);

/**
 * @openapi
 * /channels/{channelId}/members/{userId}/access:
 *   get:
 *     summary: Quyền đọc/ghi/quản lý THẬT của một người với kênh riêng tư + nguồn hiệu lực (DIRECT | ROLE:ADMIN | ROLE:MEMBER)
 *     tags: [Channel Grants]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:channelId/members/:userId/access",
  requireChannelAccess("manage"),
  validateParams(memberAccessParamSchema),
  controller.access
);

/**
 * @openapi
 * /channels/{channelId}/grants/{userId}:
 *   patch:
 *     summary: Đổi bậc quyền (MEMBER/MANAGER)
 *     tags: [Channel Grants]
 *     security: [{ BearerAuth: [] }]
 */
router.patch("/:channelId/grants/:userId", requireChannelAccess("manage"), validateBody(patchGrantSchema), controller.patch);

/**
 * @openapi
 * /channels/{channelId}/grants/{userId}:
 *   delete:
 *     summary: Thu hồi quyền truy cập (quản lý kênh HOẶC chính chủ)
 *     tags: [Channel Grants]
 *     security: [{ BearerAuth: [] }]
 */
router.delete("/:channelId/grants/:userId", requireChannelAccess("read"), controller.remove);

export default router;
