import { Router } from "express";
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
import { bodyLimit } from "../../core/middlewares/body-limit";
import { MODULES } from "../../core/constants/modules";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createMockAttemptController } from "./controllers/mock-attempt.controller";
import { attemptEventSchema, createAttemptSchema, listAttemptsQuerySchema, putAnswersSchema, submitSchema } from "./dtos";
import type { MockAttemptService } from "./services/mock-attempt.service";

const ANSWERS_PER_MINUTE = 120;
/** Thân `PUT answers`/`submit` ≤ 256 KB (be.md §9). */
const ANSWERS_BODY_MAX_BYTES = 256 * 1024;

/**
 * Thi thử (p4-02 be.md §4) — mount ở root v1 qua `study.routes.ts` (path tuyệt đối). Mọi route cần cờ `study`; lượt thi chỉ CHỦ LƯỢT
 * thấy (người khác/admin → 404 trung tính). Đề chưa nộp KHÔNG có `correctOptionIds`/`acceptedAnswers`/`explanation`.
 */
export function createMockRouter(service: MockAttemptService): Router {
  const router = Router();
  const c = createMockAttemptController(service);
  const guard = [authenticateToken, requireFeature(MODULES.STUDY), apiLimiter];
  const id = validateParams(idParamSchema);
  const answersLimiter = scopeLimiter("mock-answers", (req) => req.user?.id ?? null, [{ max: ANSWERS_PER_MINUTE, windowSeconds: 60 }]);

  /**
   * @openapi
   * /study-sets/{id}/mock-attempts:
   *   post:
   *     summary: Bắt đầu thi thử (Idempotency-Key) — snapshot câu hỏi, đề KHÔNG kèm đáp án. MOCK_001 không có câu chấm được, MOCK_002 còn lượt dở (details.attemptId), MOCK_006 quá số lượt/ngày
   *     tags: [Study/Mock]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       201: { description: "{ attempt, questions[] (không đáp án), expiresAt, serverNow }" }
   */
  router.post("/study-sets/:id/mock-attempts", ...guard, id, idempotencyKey("mock-create"), validateBody(createAttemptSchema), c.create);

  /**
   * @openapi
   * /study-sets/{id}/mock-attempts:
   *   get:
   *     summary: Lịch sử thi thử của TÔI trong một bộ (cursor theo startedAt)
   *     tags: [Study/Mock]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "data: MockAttemptSummaryDto[], meta: { nextCursor, hasMore, limit }" }
   */
  router.get("/study-sets/:id/mock-attempts", ...guard, id, validateQuery(listAttemptsQuerySchema), c.listBySet);

  /**
   * @openapi
   * /me/mock-attempts:
   *   get:
   *     summary: Lịch sử thi thử của tôi (mọi bộ, cursor)
   *     tags: [Study/Mock]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "data: MockAttemptSummaryDto[], meta: { nextCursor, hasMore, limit }" }
   */
  router.get("/me/mock-attempts", ...guard, validateQuery(listAttemptsQuerySchema), c.listMine);

  /**
   * @openapi
   * /mock-attempts/{id}:
   *   get:
   *     summary: Đang làm → { attempt, questions (không đáp án), myAnswers, serverNow }; đã kết thúc → MockResultDto (đáp án + giải thích + correct từng câu)
   *     tags: [Study/Mock]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "MockInProgressDto | MockResultDto" }
   */
  router.get("/mock-attempts/:id", ...guard, id, c.get);

  /**
   * @openapi
   * /mock-attempts/{id}/answers:
   *   put:
   *     summary: Lưu đáp án theo lô ≤ 50 (idempotent theo câu). MOCK_003 quá hạn (expiresAt + 5 s), MOCK_004 đã nộp, MOCK_005 câu/lựa chọn không thuộc đề
   *     tags: [Study/Mock]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "{ answeredCount, serverNow }" }
   */
  router.put("/mock-attempts/:id/answers", ...guard, id, answersLimiter, bodyLimit(ANSWERS_BODY_MAX_BYTES), validateBody(putAnswersSchema), c.putAnswers);

  /**
   * @openapi
   * /mock-attempts/{id}/events:
   *   post:
   *     summary: Ghi nhận rời/vào lại app (BACKGROUND|FOREGROUND) — chỉ đếm, không ảnh hưởng điểm; lượt đã kết thúc/trùng clientEventId/quá 200 sự kiện → 204 êm
   *     tags: [Study/Mock]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       204: { description: Đã ghi nhận }
   */
  router.post("/mock-attempts/:id/events", ...guard, id, validateBody(attemptEventSchema), c.recordEvent);

  /**
   * @openapi
   * /mock-attempts/{id}/submit:
   *   post:
   *     summary: Nộp bài (chấm ở server). Nộp lại → trả CÙNG kết quả (200). `answers` gửi kèm sau hạn bị bỏ qua (lateAnswersIgnored)
   *     tags: [Study/Mock]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: MockResultDto }
   */
  router.post("/mock-attempts/:id/submit", ...guard, id, bodyLimit(ANSWERS_BODY_MAX_BYTES), validateBody(submitSchema), c.submit);

  return router;
}
