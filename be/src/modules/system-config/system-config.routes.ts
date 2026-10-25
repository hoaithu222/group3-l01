import { Router } from "express";
import { authenticateToken, requirePermission, validateBody, validateParams } from "../../core/middlewares";
import { AuditService } from "../audit-log/audit-log.service";
import { PrismaSystemConfigRepository } from "./repositories/system-config.repository.prisma";
import { SystemConfigService } from "./services/system-config.service";
import { createSystemConfigController } from "./controllers/system-config.controller";
import {
  systemConfigKeyParamSchema,
  updateSystemConfigSchema,
  resetSystemConfigSchema,
} from "./dtos/update-system-config.dto";

const router = Router();

// ── DI wiring ─────────────────────────────────────────────────────────────────
const repo = new PrismaSystemConfigRepository();
const auditService = new AuditService();
const service = new SystemConfigService(repo, auditService);
const controller = createSystemConfigController(service);

router.use(authenticateToken);

/**
 * @openapi
 * /admin/system-config:
 *   get:
 *     summary: Danh sách khoá cấu hình (metadata registry + giá trị lưu/hiệu lực)
 *     tags: [Admin — System config]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/", requirePermission("system-config:view"), controller.getList);

/**
 * @openapi
 * /admin/system-config/{key}:
 *   get:
 *     summary: Chi tiết 1 khoá cấu hình
 *     tags: [Admin — System config]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:key",
  requirePermission("system-config:view"),
  validateParams(systemConfigKeyParamSchema),
  controller.getOne
);

/**
 * @openapi
 * /admin/system-config/{key}:
 *   put:
 *     summary: Cập nhật override runtime cho 1 khoá cấu hình (expectedVersion + reason bắt buộc)
 *     tags: [Admin — System config]
 *     security: [{ BearerAuth: [] }]
 */
router.put(
  "/:key",
  requirePermission("system-config:update"),
  validateParams(systemConfigKeyParamSchema),
  validateBody(updateSystemConfigSchema),
  controller.update
);

/**
 * @openapi
 * /admin/system-config/{key}/reset:
 *   post:
 *     summary: Xoá override, về mặc định (expectedVersion + reason bắt buộc)
 *     tags: [Admin — System config]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:key/reset",
  requirePermission("system-config:update"),
  validateParams(systemConfigKeyParamSchema),
  validateBody(resetSystemConfigSchema),
  controller.reset
);

export default router;
