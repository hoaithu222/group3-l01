import { Router } from "express";
import {
  authenticateToken,
  optionalAuth,
  apiLimiter,
  validateBody,
  validateQuery,
  validateParams,
  scopeLimiter,
  idempotencyKey,
  requireFeature,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { requireWorkspaceRole } from "../../core/permission";
import { getAccessContainer } from "./access.container";
import { createInvitationController } from "./controllers/invitation.controller";
import {
  inviteGuestSchema,
  inviteMembersSchema,
  listInvitationsQuerySchema,
  invitationTokenParamSchema,
  invitationIdParamSchema,
} from "./dtos";

const router = Router();

const { invitationCreate, invitationAccept } = getAccessContainer();
const controller = createInvitationController(invitationCreate, invitationAccept);

router.use(requireFeature(MODULES.COMMUNICATION));

/**
 * @openapi
 * /workspaces/{workspaceId}/guests/invitations:
 *   post:
 *     summary: Mời KHÁCH theo email (OWNER/ADMIN) — kênh chỉ định, số ngày, lời nhắn; không trả token
 *     tags: [Invitations]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/workspaces/:workspaceId/guests/invitations",
  authenticateToken,
  apiLimiter,
  requireWorkspaceRole("ADMIN"),
  idempotencyKey("guest-invite"),
  validateBody(inviteGuestSchema),
  controller.inviteGuest
);

/**
 * @openapi
 * /workspaces/{workspaceId}/invitations:
 *   post:
 *     summary: Mời THÀNH VIÊN theo email (OWNER/ADMIN; MEMBER khi guestPolicy.memberCanInvite) — tối đa 20 email/lần
 *     tags: [Invitations]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/workspaces/:workspaceId/invitations",
  authenticateToken,
  apiLimiter,
  requireWorkspaceRole("MEMBER"),
  idempotencyKey("member-invite"),
  validateBody(inviteMembersSchema),
  controller.inviteMembers
);

/**
 * @openapi
 * /workspaces/{workspaceId}/invitations:
 *   get:
 *     summary: Danh sách lời mời email của nhóm (OWNER/ADMIN, cursor) — email đầy đủ, không token
 *     tags: [Invitations]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/workspaces/:workspaceId/invitations",
  authenticateToken,
  apiLimiter,
  requireWorkspaceRole("ADMIN"),
  validateQuery(listInvitationsQuerySchema),
  controller.list
);

/**
 * @openapi
 * /invitations/{invitationId}/revoke:
 *   post:
 *     summary: Thu hồi lời mời (OWNER/ADMIN hoặc người mời) — 409 khi không còn PENDING
 *     tags: [Invitations]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/invitations/:invitationId/revoke",
  authenticateToken,
  apiLimiter,
  validateParams(invitationIdParamSchema),
  controller.revoke
);

/**
 * @openapi
 * /invitations/{invitationId}/resend:
 *   post:
 *     summary: Gửi lại lời mời (hạn +7 ngày, token mới, cooldown 12 giờ → RATE_003)
 *     tags: [Invitations]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/invitations/:invitationId/resend",
  authenticateToken,
  apiLimiter,
  validateParams(invitationIdParamSchema),
  controller.resend
);

/**
 * @openapi
 * /invitations/by-token/{token}:
 *   get:
 *     summary: Xem trước lời mời email (optionalAuth) — 410 INV_010 khi hết hạn/thu hồi/đã dùng
 *     tags: [Invitations]
 */
router.get(
  "/invitations/by-token/:token",
  optionalAuth,
  scopeLimiter("invitation-preview", (req) => req.ip ?? null, [{ max: LIMITS.invite.previewRatePerMinute, windowSeconds: 60 }]),
  validateParams(invitationTokenParamSchema),
  controller.preview
);

/**
 * @openapi
 * /invitations/by-token/{token}/accept:
 *   post:
 *     summary: Chấp nhận lời mời email — cần tài khoản có email đã xác minh khớp (INV_008)
 *     tags: [Invitations]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/invitations/by-token/:token/accept",
  authenticateToken,
  scopeLimiter("invitation-accept", (req) => req.user?.id ?? null, [{ max: LIMITS.invite.acceptRatePerHour, windowSeconds: 3600 }]),
  validateParams(invitationTokenParamSchema),
  controller.acceptByToken
);

/**
 * @openapi
 * /me/invitations:
 *   get:
 *     summary: Lời mời PENDING khớp email đã xác minh của tôi
 *     tags: [Invitations]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/invitations", authenticateToken, apiLimiter, controller.mine);

/**
 * @openapi
 * /me/invitations/{invitationId}/accept:
 *   post:
 *     summary: Chấp nhận lời mời trong danh sách của tôi (không cần token — danh tính chứng minh bằng email đã xác minh)
 *     tags: [Invitations]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/me/invitations/:invitationId/accept",
  authenticateToken,
  scopeLimiter("invitation-accept", (req) => req.user?.id ?? null, [{ max: LIMITS.invite.acceptRatePerHour, windowSeconds: 3600 }]),
  validateParams(invitationIdParamSchema),
  controller.acceptMine
);

export default router;
