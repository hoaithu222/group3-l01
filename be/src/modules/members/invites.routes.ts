import { Router } from "express";
import { authenticateToken, optionalAuth, apiLimiter, validateBody, validateQuery, validateParams, scopeLimiter, requireFeature } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { requireWorkspaceRole } from "../../core/permission";
import { LIMITS } from "../../core/constants/limits";
import { cursorQuerySchema } from "../../shared/dto/common-schemas";
import { createChannelBootstrap } from "../channels";
import { PrismaMembershipRepository, PrismaInviteLinkRepository, PrismaInvitationRepository } from "./repositories";
import { InviteService } from "./services/invite.service";
import { JoinRequestService } from "./services/join-request.service";
import { createInviteController } from "./controllers/invite.controller";
import { acceptInviteSchema, createInviteSchema, inviteTokenParamSchema } from "./dtos";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const membershipRepo = new PrismaMembershipRepository();
const inviteRepo = new PrismaInviteLinkRepository();
const channelBootstrap = createChannelBootstrap();
// p3-04 — `joinPolicy=APPROVAL`: link mời chỉ tạo yêu cầu chờ duyệt (`JoinRequestService.requestFromLink`).
const joinRequests = new JoinRequestService(membershipRepo, new PrismaInvitationRepository(), channelBootstrap);
const inviteService = new InviteService(inviteRepo, membershipRepo, channelBootstrap, joinRequests);
const controller = createInviteController(inviteService);

router.use(requireFeature(MODULES.COMMUNICATION));

/**
 * @openapi
 * /workspaces/{workspaceId}/invites:
 *   post:
 *     summary: Tạo lời mời (ADMIN) — `url` chỉ trả về ở đây, không lưu lại
 *     tags: [Invites]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/workspaces/:workspaceId/invites",
  authenticateToken,
  apiLimiter,
  requireWorkspaceRole("ADMIN"),
  scopeLimiter("invite-create", (req) => req.user?.id ?? null, [{ max: 50, windowSeconds: 3600 }]),
  validateBody(createInviteSchema),
  controller.create
);

/**
 * @openapi
 * /workspaces/{workspaceId}/invites:
 *   get:
 *     summary: Danh sách lời mời đang quản lý (ADMIN)
 *     tags: [Invites]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/workspaces/:workspaceId/invites",
  authenticateToken,
  apiLimiter,
  requireWorkspaceRole("ADMIN"),
  validateQuery(cursorQuerySchema),
  controller.list
);

/**
 * @openapi
 * /workspaces/{workspaceId}/invites/{inviteId}:
 *   delete:
 *     summary: Thu hồi lời mời (ADMIN, idempotent)
 *     tags: [Invites]
 *     security: [{ BearerAuth: [] }]
 */
router.delete(
  "/workspaces/:workspaceId/invites/:inviteId",
  authenticateToken,
  apiLimiter,
  requireWorkspaceRole("ADMIN"),
  controller.revoke
);

/**
 * @openapi
 * /invites/{token}:
 *   get:
 *     summary: "Xem trước lời mời (công khai, trung tính khi hết hiệu lực) — kèm requiresApproval (nhóm bật duyệt tham gia)"
 *     tags: [Invites]
 */
router.get(
  "/invites/:token",
  optionalAuth,
  scopeLimiter("invite-preview", (req) => req.ip ?? null, [{ max: LIMITS.invite.previewRatePerMinute, windowSeconds: 60 }]),
  validateParams(inviteTokenParamSchema),
  controller.preview
);

/**
 * @openapi
 * /invites/{token}/accept:
 *   post:
 *     summary: Chấp nhận lời mời, tham gia nhóm (nhóm bật duyệt → 202 yêu cầu chờ, kèm lời nhắn tuỳ chọn)
 *     tags: [Invites]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requestMessage: { type: string, maxLength: 500, description: "Lời nhắn xin vào nhóm — chỉ lưu khi nhóm bật duyệt (joinPolicy=APPROVAL); rỗng = không gửi" }
 */
router.post(
  "/invites/:token/accept",
  authenticateToken,
  scopeLimiter("invite-accept", (req) => req.user?.id ?? null, [{ max: LIMITS.invite.acceptRatePerHour, windowSeconds: 3600 }]),
  validateParams(inviteTokenParamSchema),
  validateBody(acceptInviteSchema),
  controller.accept
);

export default router;
