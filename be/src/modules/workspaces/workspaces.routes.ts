import { Router } from "express";
import {
  authenticateToken,
  apiLimiter,
  validateBody,
  validateQuery,
  idempotencyKey,
  scopeLimiter,
  requireFeature,
} from "../../core/middlewares";
import { MODULES, SUB_FEATURES } from "../../core/constants/modules";
import { runtimeConfig } from "../../core/config/runtime-config";
import { FeatureDisabledError } from "../../core/exceptions";
import { requireWorkspaceRole } from "../../core/permission";
import { ROOM } from "../../infrastructure/socket";
import { registerPresenceJoinRooms, registerPresenceAudience } from "../presence/presence.service";
import { createAssetLinkService } from "../assets/public";
import { createChannelBootstrap } from "../channels";
import { createWorkspaceTemplatePort } from "../workspace-templates";
import { createMembershipLifecyclePort } from "../members/public";
import { PrismaWorkspaceRepository } from "./repositories";
import { WorkspaceService } from "./services/workspace.service";
import { WorkspaceLifecycleService } from "./services/workspace-lifecycle.service";
import { WorkspaceOverviewService } from "./services/workspace-overview.service";
import { registerWorkspacePermissionResolver } from "./services/workspace-permission.resolver";
import { createWorkspaceController } from "./controllers/workspace.controller";
import {
  workspaceSettingsSchema,
  createWorkspaceSchema,
  updateWorkspaceSchema,
  archiveWorkspaceSchema,
  restoreWorkspaceSchema,
  transferOwnerSchema,
  workspaceMeSchema,
  listWorkspacesQuerySchema,
} from "./dtos";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const repo = new PrismaWorkspaceRepository();
const channelBootstrap = createChannelBootstrap();
const assetLinks = createAssetLinkService();
const workspaceService = new WorkspaceService(repo, channelBootstrap, assetLinks, undefined, createWorkspaceTemplatePort());
const lifecycleService = new WorkspaceLifecycleService(repo, createMembershipLifecyclePort());
const overviewService = new WorkspaceOverviewService(repo);
const controller = createWorkspaceController(workspaceService, lifecycleService, overviewService);

// Đăng ký resolver WORKSPACE cho PermissionService (be.md §5.8) — side-effect
// lúc import, PHẢI chạy trước khi bất kỳ route/room-guard nào dùng scope này.
registerWorkspacePermissionResolver(repo);

/** `ws:{id}` mọi workspace ACTIVE của user — tự join lúc connect (be.md §6) + audience phát presence. */
async function activeWorkspaceRooms(userId: string): Promise<string[]> {
  const rows = await repo.listForUser(userId, "ACTIVE");
  // p3-04 §5.6 — KHÁCH không vào `ws:{id}` (không nhận sự kiện workspace chung) và presence của họ không phát vào đó;
  // khách nhận `channel:*` qua `user:{id}` và `ch:{id}` của kênh chỉ định.
  return rows.filter((r) => r.membership.role !== "GUEST").map((r) => ROOM.workspace(r.workspace.id));
}
registerPresenceJoinRooms(activeWorkspaceRooms);
registerPresenceAudience(activeWorkspaceRooms);

router.use(authenticateToken);
router.use(requireFeature(MODULES.COMMUNICATION));
router.use(apiLimiter);

/**
 * @openapi
 * /workspaces:
 *   get:
 *     summary: Danh sách nhóm của tôi kèm unread/mention
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/", validateQuery(listWorkspacesQuerySchema), controller.list);

/**
 * @openapi
 * /workspaces:
 *   post:
 *     summary: Tạo nhóm (workspace + kênh mặc định "Chung" trong 1 transaction)
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/",
  idempotencyKey("ws-create", { required: true }),
  scopeLimiter("ws-create", (req) => req.user?.id ?? null, [{ max: 10, windowSeconds: 3600 }]),
  validateBody(createWorkspaceSchema),
  // p5-04: `templateCode` chỉ dùng được khi cờ phụ `workspaceTemplates` bật (404 `CFG_005` khi tắt) — tạo nhóm thường không bị ảnh hưởng.
  async (req, _res, next) => {
    const usesTemplate = typeof (req.body as { templateCode?: unknown })?.templateCode === "string";
    if (usesTemplate && !(await runtimeConfig.isSubFeatureEnabled(SUB_FEATURES.WORKSPACE_TEMPLATES))) return next(new FeatureDisabledError());
    next();
  },
  controller.create
);

/**
 * @openapi
 * /workspaces/{workspaceId}:
 *   get:
 *     summary: Chi tiết nhóm
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
// p3-04: KHÁCH đọc được chi tiết/tổng quan (tên, vai trò, hạn, chỉ kênh chỉ định — không `memberCount`, không chính sách nhóm).
router.get("/:workspaceId", requireWorkspaceRole("GUEST"), controller.get);

/**
 * @openapi
 * /workspaces/{workspaceId}/overview:
 *   get:
 *     summary: Trang tổng quan nhóm (kênh của bạn, cần phản hồi, nhóm chat gần đây, thành viên)
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/:workspaceId/overview", requireWorkspaceRole("GUEST"), controller.overview);

/**
 * @openapi
 * /workspaces/{workspaceId}:
 *   patch:
 *     summary: Sửa tên/mô tả/ảnh (expectedVersion)
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.patch("/:workspaceId", requireWorkspaceRole("ADMIN"), validateBody(updateWorkspaceSchema), controller.patch);

/**
 * @openapi
 * /workspaces/{workspaceId}/settings:
 *   patch:
 *     summary: Chính sách tham gia (joinPolicy OPEN|APPROVAL) và chính sách khách (guestPolicy) — OWNER, expectedVersion
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  "/:workspaceId/settings",
  requireWorkspaceRole("OWNER"),
  validateBody(workspaceSettingsSchema),
  controller.updateSettings
);

/**
 * @openapi
 * /workspaces/{workspaceId}/me:
 *   patch:
 *     summary: Thiết lập cá nhân (yêu thích, thứ tự, thông báo) — cho phép cả khi ARCHIVED
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.patch("/:workspaceId/me", requireWorkspaceRole("MEMBER"), validateBody(workspaceMeSchema), controller.updateMe);

/**
 * @openapi
 * /workspaces/{workspaceId}/archive:
 *   post:
 *     summary: Lưu trữ nhóm (OWNER)
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/:workspaceId/archive", requireWorkspaceRole("OWNER"), validateBody(archiveWorkspaceSchema), controller.archive);

/**
 * @openapi
 * /workspaces/{workspaceId}/restore:
 *   post:
 *     summary: Khôi phục nhóm đã lưu trữ (OWNER — không khôi phục được nếu bị lưu trữ cấp nền tảng)
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/:workspaceId/restore", requireWorkspaceRole("OWNER"), validateBody(restoreWorkspaceSchema), controller.restore);

/**
 * @openapi
 * /workspaces/{workspaceId}/transfer-owner:
 *   post:
 *     summary: Chuyển quyền sở hữu (xác nhận gõ lại tên người nhận)
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:workspaceId/transfer-owner",
  requireWorkspaceRole("OWNER"),
  validateBody(transferOwnerSchema),
  controller.transferOwner
);

/**
 * @openapi
 * /workspaces/{workspaceId}/leave:
 *   post:
 *     summary: Rời nhóm (OWNER phải chuyển quyền trước)
 *     tags: [Workspaces]
 *     security: [{ BearerAuth: [] }]
 */
// p3-04: khách cũng rời nhóm được (`myPermissions.canLeave` true với mọi vai trò trừ OWNER).
router.post("/:workspaceId/leave", requireWorkspaceRole("GUEST"), controller.leave);

export default router;
