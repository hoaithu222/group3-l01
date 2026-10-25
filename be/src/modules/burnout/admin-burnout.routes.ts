import { Router } from "express";
import { apiLimiter, authenticateToken, requireFeature, requirePermission, validateBody, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { createAdminBurnoutController } from "./controllers/admin-burnout.controller";
import { overviewQuerySchema, updateRulesSchema } from "./dtos";
import { getBurnoutContainer } from "./burnout.container";

/**
 * Admin sức khoẻ học tập (`/admin/wellbeing/*`, p7-03 be.md §4) — path tuyệt đối, mount ở root v1. QUYỀN RIÊNG TƯ: admin chỉ thấy số liệu ẨN DANH tổng hợp (≥ 20 người bật, ô nhỏ bị che) và cấu hình luật; KHÔNG có route nào
 * nhận `userId` và KHÔNG có route xem dữ liệu một người (test `burnout-privacy.test.ts` khoá điều này). `gamification:view` xem, `gamification:update` sửa luật (lý do bắt buộc + audit `wellbeing.rules-update`). Cờ `burnout` gắn ở từng route.
 */
const router = Router();
const controller = createAdminBurnoutController({ admin: getBurnoutContainer().admin });

const guard = [authenticateToken, requireFeature(MODULES.BURNOUT), apiLimiter];
const view = requirePermission("gamification:view");
const update = requirePermission("gamification:update");

/**
 * @openapi
 * /admin/wellbeing/overview:
 *   get:
 *     summary: Tổng quan ẨN DANH (weeks 1–12, mặc định 12). `{ insufficient: true, minimum: 20 }` khi số người bật < 20; ngược lại { optInApprox (làm tròn 10), alertsPerWeek[] (ô 1–4 → null), levelDistribution (nhóm < 5 gộp OTHER) }
 *     tags: [Admin/Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: OverviewDto }
 */
router.get("/admin/wellbeing/overview", ...guard, view, validateQuery(overviewQuerySchema), controller.overview);

/**
 * @openapi
 * /admin/wellbeing/rules:
 *   get:
 *     summary: Bộ luật chấm điểm hiện hành { version, windowDays, levels{medium,high}, rules[], updatedAt, updatedBy, isDefault, defaults{windowDays,levels,rules} } — `defaults` cho nút "Về mặc định" (điền form, vẫn phải lưu có lý do)
 *     tags: [Admin/Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: RulesDto }
 *   put:
 *     summary: Lưu bộ luật (CAS expectedVersion = version đang xem → RES_003; lý do 10–500 + audit wellbeing.rules-update; version tăng 1). Có hiệu lực cho lần chấm kế tiếp, không tính lại quá khứ. WELL_003 luật không hợp lệ, WELL_004 medium ≥ high
 *     tags: [Admin/Wellbeing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: RulesDto }
 */
router.get("/admin/wellbeing/rules", ...guard, view, controller.getRules);
router.put("/admin/wellbeing/rules", ...guard, update, validateBody(updateRulesSchema), controller.putRules);

export default router;
