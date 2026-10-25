import { Router } from "express";
import { authenticateToken, apiLimiter, validateQuery } from "../../core/middlewares";
import { createPresenceController } from "./presence.controller";
import { presenceQuerySchema } from "./presence.validators";

const router = Router();
const controller = createPresenceController();

/**
 * @openapi
 * /presence:
 *   get:
 *     summary: Trạng thái hiện diện (ONLINE/IDLE/DND/OFFLINE/HIDDEN) của 1 danh sách user
 *     tags: [Presence]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/",
  authenticateToken,
  apiLimiter,
  validateQuery(presenceQuerySchema),
  controller.getMany
);

export default router;
