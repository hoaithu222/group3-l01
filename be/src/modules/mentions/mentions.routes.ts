import { Router } from "express";
import {
  authenticateToken,
  apiLimiter,
  validateParams,
  validateQuery,
  requireFeature,
  scopeLimiter,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { requireMessageScope, scopeParamsSchema } from "../messages/public";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import { MentionablesService } from "./mentionables.service";
import { mentionablesQuerySchema, type MentionablesQueryDto } from "./mentionables-query.dto";
import type { ScopeParamsDto } from "../messages/public";

const mentionablesService = new MentionablesService();

// `M` = authenticateToken → isModuleEnabled("communication") → apiLimiter (be.md §4).
const M = [authenticateToken, requireFeature(MODULES.COMMUNICATION), apiLimiter] as const;

/** be.md §4 — `scopeLimiter("mentionables", u, 60/60s)`. */
const mentionablesRateLimiter = scopeLimiter("mentionables", (req) => req.user?.id ?? null, [
  { max: 60, windowSeconds: 60 },
]);

const router = Router();

/**
 * @openapi
 * /scopes/{scopeType}/{scopeId}/mentionables:
 *   get:
 *     summary: Gợi ý mention (người có quyền đọc phạm vi, không email)
 *     tags: [Mentions]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/scopes/:scopeType/:scopeId/mentionables",
  ...M,
  validateParams(scopeParamsSchema),
  validateQuery(mentionablesQuerySchema),
  requireMessageScope("write"),
  mentionablesRateLimiter,
  catchAsync(async (req, res) => {
    const { scopeType, scopeId } = req.params as unknown as ScopeParamsDto;
    const { q, limit, includeRoles } = req.query as unknown as MentionablesQueryDto;
    const result = await mentionablesService.list(req.user!, scopeType, scopeId, q, limit, includeRoles);
    ResponseUtils.success(res, result);
  })
);

export default router;
