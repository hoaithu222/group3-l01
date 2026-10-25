import { Router } from "express";
import {
  authenticateToken,
  apiLimiter,
  validateBody,
  validateQuery,
  validateParams,
  requireFeature,
} from "../../core/middlewares";
import { requireChannelAccess } from "../../core/permission";
import { MODULES } from "../../core/constants/modules";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createMessageService } from "../messages/public";
import { PrismaThreadRepository } from "./repositories/thread.repository.prisma";
import { PrismaThreadSubscriptionRepository } from "./repositories/thread-subscription.repository.prisma";
import { ThreadService } from "./services/thread.service";
import { createThreadController } from "./controllers/thread.controller";
import { threadQuerySchema, subscriptionSchema, threadListQuerySchema } from "./dtos";

// ── DI wiring (be.md §1) ─────────────────────────────────────────────────────
const threadRepo = new PrismaThreadRepository();
const subscriptionRepo = new PrismaThreadSubscriptionRepository();

/** Export cho `modules/threads/index.ts` dùng LẠI cùng 1 instance khi đăng ký `IThreadHook` — tránh `new` lần nữa. */
export const threadService = new ThreadService(threadRepo, subscriptionRepo);

const controller = createThreadController(threadService, createMessageService());

// `M` = authenticateToken → isModuleEnabled("communication") → apiLimiter (be.md §4).
const M = [authenticateToken, requireFeature(MODULES.COMMUNICATION), apiLimiter] as const;

const router = Router();

/**
 * @openapi
 * /messages/{id}/thread:
 *   get:
 *     summary: Tin gốc + tóm tắt thread + trang reply (cursor beforeSeq/afterSeq/around)
 *     tags: [Threads]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/messages/:id/thread",
  ...M,
  validateParams(idParamSchema),
  validateQuery(threadQuerySchema),
  controller.getByRootMessage
);

/**
 * @openapi
 * /threads/{id}:
 *   get:
 *     summary: Tóm tắt thread + trạng thái theo dõi của tôi
 *     tags: [Threads]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/threads/:id", ...M, validateParams(idParamSchema), controller.getById);

/**
 * @openapi
 * /threads/{id}/subscription:
 *   put:
 *     summary: Bật/tắt theo dõi thread (EXPLICIT_ON/EXPLICIT_OFF)
 *     tags: [Threads]
 *     security: [{ BearerAuth: [] }]
 */
router.put(
  "/threads/:id/subscription",
  ...M,
  validateParams(idParamSchema),
  validateBody(subscriptionSchema),
  controller.setSubscription
);

/**
 * @openapi
 * /channels/{id}/threads:
 *   get:
 *     summary: (P1) Danh sách thread trong kênh — filter following|all, cursor
 *     tags: [Threads]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/channels/:id/threads",
  ...M,
  requireChannelAccess("read", "id"),
  validateQuery(threadListQuerySchema),
  controller.listByChannel
);

export default router;
