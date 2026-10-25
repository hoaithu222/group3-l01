import { Router } from "express";
import { z } from "zod";
import { authenticateToken, apiLimiter, validateBody, validateQuery, validateParams, requireFeature, scopeLimiter } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { requireWorkspaceRole } from "../../core/permission";
import { objectIdSchema } from "../../shared/dto/common-schemas";
import { createMemberContactPort } from "../conversations/public";
import { PrismaMembershipRepository } from "./repositories";
import { MemberQueryService } from "./services/member-query.service";
import { MembershipLifecycleService } from "./services/membership-lifecycle.service";
import { getAccessContainer } from "./access.container";
import { createMemberController } from "./controllers/member.controller";
import { createMemberAddController } from "./controllers/member-add.controller";
import { listMembersQuerySchema, patchMemberSchema, moderateMemberSchema, memberLookupQuerySchema, addMemberSchema } from "./dtos";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const repo = new PrismaMembershipRepository();
const queryService = new MemberQueryService(repo, createMemberContactPort());
const lifecycleService = new MembershipLifecycleService(repo);
const controller = createMemberController(queryService, lifecycleService);
const addController = createMemberAddController(getAccessContainer().memberAdd);

// Tra người theo email/SĐT là bề mặt DÒ DANH BẠ: chặn theo NGƯỜI DÙNG (không theo IP) — vài chục lượt/10 phút và trần theo ngày.
const lookupLimiter = scopeLimiter("member-lookup", (req) => req.user?.id ?? null, [
  { max: 30, windowSeconds: 600 },
  { max: 200, windowSeconds: 86_400 },
]);
const addLimiter = scopeLimiter("member-add", (req) => req.user?.id ?? null, [{ max: 60, windowSeconds: 3600 }]);

const memberParamsSchema = z.object({ workspaceId: objectIdSchema, userId: objectIdSchema });

router.use(authenticateToken);
router.use(requireFeature(MODULES.COMMUNICATION));
router.use(apiLimiter);

/**
 * @openapi
 * /workspaces/{workspaceId}/members:
 *   get:
 *     summary: Danh sách thành viên (kèm hiện diện)
 *     tags: [Members]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:workspaceId/members",
  requireWorkspaceRole("MEMBER"),
  validateQuery(listMembersQuerySchema),
  controller.list
);

/**
 * @openapi
 * /workspaces/{workspaceId}/member-lookup:
 *   get:
 *     summary: Tra người theo email đầy đủ hoặc số điện thoại (OWNER/ADMIN) — khớp chính xác, tôn trọng riêng tư, chỉ trả gợi ý che
 *     tags: [Members]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:workspaceId/member-lookup",
  requireWorkspaceRole("ADMIN"),
  lookupLimiter,
  validateQuery(memberLookupQuerySchema),
  addController.lookup
);

/**
 * @openapi
 * /workspaces/{workspaceId}/members:
 *   post:
 *     summary: Thêm THẲNG một người dùng làm thành viên (OWNER/ADMIN) — idempotent (đã là thành viên → 200 ALREADY_MEMBER)
 *     tags: [Members]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/:workspaceId/members", requireWorkspaceRole("ADMIN"), addLimiter, validateBody(addMemberSchema), addController.add);

/**
 * @openapi
 * /workspaces/{workspaceId}/members/{userId}:
 *   get:
 *     summary: Thẻ thành viên (kèm hành động khả dụng)
 *     tags: [Members]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:workspaceId/members/:userId",
  requireWorkspaceRole("MEMBER"),
  validateParams(memberParamsSchema),
  controller.getCard
);

/**
 * @openapi
 * /workspaces/{workspaceId}/members/{userId}:
 *   patch:
 *     summary: Đổi vai trò (OWNER) và/hoặc biệt danh (chính chủ hoặc bậc cao hơn)
 *     tags: [Members]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  "/:workspaceId/members/:userId",
  requireWorkspaceRole("MEMBER"),
  validateParams(memberParamsSchema),
  validateBody(patchMemberSchema),
  controller.patch
);

/**
 * @openapi
 * /workspaces/{workspaceId}/members/{userId}/remove:
 *   post:
 *     summary: Loại thành viên (ADMIN — bậc cao hơn target)
 *     tags: [Members]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:workspaceId/members/:userId/remove",
  requireWorkspaceRole("ADMIN"),
  validateParams(memberParamsSchema),
  validateBody(moderateMemberSchema),
  controller.remove
);

/**
 * @openapi
 * /workspaces/{workspaceId}/members/{userId}/ban:
 *   post:
 *     summary: Chặn thành viên (ADMIN — bậc cao hơn target)
 *     tags: [Members]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:workspaceId/members/:userId/ban",
  requireWorkspaceRole("ADMIN"),
  validateParams(memberParamsSchema),
  validateBody(moderateMemberSchema),
  controller.ban
);

/**
 * @openapi
 * /workspaces/{workspaceId}/members/{userId}/unban:
 *   post:
 *     summary: Bỏ chặn thành viên (ADMIN)
 *     tags: [Members]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:workspaceId/members/:userId/unban",
  requireWorkspaceRole("ADMIN"),
  validateParams(memberParamsSchema),
  validateBody(moderateMemberSchema),
  controller.unban
);

export default router;
