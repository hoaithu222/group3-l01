import { Router } from "express";
import { authenticateToken } from "../../core/middlewares";
import { createCapabilitiesController } from "./capabilities.controller";

const router = Router();
const controller = createCapabilitiesController();

/**
 * @openapi
 * /capabilities:
 *   get:
 *     summary: Cờ phân hệ + giới hạn hiện hành (feature flags, limits, upload)
 *     tags: [Capabilities]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/", authenticateToken, controller.get);

export default router;
