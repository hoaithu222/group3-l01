import { Router } from "express";
import {
  authenticateToken,
  apiLimiter,
  requireFeature,
  validateBody,
  validateParams,
  validateQuery,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { PrismaBlocksRepo } from "./blocks.repo";
import { BlocksService } from "./blocks.service";
import { createBlocksController } from "./blocks.controller";
import { blockSchema, listBlocksQuerySchema, unblockParamsSchema } from "./blocks.validators";
import { getBlockPort } from "./public";

// ── DI wiring (be.md p1-08 §1, pattern Flat) ─────────────────────────────────
const repo = new PrismaBlocksRepo();
const service = new BlocksService(repo, getBlockPort());
const controller = createBlocksController(service);

// Mount tại `/me/blocks` (router.ts). `M` = authenticateToken → cờ `communication` → apiLimiter.
const router = Router();
router.use(authenticateToken, requireFeature(MODULES.COMMUNICATION), apiLimiter);

/**
 * @openapi
 * /me/blocks:
 *   get:
 *     summary: Danh sách người đã chặn (cursor) + meta.allIds (≤ 500 id đầy đủ để lọc ở client)
 *     tags: [Blocks]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data[]: { userId, name, avatarUrl, blockedAt }" }
 */
router.get("/", validateQuery(listBlocksQuerySchema), controller.list);

/**
 * @openapi
 * /me/blocks:
 *   post:
 *     summary: Chặn người dùng (idempotent — 201 mới, 200 đã chặn từ trước)
 *     description: |
 *       Hiệu ứng: hai bên không nhắn tin 1-1/gọi/thấy trạng thái hoạt động của nhau; người bị chặn
 *       KHÔNG được thông báo. Lỗi: BLOCK_001 (tự chặn), BLOCK_004 (quá 500 người), 404 (không có user).
 *     tags: [Blocks]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [userId], properties: { userId: { type: string } } }
 */
router.post("/", validateBody(blockSchema), controller.block);

/**
 * @openapi
 * /me/blocks/{userId}:
 *   delete:
 *     summary: Bỏ chặn (idempotent — chưa chặn vẫn 200)
 *     tags: [Blocks]
 *     security: [{ BearerAuth: [] }]
 */
router.delete("/:userId", validateParams(unblockParamsSchema), controller.unblock);

export default router;
