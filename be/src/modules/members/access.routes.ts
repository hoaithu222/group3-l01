import { Router } from "express";
import { z } from "zod";
import {
  authenticateToken,
  apiLimiter,
  validateBody,
  validateQuery,
  validateParams,
  requireFeature,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { requireWorkspaceRole } from "../../core/permission";
import { objectIdSchema } from "../../shared/dto/common-schemas";
import { getAccessContainer } from "./access.container";
import { createGuestController } from "./controllers/guest.controller";
import { createJoinRequestController } from "./controllers/join-request.controller";
import { updateGuestSchema, joinRequestDecisionSchema, listJoinRequestsQuerySchema, workspaceIdParamSchema } from "./dtos";

const router = Router();

const { guests, memberQuery, joinRequests } = getAccessContainer();
const guestController = createGuestController(guests, memberQuery);
const joinRequestController = createJoinRequestController(joinRequests);

const memberParamsSchema = z.object({ workspaceId: objectIdSchema, userId: objectIdSchema });

router.use(requireFeature(MODULES.COMMUNICATION));

/**
 * @openapi
 * /workspaces/{workspaceId}/members/{userId}/guest:
 *   patch:
 *     summary: Gia hạn/rút ngắn hạn và/hoặc đổi kênh chỉ định của KHÁCH (OWNER/ADMIN, expectedVersion = version của thẻ)
 *     tags: [Guests]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  "/workspaces/:workspaceId/members/:userId/guest",
  authenticateToken,
  apiLimiter,
  requireWorkspaceRole("ADMIN"),
  validateParams(memberParamsSchema),
  validateBody(updateGuestSchema),
  guestController.update
);

/**
 * @openapi
 * /workspaces/{workspaceId}/join-requests:
 *   get:
 *     summary: Yêu cầu tham gia đang chờ duyệt (OWNER/ADMIN, cursor)
 *     tags: [JoinRequests]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/workspaces/:workspaceId/join-requests",
  authenticateToken,
  apiLimiter,
  requireWorkspaceRole("ADMIN"),
  validateQuery(listJoinRequestsQuerySchema),
  joinRequestController.list
);

/**
 * @openapi
 * /workspaces/{workspaceId}/join-requests/{userId}/approve:
 *   post:
 *     summary: Duyệt yêu cầu tham gia (OWNER/ADMIN) — 409 khi không còn PENDING
 *     tags: [JoinRequests]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/workspaces/:workspaceId/join-requests/:userId/approve",
  authenticateToken,
  apiLimiter,
  requireWorkspaceRole("ADMIN"),
  validateParams(memberParamsSchema),
  validateBody(joinRequestDecisionSchema),
  joinRequestController.approve
);

/**
 * @openapi
 * /workspaces/{workspaceId}/join-requests/{userId}/reject:
 *   post:
 *     summary: Từ chối yêu cầu tham gia (OWNER/ADMIN) — người bị từ chối xin lại được sau 24 giờ (WS_019)
 *     tags: [JoinRequests]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/workspaces/:workspaceId/join-requests/:userId/reject",
  authenticateToken,
  apiLimiter,
  requireWorkspaceRole("ADMIN"),
  validateParams(memberParamsSchema),
  validateBody(joinRequestDecisionSchema),
  joinRequestController.reject
);

/**
 * @openapi
 * /workspaces/{workspaceId}/join-request/cancel:
 *   post:
 *     summary: Huỷ yêu cầu tham gia của chính mình (204) — người đang chờ CHƯA là thành viên nên không qua requireWorkspaceRole
 *     tags: [JoinRequests]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/workspaces/:workspaceId/join-request/cancel",
  authenticateToken,
  apiLimiter,
  validateParams(workspaceIdParamSchema),
  joinRequestController.cancel
);

export default router;
