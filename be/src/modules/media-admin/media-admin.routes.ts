import { Router } from "express";
import { authenticateToken, requirePermission } from "../../core/middlewares";
import { createMediaAdminController } from "./media-admin.controller";
import { PrismaMediaAdminRepository } from "./media-admin.repo";
import { MediaAdminService } from "./media-admin.service";

export function createMediaAdminRouter(service: MediaAdminService): Router {
  const router = Router();
  const controller = createMediaAdminController(service);

  router.use(authenticateToken);

  /**
   * @openapi
   * /admin/media/status:
   *   get:
   *     summary: "Trạng thái máy chủ media: cấu hình, kết nối, số phòng/người, egress, webhook gần nhất"
   *     tags: [Admin — Media]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "{ configured, reachable, latencyMs, rooms, egress, lastWebhookAt }" }
   *       403: { description: "Thiếu quyền system-config:view" }
   *       503: { description: "MEDIA_001 — chưa cấu hình LiveKit" }
   */
  router.get("/status", requirePermission("system-config:view"), controller.getStatus);

  return router;
}

// ── DI wiring ─────────────────────────────────────────────────────────────────
export default createMediaAdminRouter(new MediaAdminService(new PrismaMediaAdminRepository()));
