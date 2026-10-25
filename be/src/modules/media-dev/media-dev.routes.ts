import { Router } from "express";
import { authenticateToken, scopeLimiter, validateBody } from "../../core/middlewares";
import { createMediaDevController } from "./media-dev.controller";
import { requireSpikeAccess, requireSpikeEnabled } from "./media-dev.access";
import { MediaDevService } from "./media-dev.service";
import { spikeTokenSchema } from "./media-dev.validators";

/** be.md §4: 30 lượt/giờ/người. */
export const SPIKE_TOKEN_RATE = { max: 30, windowSeconds: 3600 } as const;

export function createMediaDevRouter(service: MediaDevService): Router {
  const router = Router();
  const controller = createMediaDevController(service);

  // Lớp kiểm chạy trước xác thực để endpoint tắt không lộ gì (404), kể cả khi router bị mount nhầm ở production.
  router.use(requireSpikeEnabled);
  router.use(authenticateToken);

  /**
   * @openapi
   * /dev/media/spike-token:
   *   post:
   *     summary: "[dev/staging] Cấp token LiveKit cho phòng spike_<room> (chỉ khi MEDIA_SPIKE_ENABLED=true, không ở production)"
   *     tags: [Admin — Media]
   *     security: [{ BearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [room]
   *             properties:
   *               room: { type: string, pattern: "^[a-z0-9-]{3,32}$" }
   *               publish:
   *                 type: object
   *                 properties: { audio: { type: boolean }, video: { type: boolean }, screen: { type: boolean } }
   *     responses:
   *       200: { description: "{ url, token, room, identity, expiresAt }" }
   *       403: { description: "Không có system-config:update và không nằm trong MEDIA_SPIKE_ALLOWED_EMAILS" }
   *       404: { description: "Endpoint tắt" }
   *       429: { description: "Quá 30 lượt/giờ" }
   *       503: { description: "MEDIA_001 — chưa cấu hình LiveKit" }
   */
  router.post(
    "/spike-token",
    requireSpikeAccess,
    scopeLimiter("media-spike", (req) => req.user?.id ?? null, [SPIKE_TOKEN_RATE]),
    validateBody(spikeTokenSchema),
    controller.spikeToken
  );

  return router;
}

export default createMediaDevRouter(new MediaDevService());
