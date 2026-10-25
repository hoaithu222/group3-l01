import { Router } from "express";
import { authenticateToken, requirePermission, validateBody, validateQuery } from "../../core/middlewares";
import { AuditService } from "../audit-log/audit-log.service";
import { AdminStorageService } from "./admin-storage.service";
import { createAdminStorageController } from "./admin-storage.controller";
import { storageCleanupSchema, storageStatsQuerySchema } from "./admin-storage.validators";

const router = Router();

// ── DI wiring ─────────────────────────────────────────────────────────────────
const auditService = new AuditService();
const service = new AdminStorageService(auditService);
const controller = createAdminStorageController(service);

router.use(authenticateToken);

/**
 * @openapi
 * /admin/storage/stats:
 *   get:
 *     summary: Thống kê dung lượng asset theo scope/kind/status + ước lượng mồ côi
 *     tags: [AdminStorage]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/stats",
  requirePermission("system-config:view"),
  validateQuery(storageStatsQuerySchema),
  controller.getStats
);

/**
 * @openapi
 * /admin/storage/cleanup:
 *   post:
 *     summary: "Chạy dọn tệp mồ côi ngay (xếp job assets.cleanup thủ công, tối đa 1 lượt/giờ, có audit)"
 *     tags: [AdminStorage]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 10, maxLength: 500 }
 *     responses:
 *       200:
 *         description: "{ jobId, alreadyQueued } — alreadyQueued=true khi giờ này đã có lượt thủ công (không xếp thêm, không audit)"
 *       400: { description: "Thiếu hoặc ngắn lý do (VAL_001)" }
 *       403: { description: "Thiếu quyền system-config:update" }
 */
router.post(
  "/cleanup",
  requirePermission("system-config:update"),
  validateBody(storageCleanupSchema),
  controller.cleanup
);

export default router;
