import { Router } from "express";
import {
  authenticateToken,
  requirePermission,
  validateBody,
  validateParams,
  validateQuery,
} from "../../core/middlewares";
import { AuditService } from "../audit-log/audit-log.service";
import { AdminJobsService } from "./admin-jobs.service";
import { createAdminJobsController } from "./admin-jobs.controller";
import {
  queueParamSchema,
  failedJobsQuerySchema,
  outboxQuerySchema,
  outboxIdParamSchema,
  jobActionSchema,
} from "./admin-jobs.validators";

const router = Router();

// ── DI wiring ─────────────────────────────────────────────────────────────────
const auditService = new AuditService();
const service = new AdminJobsService(auditService);
const controller = createAdminJobsController(service);

router.use(authenticateToken);

/**
 * @openapi
 * /admin/jobs/queues:
 *   get:
 *     summary: Tổng quan hàng đợi BullMQ (waiting/active/delayed/failed/completed/schedulers)
 *     tags: [AdminJobs]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/queues", requirePermission("system-config:view"), controller.getQueues);

/**
 * @openapi
 * /admin/jobs/failed:
 *   get:
 *     summary: Danh sách job lỗi (gộp mọi queue nếu không truyền `queue`)
 *     tags: [AdminJobs]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/failed",
  requirePermission("system-config:view"),
  validateQuery(failedJobsQuerySchema),
  controller.getFailed
);

/**
 * @openapi
 * /admin/jobs/outbox:
 *   get:
 *     summary: Danh sách OutboxEvent (cursor pagination, payload đã che)
 *     tags: [AdminJobs]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/outbox",
  requirePermission("system-config:view"),
  validateQuery(outboxQuerySchema),
  controller.listOutbox
);

/**
 * @openapi
 * /admin/jobs/outbox/{id}/requeue:
 *   post:
 *     summary: Chạy lại 1 OutboxEvent đang FAILED
 *     tags: [AdminJobs]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/outbox/:id/requeue",
  requirePermission("system-config:update"),
  validateParams(outboxIdParamSchema),
  validateBody(jobActionSchema),
  controller.requeueOutbox
);

/**
 * @openapi
 * /admin/jobs/{queue}/{jobId}/retry:
 *   post:
 *     summary: Chạy lại 1 job đang failed trong BullMQ
 *     tags: [AdminJobs]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:queue/:jobId/retry",
  requirePermission("system-config:update"),
  validateParams(queueParamSchema),
  validateBody(jobActionSchema),
  controller.retry
);

/**
 * @openapi
 * /admin/jobs/{queue}/{jobId}/remove:
 *   post:
 *     summary: Xoá 1 job khỏi hàng đợi (POST thay DELETE để mang body { reason })
 *     tags: [AdminJobs]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:queue/:jobId/remove",
  requirePermission("system-config:update"),
  validateParams(queueParamSchema),
  validateBody(jobActionSchema),
  controller.remove
);

export default router;
