import { Router } from "express";
import {
  authenticateToken,
  apiLimiter,
  validateBody,
  validateQuery,
  idempotencyKey,
  requireFeature,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { requireWorkspaceRole, requireChannelAccess } from "../../core/permission";
import { PrismaChannelRepository, PrismaChannelMembershipRepository, PrismaChannelGrantRepository } from "./repositories";
import { ChannelService } from "./services/channel.service";
import { ChannelLifecycleService } from "./services/channel-lifecycle.service";
import { ChannelGrantService } from "./services/channel-grant.service";
import { PrismaChannelRoleAudience } from "./services/channel-role-audience";
import { registerChannelPermissionResolver } from "./services/channel-permission.resolver";
import { createChannelController } from "./controllers/channel.controller";
import {
  createChannelSchema,
  updateChannelSchema,
  archiveChannelSchema,
  restoreChannelSchema,
  channelMeSchema,
  listChannelsQuerySchema,
  listChannelMembersQuerySchema,
  searchChannelNamesQuerySchema,
} from "./dtos";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const channelRepo = new PrismaChannelRepository();
const membershipRepo = new PrismaChannelMembershipRepository();
const grantRepo = new PrismaChannelGrantRepository();
const roleAudience = new PrismaChannelRoleAudience();
const channelService = new ChannelService(channelRepo, membershipRepo, grantRepo, roleAudience);
const lifecycleService = new ChannelLifecycleService(channelRepo, membershipRepo, grantRepo);
const grantService = new ChannelGrantService(channelRepo, membershipRepo, grantRepo, roleAudience);
const controller = createChannelController(channelService, lifecycleService, grantService);

// Đăng ký resolver CHANNEL cho PermissionService (be.md §5.5) — side-effect
// lúc import, PHẢI chạy trước khi bất kỳ route/room-guard nào dùng scope này
// (giống `registerWorkspacePermissionResolver`).
registerChannelPermissionResolver(channelRepo, grantRepo);

/**
 * @openapi
 * /workspaces/{workspaceId}/channels:
 *   get:
 *     summary: Danh sách kênh đã tham gia + có thể khám phá
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/workspaces/:workspaceId/channels",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  // p3-04: KHÁCH liệt kê/tìm được — service chỉ trả kênh CHỈ ĐỊNH (grant DIRECT) cho họ.
  requireWorkspaceRole("GUEST"),
  validateQuery(listChannelsQuerySchema),
  controller.list
);

/**
 * @openapi
 * /workspaces/{workspaceId}/channels:
 *   post:
 *     summary: Tạo kênh (ADMIN)
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/workspaces/:workspaceId/channels",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  requireWorkspaceRole("ADMIN"),
  idempotencyKey("channel-create"),
  validateBody(createChannelSchema),
  controller.create
);

/**
 * @openapi
 * /workspaces/{workspaceId}/channels/search:
 *   get:
 *     summary: Tìm kênh theo tên (chỉ kênh nhìn thấy được)
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/workspaces/:workspaceId/channels/search",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  requireWorkspaceRole("GUEST"),
  validateQuery(searchChannelNamesQuerySchema),
  controller.search
);

/**
 * @openapi
 * /channels/{channelId}:
 *   get:
 *     summary: Chi tiết kênh
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/channels/:channelId",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  requireChannelAccess("read"),
  controller.get
);

/**
 * @openapi
 * /channels/{channelId}:
 *   patch:
 *     summary: Sửa tên/mô tả/chế độ đăng (quản lý kênh)
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  "/channels/:channelId",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  requireChannelAccess("manage"),
  validateBody(updateChannelSchema),
  controller.patch
);

/**
 * @openapi
 * /channels/{channelId}/archive:
 *   post:
 *     summary: Lưu trữ kênh (quản lý kênh)
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/channels/:channelId/archive",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  requireChannelAccess("manage"),
  validateBody(archiveChannelSchema),
  controller.archive
);

/**
 * @openapi
 * /channels/{channelId}/restore:
 *   post:
 *     summary: Khôi phục kênh đã lưu trữ (quản lý kênh — chỉ lưu trữ MANUAL)
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/channels/:channelId/restore",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  // be.md §4 "allowArchived" — đã có sẵn trong resolver (`read` luôn ALLOW dù
  // ARCHIVED), KHÔNG phải tham số thứ 2 của `requireChannelAccess` (không tồn
  // tại) — mục 1 critical facts.
  requireChannelAccess("manage"),
  validateBody(restoreChannelSchema),
  controller.restore
);

/**
 * @openapi
 * /channels/{channelId}/join:
 *   post:
 *     summary: Tham gia kênh công khai
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/channels/:channelId/join",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  requireChannelAccess("read"),
  controller.join
);

/**
 * @openapi
 * /channels/{channelId}/leave:
 *   post:
 *     summary: Rời kênh (không áp dụng kênh mặc định)
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/channels/:channelId/leave",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  requireChannelAccess("read"),
  controller.leave
);

/**
 * @openapi
 * /channels/{channelId}/me:
 *   patch:
 *     summary: Thiết lập cá nhân (ghim/thứ tự/thông báo) — cho phép cả khi ARCHIVED
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  "/channels/:channelId/me",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  requireChannelAccess("read"),
  validateBody(channelMeSchema),
  controller.updateMe
);

/**
 * @openapi
 * /channels/{channelId}/members:
 *   get:
 *     summary: Danh sách thành viên kênh (kèm hiện diện)
 *     tags: [Channels]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/channels/:channelId/members",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  apiLimiter,
  requireChannelAccess("read"),
  validateQuery(listChannelMembersQuerySchema),
  controller.members
);

export default router;
