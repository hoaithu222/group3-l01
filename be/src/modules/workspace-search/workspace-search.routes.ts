import { Router } from "express";
import {
  authenticateToken,
  apiLimiter,
  validateQuery,
  requireFeature,
  requireSubFeature,
  scopeLimiter,
} from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { MODULES, SUB_FEATURES } from "../../core/constants/modules";
import { runtimeConfig } from "../../core/config/runtime-config";
import { permissionService, requireWorkspaceRole } from "../../core/permission";
import { getStates } from "../presence/presence.service";
import { PrismaReadableScopesRepository } from "./repositories/readable-scopes.repository.prisma";
import { PrismaMessageSearchRepository } from "./repositories/message-search.repository.prisma";
import { PrismaCatalogSearchRepository } from "./repositories/catalog-search.repository.prisma";
import { ReadableScopesService } from "./services/readable-scopes.service";
import { MessageSearcher } from "./services/searchers/message.searcher";
import { FileSearcher, type ResourceGate } from "./services/searchers/file.searcher";
import { ChannelSearcher } from "./services/searchers/channel.searcher";
import { PeopleSearcher } from "./services/searchers/people.searcher";
import { MeetingSearcher } from "./services/searchers/meeting.searcher";
import { WorkspaceSearchService } from "./services/workspace-search.service";
import { createWorkspaceSearchController } from "./controllers/workspace-search.controller";
import { workspaceSearchQuerySchema } from "./dtos";

// ── DI wiring ────────────────────────────────────────────────────────────────
const scopes = new ReadableScopesService(new PrismaReadableScopesRepository());
const messageRepo = new PrismaMessageSearchRepository();
const catalog = new PrismaCatalogSearchRepository();

/** Kho tài liệu (p3-01) chỉ hiện khi phân hệ `project` bật VÀ người tìm có `workspace.resource.read` (khách bị 404 → không có). */
const resourceGate: ResourceGate = async (ctx) =>
  (await runtimeConfig.isFeatureEnabled(MODULES.PROJECT)) &&
  (await permissionService.can(ctx.user, "workspace.resource.read", { type: "WORKSPACE", id: ctx.workspaceId }));

const service = new WorkspaceSearchService({
  messages: new MessageSearcher(scopes, messageRepo, catalog),
  files: new FileSearcher(scopes, messageRepo, catalog, resourceGate),
  channels: new ChannelSearcher(scopes),
  people: new PeopleSearcher(catalog, getStates),
  meetings: new MeetingSearcher(catalog),
});
const controller = createWorkspaceSearchController(service);

/** 30 lượt tìm/phút/người — đặt SAU kiểm quyền/validate để lượt sai không chiếm hạn mức. */
const searchRateLimiter = scopeLimiter("ws-search", (req) => req.user?.id ?? null, [
  { max: LIMITS.search.ratePerMinute, windowSeconds: 60 },
]);

const router = Router();

/**
 * @openapi
 * /workspaces/{workspaceId}/search:
 *   get:
 *     summary: Tìm toàn workspace (tin nhắn, tệp, kênh, người, cuộc họp) — không dấu, neo đầu từ, chỉ trong phạm vi đọc được
 *     description: |
 *       Query: `q` (2–100 grapheme, tối đa 8 từ), `type` (messages|files|channels|people|meetings, mặc định messages),
 *       `authorId`, `from`, `to` (mặc định lùi 12 tháng), `hasFile`, `scopeType`+`scopeId` (một kênh/hội thoại),
 *       `includeDirect` (gồm tin 1-1 với người còn trong nhóm), `cursor`, `limit`.
 *       Response cursor `{ data, meta { nextCursor, hasMore, limit, partial, truncated } }`; item theo `type`:
 *       messages `{ messageId, seq, scope{type,id,name,isPrivate}, threadId, parentMessageId, inThread, author, snippet,
 *       highlights[{start,end}], createdAt, hasAttachments }`; files `{ assetId, name, mime, size, kind, source{kind,messageId?,resourceId?,scope?}, createdAt }`;
 *       channels `{ channelId, name, type, visibility, status, joined, memberCount? }`; people `{ userId, displayName, avatarUrl, role, presence }`;
 *       meetings `{ meetingId, code, title, startAt, endAt, status, isAttendee }`.
 *       Lỗi: 400 `SRCH_101` (từ khoá), 404 `SRCH_102` (phạm vi không đọc được), 403 `SRCH_103` (khách tìm người),
 *       422 `SRCH_104` (quá rộng — hết thời gian mà chưa có kết quả), 404 `CFG_005` (tính năng tắt), 429 `RATE_002`.
 *       Mở kết quả tin: `GET /scopes/{type}/{id}/messages?around={messageId}`.
 *     tags: [WorkspaceSearch]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/workspaces/:workspaceId/search",
  authenticateToken,
  requireFeature(MODULES.COMMUNICATION),
  requireSubFeature(SUB_FEATURES.WORKSPACE_SEARCH),
  apiLimiter,
  requireWorkspaceRole("GUEST"),
  validateQuery(workspaceSearchQuerySchema),
  searchRateLimiter,
  controller.search
);

export default router;
