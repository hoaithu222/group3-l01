import { Router } from "express";
import { authenticateToken, idempotencyKey, requireFeature, requirePermission, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { reasonSchema } from "../../shared/dto/common-schemas";
import { createGamificationAdminController } from "./controllers/gamification-admin.controller";
import {
  adminBadgesQuerySchema,
  adminLeaderboardQuerySchema,
  adminUserQuerySchema,
  badgeIdParamSchema,
  badgeSchema,
  levelConfigSchema,
  patchBadgeSchema,
  previewBadgeSchema,
  sourceTypeParamSchema,
  updateXpRuleSchema,
  userBadgeParamSchema,
  userIdParamSchema,
  xpAdjustSchema,
} from "./dtos";
import { getGamificationContainer } from "./gamification.container";

/**
 * Admin gamification (admin.md p4-03) — mount ở root v1 (path tuyệt đối `/admin/*`). `gamification:view` xem, `gamification:update` ghi (manager + admin);
 * mọi thao tác ghi bắt buộc `reason` (10–500) và ghi audit (`xp-rule.update`, `badge.create|update|backfill|revoke`, `gamification.xp-adjust`, `system-config.update` cho cấp độ).
 */
const router = Router();
const c = getGamificationContainer();
const controller = createGamificationAdminController({ rules: c.rules, badges: c.badgeAdmin, levels: c.levels, leaderboard: c.leaderboard, adjust: c.adjust, admin: c.admin });

const guard = [authenticateToken, requireFeature(MODULES.GAMIFICATION)];
const view = requirePermission("gamification:view");
const update = requirePermission("gamification:update");

/**
 * @openapi
 * /admin/xp-rules:
 *   get:
 *     summary: Luật điểm kinh nghiệm theo nguồn (xp, dailyCap, countsForStreak, isActive, version)
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "XpRuleDto[]" }
 */
router.get("/admin/xp-rules", ...guard, view, controller.listRules);

/**
 * @openapi
 * /admin/xp-rules/{sourceType}:
 *   put:
 *     summary: Sửa luật XP (CAS expectedVersion, lý do bắt buộc, audit xp-rule.update trước/sau; có hiệu lực ≤ 60 s, KHÔNG hồi tố). GAME_001 luật không tồn tại, RES_003 lệch phiên bản
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: XpRuleDto }
 */
router.put("/admin/xp-rules/:sourceType", ...guard, update, validateParams(sourceTypeParamSchema), validateBody(updateXpRuleSchema), controller.updateRule);

/**
 * @openapi
 * /admin/badges:
 *   get:
 *     summary: Danh sách huy hiệu (page/limit, lọc isActive, q = tên không dấu) kèm unlockedCount
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: BadgeAdminDto[], meta: { page, limit, total, totalPages, hasNext, hasPrev }" }
 */
router.get("/admin/badges", ...guard, view, validateQuery(adminBadgesQuerySchema), controller.listBadges);

/**
 * @openapi
 * /admin/badges/{id}:
 *   get:
 *     summary: Một huy hiệu theo id (kèm unlockedCount) — cho deep link ngăn kéo admin. 404 khi không có
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: BadgeAdminDto }
 */
router.get("/admin/badges/:id", ...guard, view, validateParams(badgeIdParamSchema), controller.getBadge);

/**
 * @openapi
 * /admin/badges:
 *   post:
 *     summary: 'Tạo huy hiệu (criteria = { all: [{ counter, op: gte, value }], any? } — counter thuộc whitelist). GAME_002 điều kiện sai, GAME_003 trùng mã'
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: BadgeAdminDto }
 */
router.post("/admin/badges", ...guard, update, validateBody(badgeSchema), controller.createBadge);

/**
 * @openapi
 * /admin/badges/preview:
 *   post:
 *     summary: Xem trước số người ĐANG đủ điều kiện của một criteria (GAME_002 nếu sai dạng)
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ eligibleUsers }" }
 */
router.post("/admin/badges/preview", ...guard, view, validateBody(previewBadgeSchema), controller.previewBadge);

/**
 * @openapi
 * /admin/badges/{id}:
 *   patch:
 *     summary: Sửa/tắt huy hiệu (CAS expectedVersion; sửa criteria KHÔNG thu hồi huy hiệu đã mở; audit trước/sau)
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: BadgeAdminDto }
 */
router.patch("/admin/badges/:id", ...guard, update, validateParams(badgeIdParamSchema), validateBody(patchBadgeSchema), controller.patchBadge);

/**
 * @openapi
 * /admin/badges/{id}/backfill:
 *   post:
 *     summary: Cấp huy hiệu cho người ĐÃ đủ điều kiện (job nền, idempotent, tối đa một thông báo/người). 409 khi huy hiệu đang tắt
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       202: { description: "{ jobId }" }
 */
router.post("/admin/badges/:id/backfill", ...guard, update, validateParams(badgeIdParamSchema), validateBody(reasonSchema), controller.backfillBadge);

/**
 * @openapi
 * /admin/gamification/levels:
 *   get:
 *     summary: Cấu hình cấp độ hiệu lực { base, maxLevel, version, thresholdsPreview[20] } — cấp độ = round(base × n^1.5)
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: LevelConfigView }
 */
router.get("/admin/gamification/levels", ...guard, view, controller.getLevels);

/**
 * @openapi
 * /admin/gamification/levels:
 *   put:
 *     summary: Đổi cấu hình cấp độ (CAS + lý do + audit qua SystemConfig; KHÔNG hạ cấp người đã đạt). GAME_005 khi ngưỡng cấp cao nhất tràn Int32
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: LevelConfigView }
 */
router.put("/admin/gamification/levels", ...guard, update, validateBody(levelConfigSchema), controller.putLevels);

/**
 * @openapi
 * /admin/gamification/leaderboard:
 *   get:
 *     summary: Bảng xếp hạng một nhóm (tôn trọng opt-out của người dùng)
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "Như /workspaces/{id}/leaderboard" }
 */
router.get("/admin/gamification/leaderboard", ...guard, view, validateQuery(adminLeaderboardQuerySchema), controller.leaderboard);

/**
 * @openapi
 * /admin/users/{id}/gamification:
 *   get:
 *     summary: Tổng quan gamification của một người { summary, badges (kể cả đã thu hồi), xpEvents } (cursor cho xpEvents)
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ summary, badges[], xpEvents[], xpEventsMeta }" }
 */
router.get("/admin/users/:id/gamification", ...guard, view, validateParams(userIdParamSchema), validateQuery(adminUserQuerySchema), controller.userOverview);

/**
 * @openapi
 * /admin/users/{id}/xp-adjust:
 *   post:
 *     summary: Điều chỉnh XP ± ≤ 1000 (Idempotency-Key, lý do bắt buộc, audit gamification.xp-adjust; XP không âm, cấp độ tính lại và có thể HẠ). GAME_004 vượt giới hạn
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ xp, level }" }
 */
router.post("/admin/users/:id/xp-adjust", ...guard, update, validateParams(userIdParamSchema), idempotencyKey("xp-adjust"), validateBody(xpAdjustSchema), controller.adjustXp);

/**
 * @openapi
 * /admin/users/{id}/badges/{badgeId}:
 *   delete:
 *     summary: Thu hồi thủ công một huy hiệu (đánh dấu, lý do + audit badge.revoke; không tự mở lại)
 *     tags: [Admin/Gamification]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã thu hồi }
 */
router.delete("/admin/users/:id/badges/:badgeId", ...guard, update, validateParams(userBadgeParamSchema), validateBody(reasonSchema), controller.revokeBadge);

export default router;
