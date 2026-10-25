import { Router } from "express";
import { authenticateToken, requireFeature, requirePermission, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { idParamSchema, reasonSchema } from "../../shared/dto/common-schemas";
import { createLiveQuizAdminController } from "./controllers/live-quiz-admin.controller";
import { adminSessionsQuerySchema } from "./dtos";
import { getLiveQuizContainer } from "./live-quiz.container";

/**
 * Admin live quiz (p5-01 be.md §4) — mount ở root v1 (path tuyệt đối `/admin/live-quiz/*`). `gamification:view` xem, `gamification:update`
 * huỷ phiên (lý do 10–500 bắt buộc, audit `live-quiz.admin-end`). Cờ `live-quiz` gắn từng route như `live-quiz.routes.ts`.
 */
const router = Router();
const controller = createLiveQuizAdminController(getLiveQuizContainer().service);

const guard = [authenticateToken, requireFeature(MODULES.LIVE_QUIZ)];

/**
 * @openapi
 * /admin/live-quiz/sessions:
 *   get:
 *     summary: Danh sách phiên live quiz (lọc status, page/limit) — metadata, không PIN/đáp án
 *     tags: [Admin/LiveQuiz]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: LiveQuizSessionAdminDto[], meta: { page, limit, total, totalPages, hasNext, hasPrev }" }
 */
router.get("/admin/live-quiz/sessions", ...guard, requirePermission("gamification:view"), validateQuery(adminSessionsQuerySchema), controller.list);

/**
 * @openapi
 * /admin/live-quiz/sessions/{id}:
 *   get:
 *     summary: Chi tiết phiên + bảng kết quả bền (nếu đã lưu). QUIZ_001 không tồn tại
 *     tags: [Admin/LiveQuiz]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: LiveQuizSessionAdminDetailDto }
 */
router.get("/admin/live-quiz/sessions/:id", ...guard, requirePermission("gamification:view"), validateParams(idParamSchema), controller.get);

/**
 * @openapi
 * /admin/live-quiz/sessions/{id}/end:
 *   post:
 *     summary: Huỷ phiên đang mở (CANCELLED, ADMIN_ENDED, không phát XP) — lý do bắt buộc, audit live-quiz.admin-end. QUIZ_007 phiên đã đóng
 *     tags: [Admin/LiveQuiz]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ status: CANCELLED }" }
 */
router.post(
  "/admin/live-quiz/sessions/:id/end",
  ...guard,
  requirePermission("gamification:update"),
  validateParams(idParamSchema),
  validateBody(reasonSchema),
  controller.end
);

export default router;
