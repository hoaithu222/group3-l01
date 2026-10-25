import { Router, type Request } from "express";
import { LIMITS } from "../../core/constants/limits";
import { MODULES } from "../../core/constants/modules";
import {
  apiLimiter,
  authenticateToken,
  idempotencyKey,
  requireFeature,
  scopeLimiter,
  validateBody,
  validateParams,
  validateQuery,
} from "../../core/middlewares";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createLiveQuizController } from "./controllers/live-quiz.controller";
import { commandSchema, createSessionSchema, historyQuerySchema, joinSchema, kickSchema } from "./dtos";
import { getLiveQuizContainer } from "./live-quiz.container";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const { service } = getLiveQuizContainer();
const controller = createLiveQuizController(service);

// Guard room socket `quiz:{id}` + bộ thực thi lệnh hẹn giờ: `registerLiveQuizModule()` (index.ts) do router.ts gọi — registry room mặc định ĐÓNG.

const guard = [authenticateToken, requireFeature(MODULES.LIVE_QUIZ), apiLimiter];
const byUser = (req: Request): string | null => req.user?.id ?? null;

/**
 * @openapi
 * /live-quiz:
 *   post:
 *     summary: Tạo phiên thi trực tiếp từ một bộ học (chỉ câu trắc nghiệm một đáp án) — trả PIN 6 số
 *     tags: [LiveQuiz]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: "{ session, pin }" }
 */
router.post("/live-quiz", ...guard, idempotencyKey("quiz-create"), validateBody(createSessionSchema), controller.create);

/**
 * @openapi
 * /live-quiz/join:
 *   post:
 *     summary: Vào phòng bằng PIN (QUIZ_001 PIN sai/hết hạn, QUIZ_002 đã kết thúc, QUIZ_003 đầy, QUIZ_010 đã bị mời ra, PERM_001 phiên workspace mà không phải thành viên); quá 10 lần/phút/người → 429
 *     tags: [LiveQuiz]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ sessionId, snapshot }" }
 */
router.post(
  "/live-quiz/join",
  ...guard,
  scopeLimiter("quiz-join", byUser, [{ max: LIMITS.liveQuiz.joinPerMinute, windowSeconds: 60 }]),
  validateBody(joinSchema),
  controller.join
);

/**
 * @openapi
 * /live-quiz/{id}:
 *   get:
 *     summary: Snapshot phiên cho host hoặc người chơi (không kèm đáp án câu đang mở; PIN chỉ host thấy)
 *     tags: [LiveQuiz]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ id, status, phase, pin? (chỉ host), hostId, setId, setTitle, currentIndex, total, question? { index, prompt, options, deadlineAt, questionStartedAt } (không đáp án), players[], playersCount, leaderboardTop[], me, answeredCount? (chỉ host, đang có câu), reveal? (chỉ pha REVEAL), version, serverNow (epoch ms) }" }
 */
router.get("/live-quiz/:id", ...guard, validateParams(idParamSchema), controller.get);

/**
 * @openapi
 * /live-quiz/{id}/results:
 *   get:
 *     summary: Kết quả bền của phiên (sau khi kết thúc và `live-quiz.persist` chạy) — chỉ host hoặc người đã chơi; chưa ghi xong → 200 persisted=false + results rỗng (client thăm dò lại)
 *     tags: [LiveQuiz]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ sessionId, setId, setTitle, status, total, persisted, results[{ userId, nickname, score, correct, answered, rank, answers[] }] }" }
 */
router.get("/live-quiz/:id/results", ...guard, validateParams(idParamSchema), controller.results);

/**
 * @openapi
 * /me/live-quiz/history:
 *   get:
 *     summary: Lịch sử thi trực tiếp của tôi (mới → cũ, phân trang cursor)
 *     tags: [LiveQuiz]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data[{ sessionId, setId, setTitle, endedAt, total, score, correct, answered, rank, createdAt }], meta{ nextCursor, hasMore, limit }" }
 */
router.get("/me/live-quiz/history", ...guard, validateQuery(historyQuerySchema), controller.history);

/**
 * @openapi
 * /live-quiz/{id}/start:
 *   post:
 *     summary: Host bắt đầu phiên (CAS `expectedVersion` — RES_003 khi lệch, QUIZ_007 sai trạng thái). Tương tự /next (khi câu ĐANG MỞ = chốt câu sớm, công bố ngay; khi đã công bố = sang câu kế), /end, /cancel.
 *     tags: [LiveQuiz]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: snapshot }
 */
router.post("/live-quiz/:id/start", ...guard, validateParams(idParamSchema), validateBody(commandSchema), controller.start);
router.post("/live-quiz/:id/next", ...guard, validateParams(idParamSchema), validateBody(commandSchema), controller.next);
router.post("/live-quiz/:id/end", ...guard, validateParams(idParamSchema), validateBody(commandSchema), controller.end);
router.post("/live-quiz/:id/cancel", ...guard, validateParams(idParamSchema), validateBody(commandSchema), controller.cancel);

/**
 * @openapi
 * /live-quiz/{id}/kick:
 *   post:
 *     summary: Host mời một người chơi ra khỏi phòng (không vào lại được)
 *     tags: [LiveQuiz]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã mời ra }
 */
router.post("/live-quiz/:id/kick", ...guard, validateParams(idParamSchema), validateBody(kickSchema), controller.kick);

export default router;
