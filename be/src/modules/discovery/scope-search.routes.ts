import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import {
  authenticateToken,
  apiLimiter,
  validateParams,
  validateQuery,
  requireFeature,
  scopeLimiter,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { objectIdSchema } from "../../shared/dto/common-schemas";
// `messages/public` là barrel công khai (ngoại lệ có chủ đích của luật "không import chéo module").
import { requireMessageScope, scopeParamsSchema } from "../messages/public";
import { PrismaMessageSearchRepository } from "./repositories/message-search.repository.prisma";
import { PrismaDiscoveryLookupRepository } from "./repositories/discovery-lookup.repository.prisma";
import { ScopeSearchService } from "./services/scope-search.service";
import { createScopeSearchController } from "./controllers/scope-search.controller";
import { scopeSearchQuerySchema } from "./dtos";
import type { DiscoveryScopeType } from "./entities/discovery.interface";

// ── DI wiring ────────────────────────────────────────────────────────────────
const searchService = new ScopeSearchService(new PrismaMessageSearchRepository(), new PrismaDiscoveryLookupRepository());
const controller = createScopeSearchController(searchService);

const M = [authenticateToken, requireFeature(MODULES.COMMUNICATION), apiLimiter] as const;

/** 30 lượt tìm/phút/người (`LIMITS.search.ratePerMinute`) — đặt SAU kiểm quyền/validate để lượt sai không chiếm hạn mức. */
const searchRateLimiter = scopeLimiter("scope-search", (req) => req.user?.id ?? null, [
  { max: LIMITS.search.ratePerMinute, windowSeconds: 60 },
]);

const router = Router();

/**
 * @openapi
 * /scopes/{scopeType}/{scopeId}/search:
 *   get:
 *     summary: Tìm tin trong một kênh/hội thoại (không dấu, AND theo từ, gồm reply thread)
 *     description: |
 *       Alias: `GET /channels/{id}/search`, `GET /conversations/{id}/search`.
 *       Query: `q` (2–100 grapheme, tối đa 8 từ), `authorId`, `from`, `to`, `hasFile`, `fileKind`
 *       (IMAGE|VIDEO|AUDIO|VOICE|FILE), `includeThreads` (mặc định true), `cursor`, `limit`.
 *       Trả `SearchHit { messageId, seq, threadId, parentMessageId, author, createdAt, snippet,
 *       highlights[{start,end}], attachmentsSummary, inThread }`; `meta { nextCursor, hasMore, limit, partial }`.
 *       Mở kết quả: `GET /scopes/{type}/{id}/messages?around={messageId}` (reply: thêm `threadId`).
 *       Lỗi: 400 `SRCH_001` (từ khoá 2–100 ký tự), 400 `SRCH_002` (quá nhiều từ), 400 `SRCH_003`
 *       (phạm vi không hỗ trợ), 404 (không đọc được), 429 `RATE_002` (30 lượt/phút).
 *     tags: [Discovery]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/scopes/:scopeType/:scopeId/search",
  ...M,
  validateParams(scopeParamsSchema),
  requireMessageScope("read"),
  validateQuery(scopeSearchQuerySchema),
  searchRateLimiter,
  controller.search
);

export default router;

const aliasIdParamSchema = z.object({ id: objectIdSchema });

/**
 * @openapi
 * /channels/{id}/search:
 *   get:
 *     summary: Tìm tin trong một kênh (alias của /scopes/CHANNEL/{id}/search — cùng query/response/lỗi)
 *     tags: [Discovery]
 *     security: [{ BearerAuth: [] }]
 */
/**
 * @openapi
 * /conversations/{id}/search:
 *   get:
 *     summary: Tìm tin trong một hội thoại (alias của /scopes/CONVERSATION/{id}/search — bỏ tin trước hiddenBeforeSeq và tin MessageHide)
 *     tags: [Discovery]
 *     security: [{ BearerAuth: [] }]
 */

/**
 * Alias đọc dễ (`/channels/:id/search`, `/conversations/:id/search`) — chỉ ánh xạ `:id` sang
 * `scopeType/scopeId` cố định rồi dùng đúng controller/middleware ở trên; `router.ts` mount
 * giống `createScopedMessageRouter` (p1-04).
 */
export function createScopedSearchRouter(scopeType: DiscoveryScopeType): Router {
  const r = Router();

  const injectScope = (req: Request, _res: Response, next: NextFunction): void => {
    req.params.scopeType = scopeType;
    req.params.scopeId = req.params.id;
    next();
  };

  r.get(
    "/:id/search",
    ...M,
    validateParams(aliasIdParamSchema),
    injectScope,
    requireMessageScope("read"),
    validateQuery(scopeSearchQuerySchema),
    searchRateLimiter,
    controller.search
  );

  return r;
}
