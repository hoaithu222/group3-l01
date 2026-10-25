import { Router } from "express";
import { apiLimiter, authenticateToken, requireFeature, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { requireWorkspaceRole } from "../../core/permission";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createMeGamificationController } from "./controllers/me-gamification.controller";
import { leaderboardQuerySchema, seenSchema, showcaseSchema, workspaceIdParamSchema, xpEventsQuerySchema } from "./dtos";
import { getGamificationContainer } from "./gamification.container";
import { registerGamificationNotificationTypes } from "./notifications/gamification.notification-types";
import { registerGamificationIntegrations } from "./services/gamification-integrations";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const c = getGamificationContainer();
const controller = createMeGamificationController(c.query, c.leaderboard);

// Side-effect lúc import (giống `registerStudyIntegrations`): gate upload scope `BADGE` + quyền đọc asset `BADGE_ICON`. Chỉ API cần (worker không phục vụ URL/upload).
registerGamificationIntegrations({ badges: c.badgeRepo, directory: c.directory });

// Loại thông báo LEVEL_UP/BADGE_UNLOCKED — API đọc hộp thư cần biết loại (worker đăng ký ở `jobs/gamification.jobs.ts`).
registerGamificationNotificationTypes();

const guard = [authenticateToken, requireFeature(MODULES.GAMIFICATION), apiLimiter];

/**
 * @openapi
 * /me/gamification:
 *   get:
 *     summary: Tổng quan XP/cấp độ/chuỗi ngày/huy hiệu của tôi (chuỗi hiển thị tính lại khi đọc; levelUpPending khi chưa xem modal lên cấp)
 *     tags: [Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ xp, level, xpIntoLevel, xpToNext, levelSpan, streak, streakAtRisk, longestStreak, counters, showcase[], unseenBadges[], levelUpPending?, serverNow }" }
 */
router.get("/me/gamification", ...guard, controller.me);

/**
 * @openapi
 * /me/gamification/seen:
 *   post:
 *     summary: Đánh dấu đã xem cấp mới / huy hiệu mới — đồng bộ MỌI thiết bị (modal lên cấp chỉ hiện một lần)
 *     tags: [Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã ghi nhận }
 */
router.post("/me/gamification/seen", ...guard, validateBody(seenSchema), controller.seen);

/**
 * @openapi
 * /me/xp-events:
 *   get:
 *     summary: Lịch sử điểm kinh nghiệm của tôi (cursor, mới → cũ) — kể cả sự kiện XP 0 do vượt trần/chống farm
 *     tags: [Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: [{ id, sourceType, xp, capped, blockedReason, occurredAt, workspaceId }], meta: { nextCursor, hasMore, limit }" }
 */
router.get("/me/xp-events", ...guard, validateQuery(xpEventsQuerySchema), controller.xpEvents);

/**
 * @openapi
 * /badges:
 *   get:
 *     summary: Danh mục huy hiệu (đang bật + đã mở) kèm tiến độ từng mệnh đề và thời điểm mở
 *     tags: [Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "[{ id, code, name, description, emoji, rarity, unlockedAt?, seen?, progress: [{ counter, current, target }] }]" }
 */
router.get("/badges", ...guard, controller.catalog);

/**
 * @openapi
 * /me/badges/showcase:
 *   put:
 *     summary: Chọn ≤ 6 huy hiệu ĐÃ MỞ để trưng bày. GAME_006 khi chọn huy hiệu chưa mở/quá số lượng. (Không có endpoint tự cấp huy hiệu → POST /me/badges = 404)
 *     tags: [Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ showcase: BadgeDto[] }" }
 */
router.put("/me/badges/showcase", ...guard, validateBody(showcaseSchema), controller.showcase);

/**
 * @openapi
 * /workspaces/{id}/leaderboard:
 *   get:
 *     summary: Bảng xếp hạng nhóm theo kỳ WEEK|MONTH|ALL (MEMBER trở lên; khách/người ngoài → 404). Người tắt "hiện trong xếp hạng" bị loại; me.hidden = true khi chính tôi đang ẩn
 *     tags: [Gamification]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: period, in: query, schema: { type: string, enum: [WEEK, MONTH, ALL], default: WEEK } }
 *     responses:
 *       200: { description: "{ period, from, to, entries: [{ rank, userId, name, avatarAssetId, avatarUrl, level, xp }], me: { rank, xp, hidden }, serverNow } — avatarUrl = URL ảnh tuyệt đối ký sẵn (dùng thẳng làm nguồn ảnh, không cần Bearer) hoặc null" }
 */
router.get("/workspaces/:id/leaderboard", ...guard, validateParams(workspaceIdParamSchema), requireWorkspaceRole("MEMBER", "id"), validateQuery(leaderboardQuerySchema), controller.leaderboard);

/**
 * @openapi
 * /users/{id}/gamification/public:
 *   get:
 *     summary: Hồ sơ công khai (cấp, chuỗi, huy hiệu trưng bày) của người CHUNG nhóm ACTIVE — 404 nếu không chung nhóm hoặc người đó tắt showGamification
 *     tags: [Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ userId, name, avatarAssetId, avatarUrl, level, streak, showcase[], equippedItems[] } — avatarUrl = URL ảnh tuyệt đối ký sẵn hoặc null; equippedItems = vật phẩm hồ sơ đang trang bị (khung avatar/theme/emoji, p7-02 P1)" }
 */
router.get("/users/:id/gamification/public", ...guard, validateParams(idParamSchema), controller.publicProfile);

export default router;
