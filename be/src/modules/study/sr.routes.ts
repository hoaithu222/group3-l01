import { Router } from "express";
import { apiLimiter, authenticateToken, requireFeature, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { createSrController } from "./controllers/sr.controller";
import { dueQuerySchema, enrollmentParamSchema, enrollSchema, reviewSchema, summaryQuerySchema } from "./dtos";
import type { SrReviewService } from "./services/sr-review.service";
import type { SrService } from "./services/sr.service";

const REVIEWS_PER_MINUTE = 300;

/**
 * Ôn tập ngắt quãng SM-2 (p4-02 be.md §4) — mount ở root v1 qua `study.routes.ts`. Mọi route cần cờ `study`; tiến độ chỉ của CHÍNH
 * người dùng, và chỉ trả thẻ của bộ họ còn ĐỌC ĐƯỢC (mất quyền → `SUSPENDED`, không lộ nội dung).
 */
export function createSrRouter(sr: SrService, reviews: SrReviewService): Router {
  const router = Router();
  const c = createSrController(sr, reviews);
  const guard = [authenticateToken, requireFeature(MODULES.STUDY), apiLimiter];
  const reviewLimiter = scopeLimiter("sr-review", (req) => req.user?.id ?? null, [{ max: REVIEWS_PER_MINUTE, windowSeconds: 60 }]);

  /**
   * @openapi
   * /sr/enrollments:
   *   post:
   *     summary: Đăng ký ôn theo lịch cả bộ (mọi mục thành thẻ NEW; mỗi ngày đưa tối đa newPerDay thẻ mới). SR_002 bộ không có mục
   *     tags: [Study/SR]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       201: { description: "{ setId, enrolledItems, newPerDay }" }
   */
  router.post("/sr/enrollments", ...guard, validateBody(enrollSchema), c.enroll);

  /**
   * @openapi
   * /sr/enrollments/{setId}:
   *   delete:
   *     summary: Bỏ đăng ký ôn bộ (tiến độ giữ nguyên, ngừng đưa thẻ MỚI)
   *     tags: [Study/SR]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       204: { description: Đã bỏ đăng ký }
   */
  router.delete("/sr/enrollments/:setId", ...guard, validateParams(enrollmentParamSchema), c.unenroll);

  /**
   * @openapi
   * /sr/due:
   *   get:
   *     summary: "Hàng đợi ôn hôm nay (ngày địa phương): thẻ LEARNING/REVIEW đến hạn + thẻ NEW theo ngân sách/ngày, KÈM nội dung (có đáp án)"
   *     tags: [Study/SR]
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { name: setId, in: query, schema: { type: string } }
   *       - { name: limit, in: query, schema: { type: integer, maximum: 50 } }
   *     responses:
   *       200: { description: "{ items: SrDueItemDto[], remainingToday, serverNow }" }
   */
  router.get("/sr/due", ...guard, validateQuery(dueQuerySchema), c.due);

  /**
   * @openapi
   * /sr/review:
   *   post:
   *     summary: Ghi một lượt ôn (AGAIN|HARD|GOOD|EASY) — idempotent theo clientReviewId. 404 mất quyền bộ, SR_001 thẻ tạm ngừng, SR_003 quá số thẻ/ngày
   *     tags: [Study/SR]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "{ progress: SrProgressDto, remainingToday }" }
   */
  router.post("/sr/review", ...guard, reviewLimiter, validateBody(reviewSchema), c.review);

  /**
   * @openapi
   * /sr/summary:
   *   get:
   *     summary: Tóm tắt hôm nay/7 ngày tới + chuỗi ngày ôn liên tiếp
   *     tags: [Study/SR]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "{ dueToday, newToday, dueNext7Days[{date,count}], reviewedToday, reviewStreakDays, serverNow }" }
   */
  router.get("/sr/summary", ...guard, validateQuery(summaryQuerySchema), c.summary);

  return router;
}
