import { Router, type NextFunction, type Request, type Response } from "express";
import { apiLimiter, authenticateToken, requireFeature, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { MODULES } from "../../core/constants/modules";
import { requireWorkspaceRole } from "../../core/permission";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createBurnoutController } from "./controllers/burnout.controller";
import { createWellbeingShareController } from "./controllers/wellbeing-share.controller";
import { ackSchema, assessmentsQuerySchema, breakSchema, patchSettingSchema, shareParamSchema, updateSettingSchema, workspaceIdParamSchema } from "./dtos";
import { getBurnoutContainer } from "./burnout.container";

/**
 * Người dùng: sức khoẻ học tập của CHÍNH MÌNH (p7-03 be.md §4). Path tuyệt đối, mount ở root v1. Mặc định TẮT; không có endpoint nào nhận `userId` (id luôn lấy từ token) nên không có đường xem/sửa/xoá dữ liệu người khác.
 *
 * Cờ `burnout` gắn ở mọi route (tắt → 404 `CFG_005`) NGOẠI TRỪ hai đường RÚT LẠI/XOÁ: `PUT /me/wellbeing` với `optIn: false` và `DELETE /me/wellbeing/data` — quyền tắt và xoá dữ liệu của người dùng không phụ thuộc
 * việc admin tắt phân hệ. Bật (`optIn: true`) vẫn cần cờ.
 */
const router = Router();
const c = getBurnoutContainer();
const controller = createBurnoutController({ settings: c.settings, history: c.history });
const shareController = createWellbeingShareController({ share: c.share });

const featureGate = requireFeature(MODULES.BURNOUT);
const guard = [authenticateToken, featureGate, apiLimiter];
/** Rút lại/xoá luôn được phép (không cần cờ) — vẫn phải đăng nhập + rate limit. */
const alwaysAllowedGuard = [authenticateToken, apiLimiter];
const featureUnlessOptOut = (req: Request, res: Response, next: NextFunction): void => {
  if ((req.body as { optIn?: unknown } | undefined)?.optIn === false) return next();
  featureGate(req, res, next).catch(next);
};

const byUser = (req: { user?: { id: string } }) => req.user?.id ?? null;
const perHour = (name: string, max: number) => scopeLimiter(name, byUser, [{ max, windowSeconds: 3600 }]);
const perMinute = (name: string, max: number) => scopeLimiter(name, byUser, [{ max, windowSeconds: 60 }]);
const perDay = (name: string, max: number) => scopeLimiter(name, byUser, [{ max, windowSeconds: 86_400 }]);

/**
 * @openapi
 * /me/wellbeing:
 *   get:
 *     summary: Cài đặt theo dõi sức khoẻ học tập của tôi { enabled, optedInAt, alertsEnabled, preferredBreak, latest, pendingAlert } — chưa bật thì chỉ mặc định TẮT (không tạo dữ liệu khi xem)
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: SettingDto }
 *   put:
 *     summary: Bật/sửa/tắt theo dõi. `optIn: true` bật (hoặc chỉ sửa cài đặt); `optIn: false` tắt VÀ xoá mọi dữ liệu (chỉ số, đánh giá, bucket) ngay. Tối đa 20 lần/giờ
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: SettingDto }
 */
router.get("/me/wellbeing", ...guard, controller.get);
router.put("/me/wellbeing", authenticateToken, apiLimiter, validateBody(updateSettingSchema), featureUnlessOptOut, perHour("wellbeing-setting", LIMITS.wellbeing.settingPerHour), controller.update);

/**
 * @openapi
 * /me/wellbeing:
 *   patch:
 *     summary: Sửa cài đặt PHỤ (alertsEnabled, preferredBreak) của người ĐANG bật — KHÔNG có optIn, KHÔNG bao giờ bật theo dõi (chưa bật ⇒ WELL_001 409, không ghi gì). Dùng cho công tắc phụ thay vì PUT optIn:true để không lén bật lại theo dõi đã tắt ở máy khác. Chung hạn mức với PUT
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: SettingDto }
 *       409: { description: WELL_001 — chưa bật theo dõi }
 */
router.patch("/me/wellbeing", ...guard, validateBody(patchSettingSchema), perHour("wellbeing-setting", LIMITS.wellbeing.settingPerHour), controller.patch);

/**
 * @openapi
 * /me/wellbeing/assessments:
 *   get:
 *     summary: Chỉ số ngày + đánh giá 7|30 ngày gần nhất của tôi { days, dailies[], assessments[] }. WELL_001 (409) khi chưa bật theo dõi
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: HistoryDto }
 */
router.get("/me/wellbeing/assessments", ...guard, validateQuery(assessmentsQuerySchema), controller.assessments);

/**
 * @openapi
 * /me/wellbeing/alerts/{id}/ack:
 *   post:
 *     summary: "Đã hiểu" (DISMISS) hoặc "Nhắc lại sau" (SNOOZE — tạm hoãn cảnh báo 24 giờ). `id` = assessmentId của cảnh báo; không thuộc tôi/chưa từng cảnh báo → 404. Bấm lại là no-op. 20 lần/phút
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã ghi nhận }
 */
router.post("/me/wellbeing/alerts/:id/ack", ...guard, validateParams(idParamSchema), validateBody(ackSchema), perMinute("wellbeing-ack", LIMITS.wellbeing.ackPerMinute), controller.ack);

/**
 * @openapi
 * /me/wellbeing/data:
 *   delete:
 *     summary: Xoá toàn bộ dữ liệu sức khoẻ học tập đã thu thập của tôi (giữ trạng thái bật, thu thập tiếp từ giờ). Luôn dùng được, kể cả khi admin tắt phân hệ. 10 lần/giờ
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã xoá }
 */
router.delete("/me/wellbeing/data", ...alwaysAllowedGuard, perHour("wellbeing-delete", LIMITS.wellbeing.deleteDataPerHour), controller.deleteData);

/**
 * @openapi
 * /me/wellbeing/break:
 *   post:
 *     summary: "P1 — TakeABreakWidget báo đã nghỉ xong (hít thở 1 phút). Chỉ đếm qua giới hạn tần suất (30 lần/ngày), KHÔNG lưu bản ghi riêng và KHÔNG ảnh hưởng riskScore"
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã ghi nhận }
 */
router.post("/me/wellbeing/break", ...guard, validateBody(breakSchema), perDay("wellbeing-break", LIMITS.wellbeing.breakPerDay), controller.takeBreak);

/**
 * @openapi
 * /me/wellbeing/shares:
 *   get:
 *     summary: "P1 — Danh sách nhóm tôi ĐÃ tự bật chia sẻ mức rủi ro { workspaceId, name }[] (không phải mọi nhóm tôi tham gia)"
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "ShareDto[]" }
 * /me/wellbeing/shares/{workspaceId}:
 *   put:
 *     summary: "P1 — Bật chia sẻ mức rủi ro (LOW/MEDIUM/HIGH, không số phút/điểm) với trưởng nhóm của một nhóm mình đang là thành viên ACTIVE. Cần đã bật theo dõi (WELL_001) và là thành viên (WELL_002). Idempotent"
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: ShareDto }
 *       403: { description: WELL_002 — không phải thành viên đang hoạt động của nhóm }
 *       409: { description: WELL_001 — chưa bật theo dõi }
 *   delete:
 *     summary: "P1 — Tắt chia sẻ (luôn được phép, kể cả khi đã tắt theo dõi/rời nhóm). Idempotent"
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã tắt chia sẻ }
 */
router.get("/me/wellbeing/shares", ...guard, shareController.list);
router.put("/me/wellbeing/shares/:workspaceId", ...guard, validateParams(shareParamSchema), perHour("wellbeing-share", LIMITS.wellbeing.sharePerHour), shareController.share);
router.delete(
  "/me/wellbeing/shares/:workspaceId",
  ...alwaysAllowedGuard,
  validateParams(shareParamSchema),
  perHour("wellbeing-share", LIMITS.wellbeing.sharePerHour),
  shareController.unshare
);

/**
 * @openapi
 * /workspaces/{id}/wellbeing/indicators:
 *   get:
 *     summary: "P1 — Chỉ báo sức khoẻ học tập của nhóm (OWNER/ADMIN): { userId, level, date }[] — CHỈ người đã chia sẻ VÀ còn là thành viên ACTIVE, KHÔNG riskScore/factors/số phút"
 *     tags: [Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "IndicatorDto[]" }
 */
router.get("/workspaces/:id/wellbeing/indicators", ...guard, validateParams(workspaceIdParamSchema), requireWorkspaceRole("ADMIN", "id"), shareController.indicators);

export default router;
