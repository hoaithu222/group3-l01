import { Router } from "express";
import type { Request } from "express";
import {
  authenticateToken,
  apiLimiter,
  requireFeature,
  scopeLimiter,
  validateBody,
  validateQuery,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { getReadReceiptPublisher, permissionService } from "../../core/permission";
import { catchAsync } from "../../core/utils/catchAsync";
import { UnauthorizedError } from "../../core/exceptions";
import { enqueue } from "../../infrastructure/queue";
import { emitToUsers } from "../../infrastructure/socket/socket.emit";
import { getMessageScope } from "../messages/public";
import { PrismaReadStateRepository } from "./repositories/read-state.repository.prisma";
import { PrismaUnreadRepository } from "./repositories/unread.repository.prisma";
import { ReadMarkerService, type ReadMarkerDeps } from "./services/read-marker.service";
import { UnreadService } from "./services/unread.service";
import { UnreadCache, notifyUnreadSummaryChanged } from "./services/unread-cache";
import { createReadMarkerController } from "./controllers/read-marker.controller";
import { createUnreadController } from "./controllers/unread.controller";
import { readMarkerSchema, readAllConversationsSchema, unreadQuerySchema } from "./dtos";

// ── DI wiring ────────────────────────────────────────────────────────────────
const cache = new UnreadCache();
const readStateRepo = new PrismaReadStateRepository();

const deps: ReadMarkerDeps = {
  async canRead(user, scopeType, scopeId) {
    const scope = getMessageScope(scopeType);
    if (!scope) return { visible: false, workspaceId: null };
    return scope.canRead(user, scopeId);
  },
  emitToUser: (userId, event, payload) => emitToUsers([userId], event, payload),
  enqueueMarkRead: (job) =>
    enqueue("notifications", "notifications.mark-read-by-stream", job, {
      // jobId tuỳ biến chỉ được có 0 hoặc đúng 2 dấu ":" (BullMQ) — dùng "_" toàn bộ.
      jobId: `mark-read_${job.userId}_${job.scopeType}_${job.scopeId}_${job.streamKey}_${job.seq}`,
    }),
  getReceiptPublisher: getReadReceiptPublisher,
  notifySummaryChanged: notifyUnreadSummaryChanged,
};

export const readMarkerService = new ReadMarkerService(readStateRepo, cache, deps);
export const unreadService = new UnreadService(new PrismaUnreadRepository(), cache);
export { readStateRepo };

const readMarkerController = createReadMarkerController(readMarkerService);
const unreadController = createUnreadController(unreadService);

// `M` = authenticateToken → requireFeature(communication) → apiLimiter (be.md §4).
const M = [authenticateToken, requireFeature(MODULES.COMMUNICATION), apiLimiter] as const;

/** `GET /me/unread?workspaceId=` — người dùng phải thấy được workspace (404 nếu không), be.md §4 "MEMBER". */
const requireWorkspaceFromQuery = catchAsync(async (req: Request, _res, next) => {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  const { workspaceId } = req.query as unknown as { workspaceId: string };
  await permissionService.assert(req.user, "workspace.read", { type: "WORKSPACE", id: workspaceId });
  next();
});

const router = Router();

/**
 * @openapi
 * /read-markers:
 *   post:
 *     summary: Đặt mốc đã đọc (CHANNEL | THREAD | CONVERSATION) — chỉ tăng, kẹp theo lastSeq
 *     tags: [ReadState]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/read-markers",
  ...M,
  scopeLimiter("read-marker", (req) => req.user?.id ?? null, [{ max: 120, windowSeconds: 60 }]),
  validateBody(readMarkerSchema),
  readMarkerController.mark
);

/**
 * @openapi
 * /me/read-all-conversations:
 *   post:
 *     summary: Đánh dấu mọi cuộc trò chuyện đã đọc (chỉ hội thoại có activityAt ≤ before)
 *     tags: [ReadState]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/me/read-all-conversations", ...M, validateBody(readAllConversationsSchema), readMarkerController.readAllConversations);

/**
 * @openapi
 * /me/unread/summary:
 *   get:
 *     summary: Tổng hợp chưa đọc cho badge tab (Tin nhắn · Nhóm · Hoạt động) và icon app
 *     tags: [ReadState]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/unread/summary", ...M, unreadController.summary);

/**
 * @openapi
 * /me/unread:
 *   get:
 *     summary: "Chấm/số chưa đọc theo kênh và thread theo dõi trong 1 workspace — kèm lastReadSeq (mốc đã đọc, để vẽ đường kẻ Tin chưa đọc) và lastSeq"
 *     tags: [ReadState]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/unread", ...M, validateQuery(unreadQuerySchema), requireWorkspaceFromQuery, unreadController.perWorkspace);

export default router;
