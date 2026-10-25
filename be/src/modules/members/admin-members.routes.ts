import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requirePermission, requireFeature, validateBody, validateQuery, validateParams } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { objectIdSchema } from "../../shared/dto/common-schemas";
import { PrismaMembershipRepository, PrismaInvitationRepository } from "./repositories";
import { PrismaAccessSummaryRepository } from "./repositories/access-summary.repository.prisma";
import { RuntimeGuestConfig } from "./services/guest-config";
import { AdminAccessService } from "./services/admin-access.service";
import { createAdminAccessController } from "./controllers/admin-access.controller";
import { MembershipLifecycleService } from "./services/membership-lifecycle.service";
import { createAdminMemberController } from "./controllers/admin-member.controller";
import { adminListMembersQuerySchema, adminRevokeMemberSchema, adminListInvitationsQuerySchema } from "./dtos";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const repo = new PrismaMembershipRepository();
const lifecycleService = new MembershipLifecycleService(repo);
const controller = createAdminMemberController(repo, lifecycleService);
const accessController = createAdminAccessController(
  new AdminAccessService(new PrismaInvitationRepository(), new PrismaAccessSummaryRepository(), new RuntimeGuestConfig())
);

const revokeParamsSchema = z.object({ workspaceId: objectIdSchema, userId: objectIdSchema });

router.use(authenticateToken);
router.use(requireFeature(MODULES.COMMUNICATION));

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/members:
 *   get:
 *     summary: Danh sách thành viên (admin) — email chỉ khi có quyền user:view
 *     tags: [Admin/Members]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:workspaceId/members",
  requirePermission("workspace:view"),
  validateQuery(adminListMembersQuerySchema),
  controller.list
);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/access-summary:
 *   get:
 *     summary: Chính sách tham gia/khách + số đếm thành viên ACTIVE/bị chặn, link mời đang hoạt động, chờ duyệt, khách sắp hết hạn, kênh riêng (chỉ SỐ LƯỢNG, không token/tên) — chỉ đọc
 *     tags: [Admin/Members]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/:workspaceId/access-summary", requirePermission("workspace:view"), accessController.summary);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/invitations:
 *   get:
 *     summary: Lời mời email của nhóm (admin) — email CHE ở server, không token, không lời nhắn; chỉ đọc
 *     tags: [Admin/Members]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:workspaceId/invitations",
  requirePermission("workspace:view"),
  validateQuery(adminListInvitationsQuerySchema),
  accessController.invitations
);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/members/{userId}/revoke:
 *   post:
 *     summary: Loại/chặn thành viên cấp nền tảng (không áp dụng cho OWNER)
 *     tags: [Admin/Members]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:workspaceId/members/:userId/revoke",
  requirePermission("workspace:update"),
  validateParams(revokeParamsSchema),
  validateBody(adminRevokeMemberSchema),
  controller.revoke
);

export default router;
