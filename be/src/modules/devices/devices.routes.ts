import { Router } from "express";
import { z } from "zod";
import { authenticateToken, validateBody, validateParams, scopeLimiter } from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { PrismaDeviceRepository } from "./repositories";
import { DeviceService } from "./services/device.service";
import { createDeviceController } from "./controllers/device.controller";
import { registerDeviceSchema } from "./dtos";

const router = Router();

const repo = new PrismaDeviceRepository();
const service = new DeviceService(repo);
const controller = createDeviceController(service);

const deviceIdParamSchema = z.object({ deviceId: z.string().min(1).max(64) });

router.use(authenticateToken);

/**
 * @openapi
 * /me/devices:
 *   post:
 *     summary: Đăng ký (hoặc cập nhật) token thiết bị nhận push
 *     tags: [Devices]
 *     security: [{ BearerAuth: [] }]
 *   get:
 *     summary: Danh sách thiết bị đang hoạt động
 *     tags: [Devices]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/",
  scopeLimiter(
    "device-register",
    (req) => req.user?.id ?? null,
    [{ max: LIMITS.notification.deviceRegisterRatePerHour, windowSeconds: 3600 }]
  ),
  validateBody(registerDeviceSchema),
  controller.register
);
router.get("/", controller.list);

/**
 * @openapi
 * /me/devices/{deviceId}:
 *   delete:
 *     summary: Gỡ thiết bị (thu hồi mọi token FCM/APNs VoIP của thiết bị)
 *     tags: [Devices]
 *     security: [{ BearerAuth: [] }]
 */
router.delete("/:deviceId", validateParams(deviceIdParamSchema), controller.remove);

export default router;
