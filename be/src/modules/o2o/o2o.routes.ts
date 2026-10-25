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
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { getO2oContainer } from "./o2o.container";
import { createO2oController } from "./controllers/o2o.controller";
import {
  cancelOrderSchema,
  createOrderSchema,
  myOrdersQuerySchema,
  nearQuerySchema,
  quoteSchema,
  reviewSchema,
  reviewsQuerySchema,
  updateOrderSchema,
} from "./dtos";
import { registerO2oModule } from "./index";

registerO2oModule();
const c = createO2oController(getO2oContainer().services);

// Mọi route: đăng nhập → cờ `o2o` (tắt → 404 CFG_005) → rate limit theo user.
const M = [authenticateToken, requireFeature(MODULES.O2O), apiLimiter] as const;
const byUser = (req: { user?: { id: string } }) => req.user?.id ?? null;
const perHour = (max: number) => [{ max, windowSeconds: 3600 }];

const router = Router();

/**
 * @openapi
 * /locations/near:
 *   get: { summary: "Địa điểm quanh vị trí (≤ 50, theo khoảng cách, có distanceM/openNow/shop) — toạ độ không được lưu", tags: [O2O], security: [{ BearerAuth: [] }] }
 * /locations/{id}:
 *   get: { summary: "Chi tiết địa điểm: giờ mở, ảnh (URL ký), 5 đánh giá mới, đánh giá của tôi, tiệm in (bảng giá)", tags: [O2O], security: [{ BearerAuth: [] }] }
 * /locations/{id}/reviews:
 *   get: { summary: "Đánh giá (cursor, bỏ đánh giá bị ẩn)", tags: [O2O], security: [{ BearerAuth: [] }] }
 * /locations/{id}/reviews/me:
 *   put: { summary: "Viết/sửa đánh giá của tôi (sao + độ ồn + bình luận)", tags: [O2O], security: [{ BearerAuth: [] }] }
 *   delete: { summary: "Xoá đánh giá của tôi", tags: [O2O], security: [{ BearerAuth: [] }] }
 */
router.get("/locations/near", ...M, validateQuery(nearQuerySchema), c.near);
router.get("/locations/:id", ...M, validateParams(idParamSchema), c.locationDetail);
router.get("/locations/:id/reviews", ...M, validateParams(idParamSchema), validateQuery(reviewsQuerySchema), c.listReviews);
router.put("/locations/:id/reviews/me", ...M, validateParams(idParamSchema), validateBody(reviewSchema), c.putMyReview);
router.delete("/locations/:id/reviews/me", ...M, validateParams(idParamSchema), c.deleteMyReview);

/**
 * @openapi
 * /print-shops/{id}:
 *   get: { summary: "Tiệm in công khai (bảng giá, năng lực, nhận đơn) — 404 nếu chưa duyệt", tags: [O2O], security: [{ BearerAuth: [] }] }
 * /print-shops/{id}/quote:
 *   post: { summary: "Báo giá thử (không lưu) — O2O_002/O2O_012", tags: [O2O], security: [{ BearerAuth: [] }] }
 */
router.get("/print-shops/:id", ...M, validateParams(idParamSchema), c.getShop);
router.post("/print-shops/:id/quote", ...M, validateParams(idParamSchema), validateBody(quoteSchema), c.quote);

/**
 * @openapi
 * /print-orders:
 *   get: { summary: "Đơn in của tôi (cursor, group=ACTIVE|DONE|CLOSED)", tags: [O2O], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Tạo đơn DRAFT từ tài liệu Resource Hub hoặc PDF tải lên (Idempotency-Key) — đếm trang ở job", tags: [O2O], security: [{ BearerAuth: [] }] }
 * /print-orders/{id}:
 *   get: { summary: "Chi tiết đơn (không có PIN)", tags: [O2O], security: [{ BearerAuth: [] }] }
 *   patch: { summary: "Sửa cấu hình in (DRAFT/QUOTED, expectedVersion) — báo giá lại", tags: [O2O], security: [{ BearerAuth: [] }] }
 * /print-orders/{id}/submit:
 *   post: { summary: "Gửi đơn → PENDING, trả PIN 6 số DUY NHẤT lần này (10/giờ/người)", tags: [O2O], security: [{ BearerAuth: [] }] }
 * /print-orders/{id}/pin/reveal:
 *   post: { summary: "Tạo PIN mới (PIN cũ vô hiệu) — PENDING..READY", tags: [O2O], security: [{ BearerAuth: [] }] }
 * /print-orders/{id}/cancel:
 *   post: { summary: "Huỷ đơn (DRAFT/QUOTED/PENDING/ACCEPTED — O2O_004 khi đang in)", tags: [O2O], security: [{ BearerAuth: [] }] }
 */
router.get("/print-orders", ...M, validateQuery(myOrdersQuerySchema), c.listOrders);
router.post("/print-orders", ...M, idempotencyKey("print-order"), validateBody(createOrderSchema), c.createOrder);
router.get("/print-orders/:id", ...M, validateParams(idParamSchema), c.getOrder);
router.patch("/print-orders/:id", ...M, validateParams(idParamSchema), validateBody(updateOrderSchema), c.updateOrder);
router.post(
  "/print-orders/:id/submit",
  ...M,
  validateParams(idParamSchema),
  scopeLimiter("print-submit", byUser, perHour(LIMITS.o2o.submitPerHour)),
  c.submitOrder
);
router.post(
  "/print-orders/:id/pin/reveal",
  ...M,
  validateParams(idParamSchema),
  scopeLimiter("print-pin-regenerate", byUser, perHour(LIMITS.o2o.submitPerHour)),
  c.regeneratePin
);
router.post("/print-orders/:id/cancel", ...M, validateParams(idParamSchema), validateBody(cancelOrderSchema), c.cancelOrder);

export default router;
